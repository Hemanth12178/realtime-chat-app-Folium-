import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# By default the SQLite file is created in the folder you run uvicorn from (backend/).
# Docker sets DATABASE_URL to a file on a volume, so the data survives a restart.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./chat.db")

# check_same_thread=False: FastAPI can use the connection from different threads
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# Factory that creates a new database session when called
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: open a DB session for one request, always close it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()