import os

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import storage
from database import Base, engine, get_db
from models import Employee
from schemas import EmployeeIn, EmployeeOut

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

app = FastAPI(title="Employee Management API")

origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# creates the Employees table if it is not already there
Base.metadata.create_all(bind=engine)


def get_employee_or_404(employee_id: int, db: Session):
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee


def to_out(employee: Employee):
    """Replaces the stored blob URL with a temporary SAS URL the browser can open."""
    image_url = None
    if employee.profile_image_url:
        image_url = storage.read_url(storage.blob_name_from_url(employee.profile_image_url))
    return EmployeeOut(
        employee_id=employee.employee_id,
        employee_name=employee.employee_name,
        email=employee.email,
        department=employee.department,
        profile_image_url=image_url,
    )


def save(db: Session):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An employee with this email already exists")


def read_upload(file: UploadFile):
    data = file.file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File is larger than 5 MB")
    return data


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------- Employee CRUD ----------

@app.get("/api/employees", response_model=list[EmployeeOut])
def list_employees(db: Session = Depends(get_db)):
    employees = db.query(Employee).order_by(Employee.employee_id).all()
    return [to_out(e) for e in employees]


@app.get("/api/employees/{employee_id}", response_model=EmployeeOut)
def get_employee(employee_id: int, db: Session = Depends(get_db)):
    return to_out(get_employee_or_404(employee_id, db))


@app.post("/api/employees", response_model=EmployeeOut, status_code=201)
def create_employee(body: EmployeeIn, db: Session = Depends(get_db)):
    employee = Employee(**body.model_dump())
    db.add(employee)
    save(db)
    return to_out(employee)


@app.put("/api/employees/{employee_id}", response_model=EmployeeOut)
def update_employee(employee_id: int, body: EmployeeIn, db: Session = Depends(get_db)):
    employee = get_employee_or_404(employee_id, db)
    employee.employee_name = body.employee_name
    employee.email = body.email
    employee.department = body.department
    save(db)
    return to_out(employee)


@app.delete("/api/employees/{employee_id}", status_code=204)
def delete_employee(employee_id: int, db: Session = Depends(get_db)):
    employee = get_employee_or_404(employee_id, db)
    if employee.profile_image_url:
        storage.delete_file(storage.blob_name_from_url(employee.profile_image_url))
    storage.delete_files(f"documents/{employee_id}/")
    db.delete(employee)
    db.commit()


# ---------- File uploads ----------

@app.post("/api/employees/{employee_id}/photo", response_model=EmployeeOut)
def upload_photo(employee_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    employee = get_employee_or_404(employee_id, db)
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    data = read_upload(file)

    extension = os.path.splitext(file.filename or "")[1].lower()
    blob_name = f"profile-pictures/{employee_id}{extension}"
    new_url = storage.upload_file(blob_name, data, file.content_type)

    # remove the previous picture if it was stored under a different name
    old_url = employee.profile_image_url
    if old_url and old_url != new_url:
        storage.delete_file(storage.blob_name_from_url(old_url))

    employee.profile_image_url = new_url
    db.commit()
    return to_out(employee)


@app.post("/api/employees/{employee_id}/documents", status_code=201)
def upload_document(employee_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    get_employee_or_404(employee_id, db)
    data = read_upload(file)
    filename = os.path.basename(file.filename or "document")
    blob_name = f"documents/{employee_id}/{filename}"
    storage.upload_file(blob_name, data, file.content_type or "application/octet-stream")
    return {"name": filename, "url": storage.read_url(blob_name)}


@app.get("/api/employees/{employee_id}/documents")
def list_documents(employee_id: int, db: Session = Depends(get_db)):
    get_employee_or_404(employee_id, db)
    names = storage.list_files(f"documents/{employee_id}/")
    return [{"name": os.path.basename(n), "url": storage.read_url(n)} for n in names]
