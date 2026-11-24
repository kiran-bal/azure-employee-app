from sqlalchemy import Column, Integer, String

from database import Base


class Employee(Base):
    __tablename__ = "Employees"

    employee_id = Column("EmployeeId", Integer, primary_key=True, autoincrement=True)
    employee_name = Column("EmployeeName", String(100), nullable=False)
    email = Column("Email", String(255), nullable=False, unique=True)
    department = Column("Department", String(100), nullable=False)
    profile_image_url = Column("ProfileImageUrl", String(500), nullable=True)
