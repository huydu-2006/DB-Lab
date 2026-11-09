"""Pytest fixtures.

Environment for DB-backed tests (skipped when MySQL is unreachable):
    BK88_TEST_DATABASE_URL  -- SQLAlchemy URL to a scratch test database,
                               default mysql+pymysql://root:CHANGE_ME@localhost:3306/bk88_stadium_test

Must run before `app` is imported so settings.database_url targets the test DB.
"""

import os

TEST_DB_URL = os.environ.get(
    "BK88_TEST_DATABASE_URL",
    "mysql+pymysql://root:CHANGE_ME@localhost:3306/bk88_stadium_test",
)
os.environ["DATABASE_URL"] = TEST_DB_URL

import re  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import Connection  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]


def apply_schema(conn: Connection, sql_path: Path) -> None:
    """Execute 01_schema.sql against the connected (test) database.

    The file's CREATE DATABASE / USE statements are dropped; DELIMITER blocks
    are split on $$ so trigger bodies containing ';' execute as one statement.
    """
    sql = sql_path.read_text(encoding="utf-8")
    # Drop full-line comments: some contain ';' which would fragment the
    # statement split below. (Inline `-- x` comments are kept.)
    sql = "\n".join(
        line for line in sql.splitlines() if not line.lstrip().startswith("--")
    )
    sql = re.sub(r"CREATE DATABASE IF NOT EXISTS[\s\S]*?utf8mb4_0900_ai_ci;", "", sql, count=1)
    sql = re.sub(r"USE bk88_stadium\s*;", "", sql)

    match = re.search(r"DELIMITER \$\$(.*?)DELIMITER ;", sql, re.S)
    if match is None:
        raise RuntimeError("Trigger DELIMITER block not found in schema file")
    before, trigger_block, after = sql[: match.start()], match.group(1), sql[match.end():]

    for section in (before, after):
        for stmt in (s.strip() for s in section.split(";")):
            if stmt.strip("-- \n\r\t"):
                conn.execute(text(stmt))
    for stmt in (s.strip() for s in trigger_block.split("$$")):
        if stmt.strip("-- \n\r\t"):
            conn.execute(text(stmt))


@pytest.fixture(scope="session")
def db_engine():
    """Test database engine (auto-created); skips when MySQL is unreachable."""
    from sqlalchemy.engine import URL, make_url

    url = make_url(TEST_DB_URL)
    try:
        server_no_db = URL.create(
            drivername=url.drivername,
            username=url.username,
            password=url.password,
            host=url.host,
            port=url.port,
        )
        server = create_engine(server_no_db, pool_pre_ping=True)
        with server.connect() as conn:
            conn.execute(
                text(
                    f"CREATE DATABASE IF NOT EXISTS `{url.database}` "
                    "CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
                )
            )
            conn.commit()
        server.dispose()
        eng = create_engine(TEST_DB_URL, pool_pre_ping=True)
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
            conn.commit()
    except Exception as exc:  # pragma: no cover - environment dependent
        pytest.skip(f"MySQL test database unreachable: {exc}")
    return eng


@pytest.fixture(scope="session")
def db_schema(db_engine):  # noqa: ARG001 - ensures MySQL is reachable first
    """(Re)create the test database from backend/sql/01_schema.sql."""
    from sqlalchemy.engine import URL, make_url

    url = make_url(TEST_DB_URL)
    server = create_engine(
        URL.create(
            drivername=url.drivername,
            username=url.username,
            password=url.password,
            host=url.host,
            port=url.port,
        ),
        pool_pre_ping=True,
    )
    with server.connect() as conn:
        conn.execute(text(f"DROP DATABASE IF EXISTS `{url.database}`"))
        conn.execute(
            text(
                f"CREATE DATABASE `{url.database}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
            )
        )
        conn.commit()
    server.dispose()

    with db_engine.begin() as conn:
        apply_schema(conn, BACKEND_DIR / "sql" / "01_schema.sql")
    return db_engine


@pytest.fixture()
def clean_users(db_schema):  # noqa: ARG001 - ensures schema exists first
    """Start each DB test with an empty USERS table."""
    from app.db.session import engine as app_engine

    with app_engine.begin() as conn:
        conn.execute(text("DELETE FROM BOOKING_SERVICES"))
        conn.execute(text("DELETE FROM PAYMENTS"))
        conn.execute(text("DELETE FROM BOOKINGS"))
        conn.execute(text("DELETE FROM USERS"))
        conn.execute(text("ALTER TABLE USERS AUTO_INCREMENT = 1"))


@pytest.fixture()
def client(clean_users):
    """TestClient with a clean USERS table per test."""
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
