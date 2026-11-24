# 1. Architecture and Design

## What was built

An employee management application:

- A user opens the React site, adds an employee and optionally a profile picture.
- The React app calls the API over HTTPS.
- The API stores the employee in Azure SQL Database and the files in Azure Blob Storage.
- The list shows each employee with their picture, and documents can be uploaded per employee.

## Architecture

```
                         Internet
                            |
        +-------------------+--------------------+
        |                                        |
        v                                        v
+--------------------+              HTTPS 443 (public IP + DNS name)
| Azure Static Web   |                           |
| Apps (React build) |      +--------------------|---------------------------+
+--------------------+      | Virtual Network    |           10.0.0.0/16     |
        |                   |                    v                           |
        |  browser calls    |  +-----------------------------------------+   |
        |  the API ---------+->| snet-app  10.0.1.0/24    [NSG]          |   |
        |                   |  |  Ubuntu VM                              |   |
                            |  |   Nginx (TLS) -> Uvicorn/FastAPI :8000  |   |
                            |  +--------------------+--------------------+   |
                            |                       | private IP, 1433       |
                            |  +--------------------v--------------------+   |
                            |  | snet-private-endpoints  10.0.2.0/24     |   |
                            |  |  Private Endpoint (SQL)  10.0.2.4       |   |
                            |  +--------------------+--------------------+   |
                            |   Private DNS zone: privatelink.database.windows.net
                            +-----------------------|------------------------+
                                                    v
                                         Azure SQL Database
                                         (public access disabled)

   VM ---- HTTPS ----> Azure Blob Storage (private container "employee-files")
   Browser -- HTTPS + SAS token --> Blob Storage (to display pictures / open documents)
```

## Resources

| Resource | Name used | Notes |
|---|---|---|
| Resource group | `rg-employee-app` | Everything in one group, one region |
| Virtual network | `vnet-employee` | `10.0.0.0/16` |
| Subnet | `snet-app` | `10.0.1.0/24`, holds the VM |
| Subnet | `snet-private-endpoints` | `10.0.2.0/24`, holds the SQL private endpoint |
| NSG | `nsg-app` | Attached to `snet-app` |
| Virtual machine | `vm-employee-api` | Ubuntu 24.04, Standard_B1s |
| SQL server / database | `sql-employee-<unique>` / `employeedb` | Free offer (serverless), or Basic tier |
| Storage account | `stemployee<unique>` | Standard LRS, container `employee-files` |
| Static Web App | `swa-employee` | Free plan |

## Note on the backend technology

The assignment describes a .NET Web API. The backend here is written in Python (FastAPI).
All Azure parts are the same; only the runtime on the VM changes:

| Assignment (.NET) | This project (Python) |
|---|---|
| ASP.NET Core Web API | FastAPI |
| .NET runtime + Hosting Bundle | Python 3 + virtual environment |
| IIS (reverse proxy to Kestrel) | Nginx (reverse proxy to Uvicorn) |
| Entity Framework Core | SQLAlchemy + pyodbc (Microsoft ODBC Driver 18) |
| Azure.Storage.Blobs | azure-storage-blob |
| `AddCors()` | `CORSMiddleware` |

## Design decisions

**Backend on a VM behind Nginx.** Uvicorn runs the FastAPI app on `127.0.0.1:8000`, so it is not reachable
from outside. Nginx listens on 443, terminates TLS and forwards requests to Uvicorn. A systemd service keeps
the API running and restarts it after a reboot or crash.

**HTTPS.** The VM's public IP has an Azure DNS label (`<name>.<region>.cloudapp.azure.com`). A free
Let's Encrypt certificate is issued for that name with certbot. A trusted certificate is required because the
Static Web App is served over HTTPS and browsers block calls from an HTTPS page to an HTTP or self-signed API.

**CORS.** The frontend and the API are on different domains, so the browser needs the API to allow the
frontend's origin. The allowed origins come from the `ALLOWED_ORIGINS` setting, and only the Static Web App
URL is listed (not `*`).

**Database.** One table, `Employees`, with the five required fields. `EmployeeId` is an identity primary key
and `Email` is unique. The API connects with an encrypted connection (`Encrypt=yes`).

**Blob Storage.** One private container, `employee-files`:

```
employee-files/
  profile-pictures/<EmployeeId>.<ext>
  documents/<EmployeeId>/<file name>
```

The database stores the plain blob URL in `ProfileImageUrl`. The container has no public access, so when the
API returns an employee it adds a read-only SAS token valid for 60 minutes. The browser uses that temporary URL
to display the picture. Documents are not in the table; they are listed from the `documents/<EmployeeId>/`
prefix.

**Network security.**

- NSG inbound: 443 and 80 from the internet (80 is only for the certificate challenge and the redirect to
  HTTPS), 22 only from my own IP. Everything else is denied by the default rules.
- Azure SQL is reached through a Private Endpoint; its public network access is disabled.
- Secrets (SQL password, storage connection string) are in a `.env` file on the VM, readable only by the
  service user, and are not committed to Git.

## What I would add for production

These were left out to keep the project small, but are worth mentioning in the review:

- Managed Identity for the VM instead of a SQL password and storage key, with secrets in Azure Key Vault.
- User login (Microsoft Entra ID) – the API currently has no authentication.
- Private Endpoint for the storage account as well.
- Azure Bastion instead of opening SSH, and an Application Gateway with WAF in front of the VM.
- App Service or a VM Scale Set with a load balancer instead of a single VM (no single point of failure).
- Backups / geo-replication for SQL, soft delete and versioning for blobs, monitoring with Azure Monitor.
