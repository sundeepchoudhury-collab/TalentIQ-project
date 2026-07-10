"""
app/database.py
─────────────────────────────────────────────────────────────
Sets up the SQLAlchemy engine, session factory, and Base
class for our ORM models.

We read the connection string from the DATABASE_URL env var
(loaded from the .env file via python-dotenv).
"""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Load variables from .env into os.environ
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Copy .env.example to .env and fill it in."
    )

# echo=False keeps logs clean. Flip to True to see every SQL statement.
engine = create_engine(DATABASE_URL, echo=False, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    """
    FastAPI dependency that yields a DB session and closes it
    after the request. Use as: `db: Session = Depends(get_db)`.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
