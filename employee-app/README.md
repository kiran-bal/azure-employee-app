# Employee Management App

A small full-stack application deployed on Microsoft Azure.

| Part | Technology | Azure service |
|---|---|---|
| Frontend | React (Vite) | Azure Static Web Apps |
| Backend API | Python, FastAPI | Azure Virtual Machine (Ubuntu, Nginx) |
| Database | SQL | Azure SQL Database |
| Files | Profile pictures and documents | Azure Blob Storage |

## Folders

- `backend/` – FastAPI application
- `frontend/` – React application
- `database/` – SQL script for the Employees table
- `deploy/` – Nginx and systemd files used on the VM

## Run locally

Backend:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in the values
uvicorn main:app --reload
```

The API runs on http://localhost:8000 and the interactive API page is at http://localhost:8000/docs.
If `SQL_SERVER` is left empty in `.env`, a local SQLite file is used instead of Azure SQL.

Frontend:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The app runs on http://localhost:5173.

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/employees` | List employees |
| GET | `/api/employees/{id}` | Get one employee |
| POST | `/api/employees` | Create employee |
| PUT | `/api/employees/{id}` | Update employee |
| DELETE | `/api/employees/{id}` | Delete employee and their files |
| POST | `/api/employees/{id}/photo` | Upload profile picture |
| POST | `/api/employees/{id}/documents` | Upload a document |
| GET | `/api/employees/{id}/documents` | List documents |
