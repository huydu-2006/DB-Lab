"""Database engine and helpers (SQLAlchemy 2.0 Core, explicit SQL).

Per PLAN.md the backend executes parameterized SQL directly against the
InnoDB database — no ORM models.
"""

from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

from app.core.config import settings

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
