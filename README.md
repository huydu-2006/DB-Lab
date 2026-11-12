# Football Field Booking and Management System

**BK-88 Stadium** — a full-stack web application for reserving and managing football pitches (5-a-side, 7-a-side, 11-a-side). Final project for the Database Lab course.

Built with **React 19 + TypeScript + Tailwind CSS v4** (frontend), **Python 3.12 + FastAPI** (backend REST API), and **Microsoft SQL Server** (relational database with triggers, CHECK constraints, computed columns, views, and ACID transactions).

- Database design: [`backend/sql/01_schema.sql`](backend/sql/01_schema.sql) (T-SQL) with rationale in [`backend/sql/DESIGN.md`](backend/sql/DESIGN.md)
- Prior progress & conventions: [`CURRENT.md`](CURRENT.md)

---

## How to run this project

Follow the steps below in order after cloning the repository. They take you from a fresh clone to a running app with a working, database-backed sign-up / sign-in.

### 0. Prerequisites

| Tool | Version | Check |
| :--- | :--- | :--- |
| Git | any recent | `git --version` |
| Python | 3.12+ | `python --version` |
| Node.js | 18+ (20+ recommended) | `node --version` |
| SQL Server | 2019+ (Express is fine) | `sqlcmd -?` — and the service running |

You also need the **Microsoft ODBC Driver 18 for SQL Server** (installed with SQL Server Management tools; otherwise download from Microsoft) and permission to connect — Windows Authentication is used throughout this guide, so no passwords are stored in the repo.

### 1. Clone the repository

```bash
git clone <this-repo-url>
cd DB-Lab
```

### 2. Create the database

Deploy the schema (creates the `BK88_STADIUM` database, 8 tables, 5 triggers, 3 views, indexes and CHECK constraints — the script is idempotent, safe to re-run). Adjust `-S` to your server/instance; `-C` trusts the server's self-signed certificate, `-E` uses Windows Authentication:

```bash
sqlcmd -S localhost\SQLEXPRESS -E -C -i backend/sql/01_schema.sql
```

> No `sqlcmd`? Open **SSMS**, connect to your local server, and execute the file `backend/sql/01_schema.sql`.

Verify:

```bash
sqlcmd -S localhost\SQLEXPRESS -E -C -Q "USE BK88_STADIUM; SELECT name FROM sys.tables;"
```

### 3. Set up and start the backend (FastAPI)

```bash
cd backend

# 3a. (recommended) create an isolated environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

# 3b. install dependencies
python -m pip install -r requirements.txt

# 3c. configure the environment
copy .env.example .env        # macOS / Linux: cp .env.example .env
```

Edit `backend/.env` and point `DATABASE_URL` at your SQL Server. The connection uses the `mssql+pyodbc` dialect with an URL-encoded ODBC connection string (`Trusted_Connection=yes` for Windows Authentication; swap in `UID=...;PWD=...` for SQL logins if your server uses them):

```dotenv
DATABASE_URL=mssql+pyodbc:///?odbc_connect=DRIVER%3D%7BODBC+Driver+18+for+SQL+Server%7D%3BSERVER%3Dlocalhost%5CSQLEXPRESS%3BDATABASE%3Dbk88_stadium%3BTrusted_Connection%3Dyes%3BTrustServerCertificate%3Dyes
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
DEV_AUTH_SECRET=dev-secret-change-me-0123456789abcdef
```

Start the API:

```bash
python -m uvicorn app.main:app --reload
```

If you see `{"status":"ok","auth_mode":"dev-fallback"}` at **http://127.0.0.1:8000/api/health** — the backend is up. The interactive API documentation is at **http://127.0.0.1:8000/docs**.

> **Auth modes:** with `CLERK_JWKS_URL` empty the backend runs in *dev-fallback* mode: sign-up/sign-in works directly against the SQL Server `USERS` table (`POST /api/auth/dev/register`, `POST /api/auth/dev/login`). When you later adopt Clerk + Google OAuth (see `PLAN.md`), fill in `CLERK_JWKS_URL` and `CLERK_ISSUER` and the same endpoints switch to Clerk RS256 JWT verification — no code changes required.

### 4. Set up and start the frontend (React + Vite)

In a **new terminal**, from the repository root:

```bash
cd frontend

npm install

copy .env.example .env       # macOS / Linux: cp .env.example .env
npm run dev
```

Open **http://localhost:5173**.

### 5. Sign up and sign in

1. On the login page, switch to the **Sign up** tab, enter your name + email (+ any password ≥ 6 chars — the local dev API does not check passwords; that is Clerk's job in production), and create the account.
2. Switch to **Sign in** and sign in with the same email.
3. Your profile is now stored in the `USERS` table — verify with:

```bash
sqlcmd -S localhost\SQLEXPRESS -E -C -Q "USE BK88_STADIUM; SELECT user_id, full_name, email, role FROM dbo.USERS;"
```

> If the backend isn't running, the login page automatically falls back to an offline demo account: `manager@bk88.vn` / `matchday`.

### 6. Run the tests

Backend (8 unit tests + 11 database-backed tests; the suite creates and rebuilds the scratch database `BK88_STADIUM_TEST` from `01_schema.sql` itself — no environment variables needed, the defaults in `tests/conftest.py` point at `localhost\SQLEXPRESS`):

```bash
cd backend
python -m pytest
```

Frontend:

```bash
cd frontend
npm run test     # 46 unit tests
npm run build    # type-check + production build
npm run lint     # ESLint
```

### Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| `Data source name not found and no default driver specified` | ODBC Driver 18 not installed, or the driver name in `DATABASE_URL` doesn't match an installed driver (check `sqlcmd -?` / ODBC Data Sources). |
| `certificate chain was issued by an authority that is not trusted` | Add `TrustServerCertificate=yes` to the ODBC connect string (or use the `-C` flag with sqlcmd). |
| `Login failed for user ...` | Server uses SQL logins: replace `Trusted_Connection%3Dyes` with `UID%3D<user>%3BPWD%3D<password>` in `DATABASE_URL`. |
| `Cannot open database "bk88_stadium"` | Step 2 was skipped — apply `backend/sql/01_schema.sql` again, and check the `DATABASE=` part of `DATABASE_URL`. |
| Frontend shows "Could not reach the API backend" | Backend not running (`uvicorn`, step 3) or `VITE_API_URL` in `frontend/.env` doesn't match the API host/port. |
| Port 8000 already in use | Start uvicorn on another port: `python -m uvicorn app.main:app --reload --port 8001`, and update `VITE_API_URL`. |
| `CORS policy` errors in the browser console | Add your frontend origin to `CORS_ORIGINS` in `backend/.env` and restart the backend. |

### Project structure

```
DB-Lab/
├── backend/
│   ├── app/                  # FastAPI application (auth, config, db, security)
│   ├── sql/01_schema.sql     # SQL Server (T-SQL) schema, triggers, indexes, views
│   ├── sql/DESIGN.md         # database design rationale
│   ├── tests/                # pytest suites (unit + DB-backed)
│   └── .env.example          # backend environment template
├── frontend/
│   ├── src/                  # React app (Login, Dashboard, booking logic)
│   └── .env.example          # frontend environment template
├── PLAN.md                   # scope + action items
├── project_specification.md  # full functional spec + ERD
└── CURRENT.md                # living progress log / conventions
```
