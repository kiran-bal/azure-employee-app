# 3. Application Walkthrough

A guide for getting familiar with the code so that every part can be explained and changed live.
Suggested time: 2–3 hours, in the order below.

## Step 1 – Run it locally (30 min)

```bash
# terminal 1
cd employee-app/backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload

# terminal 2
cd employee-app/frontend
npm install
cp .env.example .env
npm run dev
```

In `backend/.env`, leave `SQL_SERVER` empty to use a local SQLite file. Adding and editing employees works
without any Azure resource. Picture and document uploads need a storage account: locally set
`AZURE_STORAGE_CONNECTION_STRING`; on Azure only `STORAGE_ACCOUNT_URL` is set and the managed identity is used.

If `pip install` fails on `pyodbc` on a Mac, run `brew install unixodbc` first.

Open http://localhost:8000/docs – FastAPI generates this page automatically. Try each endpoint from there
before looking at the React app.

## Step 2 – Backend, file by file (45 min)

The backend is five small files. Read them in this order.

### `database.py` – the connection

- `load_dotenv()` reads the `.env` file into environment variables.
- If `SQL_SERVER` is set, it builds a connection URL for Azure SQL using the ODBC driver, with
  `Encrypt=yes` so the connection uses TLS. Otherwise it uses SQLite.
- `engine` is the connection pool. `pool_pre_ping=True` checks a connection is alive before using it
  (Azure SQL closes idle connections).
- `get_db()` opens a session for one request and always closes it afterwards.

### `models.py` – the table

- The `Employee` class maps to the `Employees` table.
- Python uses `employee_name`; the first argument of `Column(...)` is the real column name `EmployeeName`.
- `primary_key=True, autoincrement=True` becomes `IDENTITY(1,1)` in SQL Server.

### `schemas.py` – what the API accepts and returns

- `EmployeeIn` is the request body for create and update. FastAPI validates it automatically and returns
  422 if a field is missing, too long, or the email format is wrong.
- `EmployeeOut` is the response shape.

### `storage.py` – Blob Storage

| Function | What it does |
|---|---|
| `get_service()` | Creates the Blob client: connection string locally, managed identity on Azure |
| `upload_file()` | Uploads bytes to a blob, sets the content type, returns the blob URL |
| `delete_file()` / `delete_files()` | Deletes one blob / all blobs under a prefix |
| `list_files()` | Lists blob names under a prefix (used for documents) |
| `blob_name_from_url()` | Gets `profile-pictures/3.jpg` back from the full URL stored in the database |
| `read_url()` | Creates a read-only SAS URL valid for 60 minutes |

### `main.py` – the endpoints

- Top: creates the app, adds the CORS middleware using `ALLOWED_ORIGINS`, creates the table if missing.
- Helpers:
  - `get_employee_or_404()` – loads an employee or returns 404.
  - `to_out()` – converts a database row to the response and swaps the stored URL for a SAS URL.
  - `save()` – commits; a duplicate email becomes a 409 response.
  - `read_upload()` – reads the uploaded file, rejects empty files and files over 5 MB.
- CRUD endpoints: `GET`, `POST`, `PUT`, `DELETE` on `/api/employees`.
- Upload endpoints: `/photo` (images only, updates `ProfileImageUrl`) and `/documents`.

`Depends(get_db)` in each endpoint means "give this function a database session" (dependency injection).

## Step 3 – Frontend, file by file (30 min)

| File | Role |
|---|---|
| `src/api.js` | All calls to the API in one place. Reads the base URL from `VITE_API_URL`. |
| `src/App.jsx` | Holds the employee list in state, loads it on start, handles save and delete. |
| `src/EmployeeForm.jsx` | The add / edit form with the picture file input. |
| `src/EmployeeList.jsx` | Shows each employee with picture, and the Edit / Delete / Documents buttons. |
| `src/Documents.jsx` | Lists and uploads documents for one employee. |
| `src/App.css` | Styling. |

