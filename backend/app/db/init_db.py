"""Apply the DDL schema and seed data to the configured database.

Usage (from backend/):
    python -m app.db.init_db           # schema + seed
    python -m app.db.init_db --seed-only
"""

import re
import sys
from pathlib import Path

from sqlalchemy import text

from app.db.session import engine

SQL_DIR = Path(__file__).resolve().parents[2] / "sql"


def run_script(engine, sql_path: Path) -> None:
    """Execute a GO-batched T-SQL script against the connected database."""
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
            continue  # assume the database exists in future CREATEs
        if re.match(r"(?is)^USE\s", code):
            continue  # already connected to the target database
        with engine.begin() as conn:
            conn.execute(text(code))


def main() -> None:
    seed_only = "--seed-only" in sys.argv
    if not seed_only:
        print("Applying sql/01_schema.sql ...")
        run_script(engine, SQL_DIR / "01_schema.sql")
    print("Applying sql/02_seed.sql ...")
    run_script(engine, SQL_DIR / "02_seed.sql")
    with engine.connect() as conn:
        counts = conn.execute(
            text("SELECT (SELECT COUNT(*) FROM FIELDS) AS fields, "
                 "       (SELECT COUNT(*) FROM PRICING_RULES) AS pricing_rules, "
                 "       (SELECT COUNT(*) FROM SERVICES) AS services, "
                 "       (SELECT COUNT(*) FROM USERS) AS users, "
                 "       (SELECT COUNT(*) FROM BOOKINGS) AS bookings, "
                 "       (SELECT COUNT(*) FROM PAYMENTS) AS payments")
        ).mappings().one()
    print("Seed complete:", dict(counts))


if __name__ == "__main__":
    main()
