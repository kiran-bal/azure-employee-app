# 2. Azure Deployment Guide

Step-by-step deployment using the Azure CLI. Every step can also be done in the portal; the CLI is used here
so the steps are repeatable. Take a screenshot after each section for the submission.

For the same steps through the Azure portal, see `06-portal-deployment-guide.md`.
For prerequisites, cost and the free account, see `05-prerequisites-cost-and-free-account.md`.
Delete the resource group after the evaluation (section 12).

## 0. Prerequisites

- Azure subscription, Azure CLI (`az login`), Git, Node.js, Python 3
- A GitHub account (for Static Web Apps)

Set the names once. The SQL server, storage account and DNS label must be globally unique, so change the suffix.

```bash
RG=rg-employee-app
LOCATION=centralindia
VNET=vnet-employee
NSG=nsg-app
VM=vm-employee-api
DNS_LABEL=employee-api-demo            # change: must be unique in the region
SQL_SERVER=sql-employee-demo123        # change: must be globally unique
SQL_DB=employeedb
SQL_ADMIN=sqladmin
SQL_PASSWORD='<choose-a-strong-password>'
STORAGE=stemployeedemo123              # change: lowercase letters and numbers only
MY_IP=$(curl -s https://ifconfig.me)

az group create --name $RG --location $LOCATION
```

## 1. Virtual network and subnets (Task 5)

```bash
az network vnet create --resource-group $RG --name $VNET \
  --address-prefix 10.0.0.0/16 \
  --subnet-name snet-app --subnet-prefix 10.0.1.0/24

az network vnet subnet create --resource-group $RG --vnet-name $VNET \
  --name snet-private-endpoints --address-prefix 10.0.2.0/24
```

## 2. Network Security Group (Task 5)

```bash
az network nsg create --resource-group $RG --name $NSG

az network nsg rule create --resource-group $RG --nsg-name $NSG --name Allow-HTTPS \
  --priority 100 --direction Inbound --access Allow --protocol Tcp --destination-port-ranges 443

az network nsg rule create --resource-group $RG --nsg-name $NSG --name Allow-HTTP \
  --priority 110 --direction Inbound --access Allow --protocol Tcp --destination-port-ranges 80

az network nsg rule create --resource-group $RG --nsg-name $NSG --name Allow-SSH-MyIP \
  --priority 120 --direction Inbound --access Allow --protocol Tcp --destination-port-ranges 22 \
  --source-address-prefixes $MY_IP

az network vnet subnet update --resource-group $RG --vnet-name $VNET --name snet-app \
  --network-security-group $NSG
```

Port 80 is needed for the Let's Encrypt certificate check and is redirected to HTTPS by Nginx.
Everything else inbound is blocked by the default `DenyAllInBound` rule.

## 3. Virtual machine (Task 1)

```bash
az vm create --resource-group $RG --name $VM \
  --image Ubuntu2404 --size Standard_B1s \
  --admin-username azureuser --generate-ssh-keys \
  --vnet-name $VNET --subnet snet-app --nsg "" \
  --public-ip-sku Standard --public-ip-address-dns-name $DNS_LABEL
```

`--nsg ""` stops the CLI creating a second NSG on the network card; the subnet NSG is used instead.

The API hostname is now `$DNS_LABEL.$LOCATION.cloudapp.azure.com`
(for example `employee-api-demo.centralindia.cloudapp.azure.com`).

## 4. Azure SQL Database (Task 4)

```bash
az sql server create --resource-group $RG --name $SQL_SERVER --location $LOCATION \
  --admin-user $SQL_ADMIN --admin-password "$SQL_PASSWORD"

# Free offer (serverless, pauses until next month when the free allowance is used)
az sql db create --resource-group $RG --server $SQL_SERVER --name $SQL_DB \
  --edition GeneralPurpose --compute-model Serverless --family Gen5 --capacity 2 \
  --use-free-limit --free-limit-exhaustion-behavior AutoPause \
  --backup-storage-redundancy Local

# Or, if the free offer is not available on the subscription, the Basic tier (≈ USD 5/month):
# az sql db create --resource-group $RG --server $SQL_SERVER --name $SQL_DB \
#   --service-objective Basic --backup-storage-redundancy Local
```

