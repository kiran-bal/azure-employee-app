import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

if os.getenv("SQL_SERVER"):
    odbc = (
        "Driver={ODBC Driver 18 for SQL Server};"
        f"Server=tcp:{os.getenv('SQL_SERVER')},1433;"
        f"Database={os.getenv('SQL_DATABASE')};"
        "Encrypt=yes;TrustServerCertificate=no;"
    )
    if os.getenv("SQL_USER"):
        odbc += f"Uid={os.getenv('SQL_USER')};Pwd={os.getenv('SQL_PASSWORD')};"
    else:
        # no password: sign in with the VM's managed identity (Microsoft Entra)
        odbc += "Authentication=ActiveDirectoryMsi;"

    db_url = URL.create("mssql+pyodbc", query={"odbc_connect": odbc})
    engine = create_engine(db_url, pool_pre_ping=True)
else:
    # local development without Azure SQL
    engine = create_engine("sqlite:///./employees.db", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=engine, autoflush=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
