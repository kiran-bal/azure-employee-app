# 4. Likely Evaluator Questions

Short answers to practice. Say them in your own words, and point at the actual resource in the portal
where possible.

## General

**Why Python instead of .NET?**
I am more comfortable in Python, and the assessment is about Azure. Every Azure component is the same. On the
VM, Nginx + Uvicorn takes the place of IIS + Kestrel, SQLAlchemy takes the place of Entity Framework, and
the Azure Blob SDK is the Python version of the same library.

**Walk me through the architecture.**
React static files on Static Web Apps. The browser calls the API on the VM over HTTPS. The VM sits in a
subnet protected by an NSG. The API talks to Azure SQL through a private endpoint and to Blob Storage for
files. (Use the diagram in `01-architecture-and-design.md`.)

**What is a resource group and why one for everything?**
A logical container for resources that share a lifecycle. One group makes it easy to manage access, see
cost, and delete everything together.

**IaaS, PaaS, SaaS – which are used here?**
The VM is IaaS (I manage OS, runtime, patching). Azure SQL, Blob Storage and Static Web Apps are PaaS (Azure
manages the platform). This matches the shared responsibility model: more control on the VM means more
responsibility.

## Virtual machine and hosting (Task 1)

**Why this VM size?**
Standard_B1s (1 vCPU, 1 GB) is a burstable size, cheap and enough for a small API. It can be resized later.

**How is the API hosted?**
Uvicorn runs the FastAPI app on `127.0.0.1:8000`. Nginx listens on 80/443 and forwards requests to it.
A systemd service starts the API at boot and restarts it if it crashes.

**Why a reverse proxy? Why not expose Uvicorn directly?**
Nginx handles TLS, the HTTP→HTTPS redirect, and the upload size limit, and Uvicorn stays unreachable from
outside. It is the same pattern as IIS in front of Kestrel in .NET.

**How did you enable HTTPS?**
The public IP has an Azure DNS label. Certbot got a free Let's Encrypt certificate for that name and
configured Nginx. It renews automatically (certificates last 90 days).

**Why not a self-signed certificate?**
Browsers do not trust it, and the Static Web App page is HTTPS, so calls to an untrusted or HTTP API are
blocked (mixed content).

**What happens if the VM restarts?**
systemd starts Nginx and the API automatically. Use a static public IP so the address does not change.

**How would you make it highly available?**
Two or more VMs across availability zones (or a VM Scale Set) behind a Load Balancer or Application Gateway.
Or move the API to App Service.

**How do you deploy a new version?**
Copy the new code, `pip install -r requirements.txt` if packages changed, `sudo systemctl restart
employee-api`. In a real project this would be a pipeline (GitHub Actions / Azure DevOps).

## Static Web Apps and CORS (Task 2)

**Why Static Web Apps?**
A React build is only HTML, CSS and JS files. Static Web Apps hosts them with free HTTPS, global
distribution and automatic deployment from GitHub. No server to manage.

**How does deployment work?**
Azure adds a GitHub Actions workflow to the repo. On each push it runs `npm run build` and uploads the
`dist` folder.

**How does the frontend know the API URL?**
`VITE_API_URL` in `.env.production`. Vite puts the value into the JavaScript at build time. It is not a
secret – anything in frontend code is visible to users.

**What is CORS and why was it needed?**
Browsers block JavaScript from calling a different origin (scheme + host + port) unless that server allows
it. The site is on `azurestaticapps.net` and the API on `cloudapp.azure.com`, so the API returns
`Access-Control-Allow-Origin` for the site's URL. It is configured with `CORSMiddleware` and the
`ALLOWED_ORIGINS` setting.

**What is a preflight request?**
For requests like a JSON POST, PUT or DELETE the browser first sends an `OPTIONS` request asking if the call
is allowed. The middleware answers it.

**Why not allow `*`?**
Then any website could call the API from a user's browser. Only the known frontend origin is listed.

**Is CORS a security feature for the API?**
It protects users in browsers. It does not stop tools like curl or Postman. Protecting the API itself needs
authentication.

## Blob Storage (Task 3)

**Storage account vs container vs blob?**
The account is the top-level namespace and billing unit. A container is like a folder that groups blobs.
A blob is a file. The "folders" `profile-pictures/` and `documents/` are just name prefixes.