Create the table:

1. Portal → SQL database → **Query editor**. Sign in with the SQL admin login.
   The portal will offer to add your client IP to the server firewall – accept it.
2. Paste and run `employee-app/database/schema.sql`.

(The API also creates the table at startup if it does not exist, so this step can be skipped, but running the
script shows the table design.)

## 5. Private Endpoint and Private DNS for SQL (Task 5)

```bash
SQL_ID=$(az sql server show --resource-group $RG --name $SQL_SERVER --query id -o tsv)

# Private endpoint: gives the SQL server a private IP inside the VNet
az network private-endpoint create --resource-group $RG --name pe-sql \
  --vnet-name $VNET --subnet snet-private-endpoints \
  --private-connection-resource-id $SQL_ID --group-id sqlServer \
  --connection-name pe-sql-connection

# Private DNS zone: makes the normal server name resolve to that private IP
az network private-dns zone create --resource-group $RG \
  --name privatelink.database.windows.net

az network private-dns link vnet create --resource-group $RG \
  --zone-name privatelink.database.windows.net --name link-vnet-employee \
  --virtual-network $VNET --registration-enabled false

az network private-endpoint dns-zone-group create --resource-group $RG \
  --endpoint-name pe-sql --name sql-zone-group \
  --private-dns-zone privatelink.database.windows.net --zone-name sql

# Close the public door
az sql server update --resource-group $RG --name $SQL_SERVER --enable-public-network false
```

After the last command the portal Query editor on your laptop stops working. That is expected: the database
is now reachable only from inside the VNet.

If the private endpoint is not required to be built, skip this section and instead allow only the VM's
public IP in the SQL firewall. The explanation of Private Endpoint is still needed for the review.

## 6. Storage account and container (Task 3)

```bash
az storage account create --resource-group $RG --name $STORAGE --location $LOCATION \
  --sku Standard_LRS --kind StorageV2 \
  --allow-blob-public-access false --min-tls-version TLS1_2 --https-only true

az storage container create --account-name $STORAGE --name employee-files --auth-mode key

# needed for the API's .env file
az storage account show-connection-string --resource-group $RG --name $STORAGE -o tsv
```

## 7. Set up the VM (Task 1)

Copy the backend and deploy files to the VM, then connect:

```bash
HOST=$DNS_LABEL.$LOCATION.cloudapp.azure.com
ssh azureuser@$HOST "mkdir -p employee-app"
scp -r employee-app/backend employee-app/deploy azureuser@$HOST:employee-app/
ssh azureuser@$HOST
```

On the VM:

```bash
# Python, Nginx
sudo apt-get update
sudo apt-get install -y python3-venv python3-pip nginx

# Microsoft ODBC Driver 18 (needed to talk to Azure SQL)
curl -sSL -O https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
sudo apt-get update
sudo ACCEPT_EULA=Y apt-get install -y msodbcsql18 unixodbc-dev

# Application
cd ~/employee-app/backend
python3 -m venv venv
venv/bin/pip install -r requirements.txt
cp .env.example .env
nano .env          # SQL server, user, password, storage connection string
chmod 600 .env
```

Values for `.env`:

```
SQL_SERVER=<sql-server-name>.database.windows.net
SQL_DATABASE=employeedb
SQL_USER=sqladmin
SQL_PASSWORD=<password>
AZURE_STORAGE_CONNECTION_STRING=<connection string from section 6>
BLOB_CONTAINER=employee-files
ALLOWED_ORIGINS=http://localhost:5173
```

Check the private endpoint from the VM – the name must resolve to a `10.0.2.x` address:

```bash
nslookup <sql-server-name>.database.windows.net
```

Run the API as a service:

