# 6. Azure Portal Deployment Guide

The same deployment as `02-azure-deployment-guide.md`, done through the Azure portal
(https://portal.azure.com) instead of the CLI. Only the steps that run **on the VM** (installing Python,
Nginx, the certificate) use a terminal, because they cannot be done from the portal.

Read `05-prerequisites-cost-and-free-account.md` first.

The portal changes its layout from time to time. If a label is slightly different, look for the same
setting nearby. Take a screenshot at the end of each section.

## Names used

Use one region for everything (examples use **Central India**). Names marked * must be unique, so add your
initials or a number.

| Resource | Name |
|---|---|
| Resource group | `rg-employee-app` |
| Virtual network | `vnet-employee` |
| Subnets | `snet-app` (10.0.1.0/24), `snet-private-endpoints` (10.0.2.0/24) |
| Network security group | `nsg-app` |
| Virtual machine | `vm-employee-api` |
| VM DNS name label* | `employee-api-<initials>` |
| SQL server* | `sql-employee-<initials>` |
| SQL database | `employeedb` |
| Storage account* | `stemployee<initials>` (lowercase letters and numbers only) |
| Blob container | `employee-files` |
| Static Web App | `swa-employee` |

---

## Step 1 – Resource group

1. Search **Resource groups** → **+ Create**.
2. Subscription: your subscription. Name: `rg-employee-app`. Region: Central India.
3. **Review + create** → **Create**.

All following resources go into this resource group and region.

## Step 2 – Virtual network and subnets (Task 5)

1. Search **Virtual networks** → **+ Create**.
2. **Basics**: resource group `rg-employee-app`, name `vnet-employee`, region Central India.
3. **Security** tab: leave everything off (Bastion, Firewall, DDoS add cost).
4. **IP addresses** tab:
   - Address space: `10.0.0.0/16`.
   - Edit the `default` subnet (pencil icon): name `snet-app`, starting address `10.0.1.0`, size `/24`. Save.
   - **+ Add a subnet**: name `snet-private-endpoints`, starting address `10.0.2.0`, size `/24`. Add.
5. **Review + create** → **Create**.

## Step 3 – Network security group (Task 5)

1. Search **Network security groups** → **+ Create**.
2. Resource group `rg-employee-app`, name `nsg-app`, region Central India → **Review + create** → **Create**.
3. Open `nsg-app` → **Settings → Inbound security rules** → **+ Add**. Add three rules:

   | Name | Source | Source IP | Destination port | Protocol | Action | Priority |
   |---|---|---|---|---|---|---|
   | `Allow-HTTPS` | Any | – | 443 | TCP | Allow | 100 |
   | `Allow-HTTP` | Any | – | 80 | TCP | Allow | 110 |
   | `Allow-SSH-MyIP` | IP Addresses | your public IP | 22 | TCP | Allow | 120 |

   Port 80 is only for the certificate check and the redirect to HTTPS.
4. **Settings → Subnets** → **+ Associate** → virtual network `vnet-employee`, subnet `snet-app` → **OK**.

Screenshot: the inbound rules list (the default rules at 65000+ show that everything else is denied).

## Step 4 – Virtual machine (Task 1)

1. Search **Virtual machines** → **+ Create** → **Azure virtual machine**.
2. **Basics**:
   - Resource group `rg-employee-app`, name `vm-employee-api`, region Central India
   - Availability options: No infrastructure redundancy required
   - Security type: Trusted launch (default)
   - Image: **Ubuntu Server 24.04 LTS – x64 Gen2**
   - Size: a free-account size – **Standard_B1s**, or **Standard_B2ats_v2** if B1s shows "not available"
     (this deployment used B2ats_v2 in Central India). Use "See all sizes" and search.
   - Authentication type: **SSH public key**, username `azureuser`, key source **Use existing public key**,
     paste the contents of a public key created on your Mac:
     `ssh-keygen -t ed25519 -f ~/.ssh/azure_employee_vm` then `cat ~/.ssh/azure_employee_vm.pub`
   - Public inbound ports: **None** (the subnet NSG controls access)
3. **Disks**: OS disk size **64 GiB (P6)**, type **Premium SSD** – exactly the free-account disk. Leave
   "Delete with VM" ticked.
4. **Networking**:
   - Virtual network `vnet-employee`, subnet `snet-app`
   - Public IP: (new) – default is fine
   - NIC network security group: **None** (the subnet already has `nsg-app`)
   - Tick "Delete public IP and NIC when VM is deleted"
5. **Management**: leave auto-shutdown off. 750 free hours a month covers running all month.
6. **Review + create** → **Create**.
7. Turn on the managed identity: VM → **Security → Identity** → System assigned **On** → **Save** → **Yes**.
   Note the Object (principal) ID.
8. Set a DNS name for the VM:
   - Open the VM → **Overview** → click the **Public IP address**.
   - **Settings → Configuration**: DNS name label `employee-api-<initials>` → **Apply** (assignment is already Static).
   - The hostname is now `employee-api-<initials>.centralindia.cloudapp.azure.com`.

