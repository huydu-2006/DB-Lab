# Football Field Booking and Management System

**BK-88 Stadium** — a full-stack web application for reserving and managing football pitches (5-a-side, 7-a-side, 11-a-side). Final project for the Database Lab course.

Built with **React 19 + TypeScript + Tailwind CSS v4** (frontend), **Python 3.12 + FastAPI** (backend REST API), and **MySQL 8.0+ / InnoDB** (relational database with triggers, CHECK constraints, views, and ACID transactions).

- Database design: [`backend/sql/01_schema.sql`](backend/sql/01_schema.sql) with rationale in [`backend/sql/DESIGN.md`](backend/sql/DESIGN.md)
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
| MySQL Server | 8.0+ | `mysql --version` — and the service running on `localhost:3306` |

### 1. Clone the repository

```bash
git clone https://github.com/huydu-2006/DB-Lab.git
cd DB-Lab
```

### 2. Create the database

Deploy the schema (creates the `bk88_stadium` database, 8 tables, 5 triggers, 3 views, indexes and CHECK constraints — fully idempotent, safe to re-run):

```bash
mysql -u root -p < backend/sql/01_schema.sql
```

> No `mysql` CLI? Open **MySQL Workbench**, connect to your local server, and execute the file `backend/sql/01_schema.sql`.

Verify:

```bash
mysql -u root -p -e "USE bk88_stadium; SHOW TABLES;"
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

Edit `backend/.env` and set your MySQL credentials:

```dotenv
DATABASE_URL=mysql+pymysql://root:YOUR_MYSQL_PASSWORD@localhost:3306/bk88_stadium
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
DEV_AUTH_SECRET=dev-secret-change-me-0123456789abcdef
```

Start the API:

```bash
python -m uvicorn app.main:app --reload
```

If you see `{"status":"ok","auth_mode":"dev-fallback"}` at **http://127.0.0.1:8000/api/health** — the backend is up. The interactive API documentation is at **http://127.0.0.1:8000/docs**.

> **Auth modes:** with `CLERK_JWKS_URL` empty the backend runs in *dev-fallback* mode: sign-up/sign-in works directly against the MySQL `USERS` table (`POST /api/auth/dev/register`, `POST /api/auth/dev/login`). When you later adopt Clerk + Google OAuth (see `PLAN.md`), fill in `CLERK_JWKS_URL` and `CLERK_ISSUER` and the same endpoints switch to Clerk RS256 JWT verification — no code changes required.

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
mysql -u root -p -e "SELECT user_id, full_name, email, role FROM bk88_stadium.USERS;"
```

> If the backend isn't running, the login page automatically falls back to an offline demo account: `manager@bk88.vn` / `matchday`.

### 6. Run the tests

Backend (unit tests + database-backed tests; the suite rebuilds the scratch database `bk88_stadium_test` from `01_schema.sql` itself):

```bash
cd backend
BK88_TEST_DATABASE_URL="mysql+pymysql://root:YOUR_MYSQL_PASSWORD@localhost:3306/bk88_stadium_test" python -m pytest
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
| `Access denied for user 'root'@'localhost'` | Wrong password in `backend/.env` / mysql command; update `DATABASE_URL` (and the test URL). |
| `Unknown database 'bk88_stadium'` | Step 2 was skipped — apply `backend/sql/01_schema.sql` again. |
| Frontend shows "Could not reach the API backend" | Backend not running (`uvicorn`, step 3) or `VITE_API_URL` in `frontend/.env` doesn't match the API host/port. |
| Port 8000 already in use | Start uvicorn on another port: `python -m uvicorn app.main:app --reload --port 8001`, and update `VITE_API_URL`. |
| `CORS policy` errors in the browser console | Add your frontend origin to `CORS_ORIGINS` in `backend/.env` and restart the backend. |

### Project structure

```
DB-Lab/
├── backend/
│   ├── app/                  # FastAPI application (auth, config, db, security)
│   ├── sql/01_schema.sql     # MySQL schema, triggers, indexes, views
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