```bash
sudo cp ~/employee-app/deploy/employee-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now employee-api
sudo systemctl status employee-api
curl http://127.0.0.1:8000/api/health        # {"status":"ok"}
```

## 8. Nginx and HTTPS (Task 1 and 5)

On the VM. Edit the `server_name` line in the config so it matches your hostname.

```bash
sudo cp ~/employee-app/deploy/nginx-employee-api.conf /etc/nginx/sites-available/employee-api
sudo nano /etc/nginx/sites-available/employee-api      # set server_name
sudo ln -s /etc/nginx/sites-available/employee-api /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Certificate
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <your-hostname> --redirect -m <your-email> --agree-tos
```

Certbot adds the HTTPS block to the Nginx config and sets up automatic renewal.

Test from your laptop:

```bash
curl https://<your-hostname>/api/health
```

`https://<your-hostname>/docs` shows the interactive API page where every endpoint can be tried.

## 9. React frontend on Static Web Apps (Task 2)

1. Set the API URL in `employee-app/frontend/.env.production`:

   ```
   VITE_API_URL=https://<your-hostname>
   ```

2. Test the production build locally:

   ```bash
   cd employee-app/frontend
   npm install
   npm run build        # output goes to dist/
   ```

3. Push the project to a GitHub repository.

4. Portal → **Create a resource → Static Web App**:
   - Plan: Free
   - Source: GitHub, pick the repository and branch
   - Build preset: React
   - App location: `/employee-app/frontend`
   - Api location: (leave empty)
   - Output location: `dist`

   Azure adds a GitHub Actions workflow to the repository. Every push builds the app and deploys the
   static files. Wait for the workflow to go green, then open the Static Web App URL
   (`https://<random-name>.azurestaticapps.net`).

## 10. CORS (Task 2)

On the VM, put the Static Web App URL in `.env` (no trailing slash) and restart the API:

```bash
nano ~/employee-app/backend/.env
# ALLOWED_ORIGINS=https://<random-name>.azurestaticapps.net
sudo systemctl restart employee-api
```

## 11. Test the complete workflow (Task 6)

1. Open the Static Web App URL.
2. Enter name, email and department, choose a picture, click **Add employee**.
3. The employee appears in the list with the picture.
4. Click **Documents** and upload a PDF; it appears as a link.
5. Edit the employee, then delete a test employee.

Evidence to capture:

- [ ] Resource group overview showing all resources
- [ ] VNet with both subnets
- [ ] NSG inbound rules
- [ ] VM overview (size, DNS name) and `systemctl status employee-api`
- [ ] Browser showing `https://<hostname>/api/health` with the padlock
- [ ] SQL database overview, and Networking page showing public access disabled + private endpoint
- [ ] `nslookup` on the VM returning the private IP
- [ ] Storage container showing `profile-pictures/` and `documents/`, and access level Private
- [ ] Static Web App overview and the green GitHub Actions run
- [ ] The app with an employee and picture; browser Network tab showing the API call
- [ ] Rows in the Employees table (`SELECT * FROM Employees`, run from the VM or by temporarily enabling public access)

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Browser console: "blocked by CORS policy" | `ALLOWED_ORIGINS` does not exactly match the site URL, or the API was not restarted |
| Browser console: "Mixed content" | `VITE_API_URL` starts with `http://` |
| 502 Bad Gateway | API service is not running: `sudo journalctl -u employee-api -n 50` |
| 413 Request Entity Too Large | `client_max_body_size` missing in the Nginx config |
| Login timeout / cannot open server | `.env` SQL values wrong, or DNS not resolving to the private IP (check `nslookup`) |
| certbot fails | Port 80 not open in the NSG, or `server_name` does not match the hostname |
| Frontend still calls localhost | `.env.production` was not set before the build |
| First request after a long idle fails, then works | SQL free offer database was auto-paused and is resuming (about a minute) |

## 12. Clean up

```bash
az group delete --name $RG --yes --no-wait
```