Test the SSH connection from your Mac:

```bash
ssh -i ~/.ssh/azure_employee_vm azureuser@employee-api-<initials>.centralindia.cloudapp.azure.com
```

## Step 5 – Azure SQL Database (Task 4)

1. Search **SQL databases** → **+ Create**.
2. If a banner says **"Want to try Azure SQL Database for free?"** click **Apply offer**. This gives a
   free serverless database every month (recommended). Otherwise choose the Basic tier in step 4 below.
3. **Basics**:
   - Resource group `rg-employee-app`, database name `employeedb`
   - Server: **Create new** → name `sql-employee-<initials>`, location Central India,
     authentication **Use Microsoft Entra-only authentication**; the Microsoft Entra admin is set to your
     own account automatically → **OK**. No SQL password is created.
   - Want to use SQL elastic pool: No
   - Free offer: behaviour when free limit is reached → **Auto-pause the database until next month**
4. Only if the free offer is not used: Workload environment Development → Compute + storage →
   **Configure database** → Service tier **Basic** → Apply. Backup storage redundancy: Locally-redundant.
5. **Networking**:
   - Connectivity method: **Public endpoint** (for now, so the table can be created from the portal)
   - Allow Azure services and resources to access this server: **No**
   - Add current client IP address: **Yes**
   - Connection policy: Default. Minimum TLS version: 1.2
6. **Review + create** → **Create** (takes a few minutes).
7. Open `employeedb` → **Query editor** → **Connect as <your account>** → **New query**, paste and **Run**:

   ```sql
   CREATE TABLE Employees (EmployeeId INT IDENTITY(1,1) PRIMARY KEY, EmployeeName NVARCHAR(100) NOT NULL,
     Email NVARCHAR(255) NOT NULL UNIQUE, Department NVARCHAR(100) NOT NULL, ProfileImageUrl NVARCHAR(500) NULL);
   CREATE USER [vm-employee-api] FROM EXTERNAL PROVIDER;
   ALTER ROLE db_datareader ADD MEMBER [vm-employee-api];
   ALTER ROLE db_datawriter ADD MEMBER [vm-employee-api];
   ```

   The last three lines let the VM's managed identity log in and read/write data – nothing more.

## Step 6 – Private Endpoint and Private DNS for SQL (Task 5)

Skip this step if you only need to explain Private Endpoint (it costs ≈ USD 7/month). In that case add the
VM's public IP in the SQL server's **Networking → Firewall rules** instead.

1. Open the SQL **server** `sql-employee-<initials>` (not the database) → **Security → Networking**.
2. **Private access** tab → **+ Create a private endpoint**:
   - **Basics**: resource group `rg-employee-app`, name `pe-sql`, region Central India
   - **Resource**: target sub-resource `sqlServer`
   - **Virtual Network**: `vnet-employee`, subnet `snet-private-endpoints`, dynamic IP
   - **DNS**: Integrate with private DNS zone **Yes**, zone `privatelink.database.windows.net` (new)
   - **Review + create** → **Create**
3. When it finishes, check:
   - Search **Private DNS zones** → `privatelink.database.windows.net` → it has an **A record**
     `sql-employee-<initials>` → `10.0.2.4` (or similar), and under **Virtual network links** the VNet is listed.
   - Private endpoint `pe-sql` → **Overview** shows the private IP.
4. Back on the SQL server → **Networking** → **Public access** tab → Public network access **Disable** → **Save**.

From now on the Query editor in the portal will not connect – that is expected. The database is only
reachable from inside the VNet.

Screenshot: Networking page with public access disabled, the private endpoint (status Approved), and the
DNS zone record.

## Step 7 – Storage account and container (Task 3)

1. Search **Storage accounts** → **+ Create**.
2. **Basics**: resource group `rg-employee-app`, name `stemployee<initials>`, region Central India,
   primary service **Azure Blob Storage or Azure Data Lake Storage Gen 2**, performance **Standard**,
   redundancy **Locally-redundant storage (LRS)**.
3. **Advanced**:
   - Require secure transfer for REST API operations: **ticked**
   - Allow enabling anonymous access on individual containers: **not ticked**
   - Enable storage account key access: leave ticked (used by the portal; the API uses its managed identity)
   - Minimum TLS version: **1.2**
   - Access tier: **Hot**
4. **Networking**: Public access from all networks (the browser loads pictures directly with a SAS URL).
5. **Review + create** → **Create**.
6. Open the account → **Data storage → Containers** → **+ Add container** → name `employee-files`,
   anonymous access level **Private (no anonymous access)** → **Create**.
7. **Access Control (IAM)** → **Add role assignment** → role **Storage Blob Data Contributor** → Members:
   **Managed identity** → Virtual machine → `vm-employee-api` → **Review + assign**.
   This lets the API upload, delete and sign SAS links without any account key.