Things to notice:

- `useState` holds data; `useEffect(..., [])` runs once when the page loads to fetch the employees.
- JSON requests set `Content-Type: application/json`. File uploads use `FormData` and do **not** set the
  content type – the browser sets `multipart/form-data` with the boundary itself.
- `VITE_API_URL` is replaced with its value at build time. Changing the API URL means rebuilding.
- `key={editing ? editing.employee_id : 'new'}` on the form makes React create a fresh form when switching
  between add and edit.

## Step 4 – Trace the main workflow (20 min)

Open the browser developer tools → Network tab, add an employee with a picture and follow along.

| # | What happens | Where in the code |
|---|---|---|
| 1 | User fills the form and clicks Add | `EmployeeForm.jsx` → `handleSubmit` |
| 2 | Browser sends a preflight `OPTIONS` request (CORS check) | answered by `CORSMiddleware` in `main.py` |
| 3 | `POST /api/employees` with JSON | `api.js` → `createEmployee` |
| 4 | API validates and inserts the row; SQL generates `EmployeeId` | `main.py` → `create_employee` |
| 5 | Response `201` with the new `employee_id` | |
| 6 | `POST /api/employees/{id}/photo` with the file | `App.jsx` → `handleSave`, `api.js` → `uploadPhoto` |
| 7 | API uploads to `profile-pictures/{id}.jpg` in Blob Storage | `main.py` → `upload_photo`, `storage.py` → `upload_file` |
| 8 | API saves the blob URL in `ProfileImageUrl` | `upload_photo` |
| 9 | React reloads the list: `GET /api/employees` | `App.jsx` → `loadEmployees` |
| 10 | API returns each employee with a SAS URL for the picture | `main.py` → `to_out`, `storage.py` → `read_url` |
| 11 | The `<img>` tag loads the picture directly from Blob Storage | `EmployeeList.jsx` |

In production the path of a request is:

`Browser → DNS name → public IP → NSG (443 allowed) → Nginx (TLS) → Uvicorn :8000 → FastAPI → private endpoint → Azure SQL`

## Step 5 – Know the server (20 min)

SSH to the VM and try each of these until they feel familiar:

```bash
sudo systemctl status employee-api          # is the API running?
sudo journalctl -u employee-api -n 50       # API logs
sudo systemctl restart employee-api         # after changing code or .env
sudo nginx -t                               # check Nginx config
cat /etc/nginx/sites-available/employee-api # see what certbot added
sudo certbot certificates                   # certificate and expiry date
nslookup <sql-server>.database.windows.net  # shows the private IP
curl http://127.0.0.1:8000/api/health       # API directly, bypassing Nginx
```

## Step 6 – Practice changes (30 min)

Evaluators often ask for a small live change. Try these yourself:

1. **Add a field** (for example `Phone`): `ALTER TABLE` in SQL → `models.py` → `schemas.py` → `to_out()` and
   `update_employee()` in `main.py` → form and list in React.
2. **Change the SAS lifetime** to 5 minutes (`SAS_MINUTES` in `storage.py`), reload, wait, and open an old
   image URL to see the 403 error.
3. **Break CORS on purpose**: change `ALLOWED_ORIGINS` to something else, restart, and read the browser
   console error. Then fix it.
4. **Remove the 443 rule in the NSG** and see the site fail to load data. Add it back.
5. **Open a blob URL without the SAS token** in the browser – it returns an error because the container is private.
6. **Add a search endpoint**: `GET /api/employees?department=HR` using `.filter(Employee.department == department)`.

## Self-check

You are ready when you can answer these without looking:

- Where is the API URL configured for the frontend, and when is it read?
- Which file would you change to allow a second frontend domain?
- What is stored in `ProfileImageUrl`, and why is it different from what the browser receives?
- What happens, step by step, when the VM reboots?
- How does the API reach SQL if public access is disabled?
- Which ports are open on the VM and why each one?
