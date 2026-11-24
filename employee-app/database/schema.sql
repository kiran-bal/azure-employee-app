-- Run this in the Azure portal Query editor (or any SQL client) against employeedb.

CREATE TABLE Employees (
    EmployeeId      INT IDENTITY(1,1) PRIMARY KEY,
    EmployeeName    NVARCHAR(100) NOT NULL,
    Email           NVARCHAR(255) NOT NULL UNIQUE,
    Department      NVARCHAR(100) NOT NULL,
    ProfileImageUrl NVARCHAR(500) NULL
);
