from typing import Optional

from pydantic import BaseModel, Field


class EmployeeIn(BaseModel):
    employee_name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    department: str = Field(min_length=1, max_length=100)


class EmployeeOut(BaseModel):
    employee_id: int
    employee_name: str
    email: str
    department: str
    profile_image_url: Optional[str] = None