**How does the upload work?**
React sends the file as `multipart/form-data` to the API. The API checks type and size, uploads it with
the Azure Blob SDK, and saves the blob URL in the employee row.

**Why upload through the API and not directly from the browser?**
The API can validate the file and the storage credentials never reach the browser. For very large files I
would give the browser a short-lived write SAS and upload directly.

**How are the uploaded files secured?** (asked directly in the task)
- The container is private, and public blob access is disabled on the whole account.
- The browser gets a read-only SAS URL for one blob, valid for 60 minutes.
- HTTPS only, minimum TLS 1.2, data encrypted at rest by default.
- The account key is only on the VM in a `.env` file with restricted permissions.
- Next steps: Managed Identity with a user delegation SAS (no account key at all), a private endpoint or
  firewall on the storage account, Key Vault for secrets, soft delete, and Defender for Storage for malware
  scanning.

**What is a SAS token?**
A signed query string that grants limited access (which blob, which permissions, until when) without
sharing the account key. Types: account SAS, service SAS, and user delegation SAS (signed with Entra ID
credentials – the most secure).

**What is stored in `ProfileImageUrl`?**
The permanent blob URL without a token. A SAS token expires, so it is generated on each read instead of
being stored.

**What if someone copies the SAS URL?**
It works until it expires, for that one file, read-only. A shorter lifetime reduces the risk. Rotating the
account key cancels all SAS tokens signed with it.

**Which redundancy and tier?**
Standard LRS (three copies in one datacenter), Hot tier. For production, ZRS or GRS. Old documents could
move to Cool or Archive with a lifecycle rule.

## Azure SQL Database (Task 4)

**Why Azure SQL Database and not SQL Server on a VM?**
It is PaaS: patching, backups and high availability are built in.

**SQL server vs SQL database in Azure?**
The logical server is a management point (admin login, firewall, networking). Databases live inside it and
are what is billed.

**Which tier?**
The Azure SQL Database free offer: a General Purpose serverless database with a monthly free allowance
of compute and 32 GB storage; when the allowance is used it pauses until next month instead of charging.
Without it I would use Basic (5 DTU, about USD 5/month). Purchasing models are DTU-based (Basic, Standard,
Premium) or vCore-based (General Purpose, Business Critical, Hyperscale), and serverless scales compute
automatically and can pause when idle.

**Explain the table design.**
`EmployeeId` INT identity primary key, `EmployeeName`, `Email` (unique), `Department`, and nullable
`ProfileImageUrl` because the picture is uploaded after the employee is created. `NVARCHAR` supports
Unicode names.

**How does the API connect?**
SQLAlchemy with pyodbc and Microsoft ODBC Driver 18. Server, database, user and password come from
environment variables. `Encrypt=yes` forces TLS.

**How do you prevent SQL injection?**
All queries go through SQLAlchemy, which sends parameterised queries. User input is never concatenated
into SQL.

**Where is the password stored? Is that secure?**
In a `.env` file on the VM, permission 600, not in Git. Better: Managed Identity so there is no password,
or Key Vault.

**Why not store the image in the database?**
Blob Storage is much cheaper for files, keeps the database small and fast, and files can be served
directly to the browser.

**What about backups?**
Azure SQL takes automatic backups with point-in-time restore (7 days by default on Basic).

## Networking and security (Task 5)

**Why two subnets?**
To separate workloads and apply different rules: one for the VM, one for private endpoints.

**Explain the NSG rules.**
Inbound 443 from anywhere for the API, 80 from anywhere only for the certificate check and redirect, 22
only from my IP for administration. Everything else is denied by the default `DenyAllInBound` rule (priority
65500). Lower priority number is evaluated first. NSGs are stateful, so replies to allowed traffic are
allowed automatically.

**NSG on the subnet or the network card?**
Subnet here, so it applies to anything placed in the subnet. Both are possible; then both sets of rules
are evaluated.

**Is opening SSH safe?**
Restricted to my IP with key-based login. Better options are Azure Bastion or just-in-time VM access.

