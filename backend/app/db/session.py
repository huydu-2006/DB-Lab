"""Database engine and helpers (SQLAlchemy 2.0 Core, explicit SQL).

Per PLAN.md the backend executes parameterized SQL directly against the
Microsoft SQL Server database — no ORM models. SQL Server concurrency
guarantees (UPDLOCK/HOLDLOCK hints) replace the former MySQL
SELECT ... FOR UPDATE locking.
"""

import re
from urllib.parse import quote_plus, unquote_plus

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

from app.core.config import settings


def ensure_database() -> None:
    """Create the configured SQL Server database if it does not exist.

    Handles SQLAlchemy URLs in the mssql+pyodbc odbc_connect form; other
    dialects are assumed to point at an existing database.
    """
    url = settings.database_url
    if "odbc_connect=" not in url:
        return
    base, _, query = url.partition("odbc_connect=")
    connect_string = unquote_plus(query)
    db_name = re.search(r"DATABASE=([^;]+)", connect_string, re.I).group(1)
    master_cs = re.sub(r"DATABASE=[^;]+", "DATABASE=master", connect_string, flags=re.I)
    master = create_engine(
        base + "odbc_connect=" + quote_plus(master_cs), isolation_level="AUTOCOMMIT"
    )
    with master.connect() as conn:
        conn.execute(text(f"IF DB_ID(N'{db_name}') IS NULL CREATE DATABASE [{db_name}]"))
    master.dispose()


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=1800,
)


def user_row_to_dict(row) -> dict:
    """Collapse a USERS row (RowMapping or dict) to a JSON-safe payload."""
    data = dict(row)
    data.pop("created_at", None)
    data.pop("updated_at", None)
    return data


def fetch_user_by_clerk_id(conn: Connection, clerk_user_id: str) -> dict | None:
    row = conn.execute(
        text(
            "SELECT user_id, clerk_user_id, full_name, email, phone, "
            "       auth_provider, role, team_name "
            "FROM USERS WHERE clerk_user_id = :cid"
        ),
        {"cid": clerk_user_id},
    ).mappings().first()
    return dict(row) if row else None


def fetch_user_by_id(conn: Connection, user_id: int) -> dict | None:
    row = conn.execute(
        text(
            "SELECT user_id, clerk_user_id, full_name, email, phone, "
            "       auth_provider, role, team_name "
            "FROM USERS WHERE user_id = :uid"
        ),
        {"uid": user_id},
    ).mappings().first()
    return dict(row) if row else None