## Step 8 – Install and run the API on the VM (Task 1)

This step is done in the terminal; the portal has no equivalent. From your Mac, in the project folder:

```bash
KEY=~/.ssh/azure_employee_vm
HOST=employee-api-<initials>.centralindia.cloudapp.azure.com

ssh -i $KEY azureuser@$HOST "mkdir -p employee-app"
scp -i $KEY -r employee-app/backend employee-app/deploy azureuser@$HOST:employee-app/
ssh -i $KEY azureuser@$HOST
```

Then on the VM follow **sections 7 and 8 of `02-azure-deployment-guide.md`** exactly:

- install Python, Nginx and the Microsoft ODBC Driver 18
- add a 1 GB swap file (the VM has 1 GB RAM):
  `sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`
  and add `/swapfile none swap sw 0 0` to `/etc/fstab`
- create the virtual environment and install `requirements.txt`
- create `.env` – it contains no secrets:

  ```
  SQL_SERVER=sql-employee-<initials>.database.windows.net
  SQL_DATABASE=employeedb
  STORAGE_ACCOUNT_URL=https://stemployee<initials>.blob.core.windows.net
  BLOB_CONTAINER=employee-files
  ALLOWED_ORIGINS=https://<static-web-app>.azurestaticapps.net
  ```

  Leaving `SQL_USER` empty makes the API use the managed identity for SQL; leaving the storage
  connection string empty makes it use the managed identity for Blob Storage.

- check `nslookup <server name>` returns a `10.0.2.x` address (if Step 6 was done)
- start the systemd service, configure Nginx with your hostname, and run certbot for HTTPS:
  `sudo certbot --nginx -d <hostname> --redirect --agree-tos --register-unsafely-without-email`

Check in a browser: `https://employee-api-<initials>.centralindia.cloudapp.azure.com/api/health`
shows `{"status":"ok"}` with a padlock. `/docs` shows the API test page.

**Alternative to SSH:** the VM's **Run command → RunShellScript** page in the portal can run the install
commands, but copying the code and editing `.env` is much easier over SSH.

## Step 9 – Push the code to GitHub

On github.com create a new repository (private is fine), then on your Mac:

```bash
cd /path/to/Azure                    # the folder containing employee-app and docs
git init
git add .
git commit -m "Employee management app"
git branch -M main
git remote add origin https://github.com/<your-user>/<repo>.git
git push -u origin main
```

`.gitignore` keeps `.env`, `node_modules` and build output out of the repository.

Before pushing, set the API URL in `employee-app/frontend/.env.production`:

```
VITE_API_URL=https://employee-api-<initials>.centralindia.cloudapp.azure.com
```

## Step 10 – Static Web App (Task 2)

1. Search **Static Web Apps** → **+ Create**.
2. **Basics**:
   - Resource group `rg-employee-app`, name `swa-employee`
   - Plan type: **Free**
   - Region for Azure Functions API and staging environments: nearest available
   - Deployment source: **GitHub** → **Sign in with GitHub** → authorise
   - Organization / Repository / Branch: your repo, `main`
3. **Build Details**:
   - Build presets: **React**
   - App location: `/employee-app/frontend`
   - Api location: *(leave empty)*
   - Output location: `dist`
4. **Review + create** → **Create**.
5. Azure adds a workflow file to `.github/workflows/` in your repository. On GitHub open **Actions** and wait
   for the run to turn green (2–3 minutes).
6. Open the Static Web App → **Overview** → copy the **URL** (`https://<random-name>.azurestaticapps.net`).

Run `git pull` on your Mac afterwards so you have the workflow file locally.

## Step 11 – CORS (Task 2)

On the VM, put the Static Web App URL in `.env` (no trailing slash) and restart the API:

```bash
nano ~/employee-app/backend/.env
# ALLOWED_ORIGINS=https://<random-name>.azurestaticapps.net
sudo systemctl restart employee-api
```

## Step 12 – Test the workflow (Task 6)

1. Open the Static Web App URL.
2. Add an employee with a picture → it appears in the list with the picture.
3. **Documents** → upload a PDF → it appears as a link.
4. Edit and delete a test employee.

See it in the portal:

- Storage account → Containers → `employee-files` → `profile-pictures/` and `documents/` folders.
  Click a blob and open its URL in a new tab → access error, because the container is private.
- SQL rows: the Query editor no longer works after Step 6. Either run a query from the VM, or temporarily set
  public access to "Selected networks" with your IP, run `SELECT * FROM Employees;`, take the screenshot and
  disable it again.

Use the evidence checklist and troubleshooting table in `02-azure-deployment-guide.md`.

## Step 13 – Clean up

Resource groups → `rg-employee-app` → **Delete resource group** → type the name → **Delete**.
This removes everything created in this guide. Delete the GitHub repository separately if no longer needed.

To pause instead of deleting: VM → **Stop**. (The Static Web App, storage and SQL free offer cost nothing
while idle; the public IP and private endpoint are still charged.)