**How does the VM securely communicate with Azure SQL?** (asked directly in the task)
Through a Private Endpoint. The SQL server gets a private IP (`10.0.2.x`) in the VNet, the VM connects to
that over the Microsoft backbone, and public network access on the SQL server is disabled. The connection
is also TLS-encrypted and authenticated. With Managed Identity even the password could be removed.

**What is a Private Endpoint?**
A network interface with a private IP in my VNet that connects to a specific PaaS resource using Azure
Private Link. Traffic never goes over the public internet, and the resource's public access can be turned
off.

**What is Azure Private DNS and why is it needed?**
The application still connects to `myserver.database.windows.net`. That name is a CNAME to
`myserver.privatelink.database.windows.net`. A private DNS zone `privatelink.database.windows.net` linked to
the VNet holds an A record pointing to the private IP. So inside the VNet the same name resolves to
`10.0.2.x`; outside it resolves to the public address (which is blocked). No code or connection string
changes, and the TLS certificate still matches the name.

**How do you prove it works?**
`nslookup myserver.database.windows.net` on the VM returns the private IP, and the portal shows public
access as disabled while the app still works.

**Private Endpoint vs Service Endpoint?**
A service endpoint keeps the public IP of the service but lets it accept traffic only from chosen subnets;
it is free. A private endpoint gives the service a private IP in the VNet, works from on-premises and peered
networks, and allows public access to be fully disabled; it has a small cost.

**What else is there if not a private endpoint?**
SQL firewall rules allowing only the VM's public IP, or a VNet service endpoint rule.

**Does the storage account also use a private endpoint?**
Not in this build. The VM reaches it over HTTPS on the public endpoint with the account key, and the
browser needs to load images from it. For internal-only files I would add a private endpoint and its own
DNS zone `privatelink.blob.core.windows.net`.

**How is data protected in transit and at rest?**
In transit: HTTPS for browser→site, browser→API, API→Blob, and TLS for API→SQL. At rest: Azure SQL uses
Transparent Data Encryption and Storage uses Storage Service Encryption, both on by default.

**The API has no login. How would you add it?**
Microsoft Entra ID: the React app signs users in with MSAL and sends a token; the API validates the token
on each request.

## Integration (Task 6)

**Describe what happens when the user adds an employee with a picture.**
See the trace table in `03-application-walkthrough.md`: POST employee → row saved → POST photo → blob
uploaded → URL saved → list reloaded → SAS URL returned → browser loads the image from Blob Storage.

**Why two requests instead of one?**
The employee must exist to have an ID for the blob name, and it keeps each endpoint simple: one accepts
JSON, the other a file.

**What if the picture upload fails after the employee is saved?**
The employee is kept without a picture, the form shows the error, and the picture can be added later with
Edit.

**What happens to files when an employee is deleted?**
The API deletes the profile picture and the employee's documents from Blob Storage, then the row.

**How would you troubleshoot "the page loads but no data"?**
Browser console and Network tab first (CORS or mixed-content error?). Then `curl` the health endpoint.
Then on the VM: `systemctl status employee-api`, `journalctl -u employee-api`, Nginx status, and the NSG
rules.

## Cost and operations

**Roughly what does this cost?**
About USD 21–27 a month at pay-as-you-go prices: VM ≈ 7.60, disk ≈ 2.50–5, public IP ≈ 3.65, private
endpoint ≈ 7.30, SQL free offer 0 (Basic ≈ 5), storage a few cents, Static Web Apps free. On a free account
the VM, disk and storage are free for 12 months, so only about USD 11–12 a month comes out of the credit.
Details are in `05-prerequisites-cost-and-free-account.md`.

**How would you reduce cost?**
Stop (deallocate) the VM when not in use or set auto-shutdown, use the SQL free offer, set a budget alert
in Cost Management, and delete the resource group after the demo.

**How would you monitor it?**
Azure Monitor metrics and alerts for the VM and SQL, Application Insights for the API, and storage
diagnostic logs.

## Things to be honest about

If asked what is missing, say it directly – it shows you understand the gaps:

- No authentication on the API.
- Secrets in a `.env` file rather than Managed Identity / Key Vault.
- A single VM is a single point of failure.
- Storage account is reachable on its public endpoint.
- No automated tests or deployment pipeline for the backend.
