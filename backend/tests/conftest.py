"""Pytest fixtures.

Environment for DB-backed tests (skipped when SQL Server is unreachable):
    BK88_TEST_DATABASE_URL  -- SQLAlchemy URL; with the mssql+pyodbc dialect
                               this is `mssql+pyodbc:///?odbc_connect=<encoded
                               ODBC string with DATABASE=BK88_STADIUM_TEST>`.

Must run before `app` is imported so settings.database_url targets the test DB.
"""

import os
import re
from pathlib import Path
from urllib.parse import quote_plus, unquote_plus

TEST_DB_URL = os.environ.get(
    "BK88_TEST_DATABASE_URL",
    "mssql+pyodbc:///?odbc_connect=DRIVER%3D%7BODBC+Driver+18+for+SQL+Server"
    "%7D%3BSERVER%3Dlocalhost%5CSQLEXPRESS%3BDATABASE%3DBK88_STADIUM_TEST"
    "%3BTrusted_Connection%3Dyes%3BTrustServerCertificate%3Dyes",
)
os.environ["DATABASE_URL"] = TEST_DB_URL

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import Engine  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]


def server_engine_for(url_string: str) -> Engine:
    """Engine pointing at the same server but the `master` database.

    Handles both plain host URLs and the mssql+pyodbc `odbc_connect` form.
    AUTOCOMMIT is required for CREATE/DROP DATABASE.
    """
    if "odbc_connect=" in url_string:
        base, _, query = url_string.partition("odbc_connect=")
        connect_string = unquote_plus(query)
        master_cs = re.sub(
            r"DATABASE=[^;]+", "DATABASE=master", connect_string, flags=re.I
        )
        return create_engine(
            base + "odbc_connect=" + quote_plus(master_cs),
            isolation_level="AUTOCOMMIT",
            pool_pre_ping=True,
        )
    from sqlalchemy.engine import make_url

    url = make_url(url_string)
    from sqlalchemy.engine import URL

    return create_engine(
        URL.create(
            drivername=url.drivername,
            username=url.username,
            password=url.password,
            host=url.host,
            port=url.port,
        ),
        isolation_level="AUTOCOMMIT",
        pool_pre_ping=True,
    )


def test_database_name(url_string: str) -> str:
    if "odbc_connect=" in url_string:
        connect_string = unquote_plus(url_string.partition("odbc_connect=")[2])
        return re.search(r"DATABASE=([^;]+)", connect_string, re.I).group(1)
    from sqlalchemy.engine import make_url

    return make_url(url_string).database


def apply_schema(engine: Engine, sql_path: Path) -> None:
    """Execute 01_schema.sql against the connected (test) database.

    T-SQL scripts are batch-separated by GO lines: each batch is sent as one
    statement. The CREATE DATABASE / USE batches are for manual deployment and
    are skipped here (the test connection already targets the test database).
    """
    sql = sql_path.read_text(encoding="utf-8")
    for batch in re.split(r"(?im)^\s*GO\s*$", sql):
        code = "\n".join(
            line
            for line in batch.splitlines()
            if not line.lstrip().startswith("--")
        ).strip()
        if not code:
            continue
        if re.match(r"(?is)^IF DB_ID\s*\(.*CREATE DATABASE", code):
            continue  # manual deployment convenience; tests create the DB themselves
        if re.match(r"(?is)^USE\s", code):
            continue
        with engine.begin() as conn:
            conn.execute(text(code))


@pytest.fixture(scope="session")
def db_engine():
    """Test database engine; skips the whole suite when SQL Server is unreachable.

    Creates the test database first (the db_schema fixture later rebuilds it).
    """
    try:
        db_name = test_database_name(TEST_DB_URL)
        server = server_engine_for(TEST_DB_URL)
        with server.connect() as conn:
            conn.execute(
                text(f"IF DB_ID(N'{db_name}') IS NULL CREATE DATABASE [{db_name}]")
            )
        server.dispose()
        eng = create_engine(TEST_DB_URL, pool_pre_ping=True)
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:  # pragma: no cover - environment dependent
        pytest.skip(f"SQL Server test database unreachable: {exc}")
    return eng


@pytest.fixture(scope="session")
def db_schema(db_engine):  # noqa: ARG001 - ensures SQL Server is reachable first
    """(Re)create the test database from backend/sql/01_schema.sql."""
    db_name = test_database_name(TEST_DB_URL)
    db_engine.dispose()  # release pooled connections so the DROP can proceed
    server = server_engine_for(TEST_DB_URL)
    with server.connect() as conn:
        conn.execute(
            text(
                f"IF DB_ID(N'{db_name}') IS NOT NULL "
                f"ALTER DATABASE [{db_name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE"
            )
        )
        conn.execute(text(f"DROP DATABASE IF EXISTS [{db_name}]"))
        conn.execute(text(f"CREATE DATABASE [{db_name}]"))
    server.dispose()

    eng = create_engine(TEST_DB_URL, pool_pre_ping=True)
    apply_schema(eng, BACKEND_DIR / "sql" / "01_schema.sql")
    eng.dispose()
    # re-establish a working pool for later fixtures/tests
    return create_engine(TEST_DB_URL, pool_pre_ping=True)


@pytest.fixture()
def clean_users(db_schema):  # noqa: ARG001 - ensures schema exists first
    """Start each DB test with an empty USERS table."""
    from app.db.session import engine as app_engine

    with app_engine.begin() as conn:
        conn.execute(text("DELETE FROM BOOKING_SERVICES"))
        conn.execute(text("DELETE FROM PAYMENTS"))
        conn.execute(text("DELETE FROM BOOKINGS"))
        conn.execute(text("DELETE FROM USERS"))
        # reseed identity so user ids stay stable across tests
        for table in ("BOOKING_SERVICES", "PAYMENTS", "BOOKINGS", "USERS"):
            conn.execute(text(f"DBCC CHECKIDENT ('{table}', RESEED, 0)"))


@pytest.fixture()
def client(clean_users):
    """TestClient with a clean USERS table per test."""
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
