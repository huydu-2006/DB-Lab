# CURRENT — Project Progress Context

## Project Snapshot

**BK-88 Stadium** — Football Field Booking and Management System (Database Lab final project).
Stack (locked in `PLAN.md`, not open for re-litigation): **React 19 + TS + Tailwind frontend** (exists in `frontend/`), **Python 3.12 + FastAPI backend** (`backend/` — not yet implemented), **MySQL 8.0+ (InnoDB)** database, **Clerk + Google OAuth** auth. DB design is the task addressed in this entry.

Key reference docs:
- `PLAN.md` — scope + 12 action items; DB work = "Write MySQL 8.0+ DDL schema and overlap triggers" (`backend/sql/01_schema.sql`) and a separate seed item (`02_seed.sql`).
- `project_specification.md` — full ERD in §4 (mermaid), integrity requirements (overlap triggers via `SIGNAL SQLSTATE '45000'`, CHECKs, ACID transactions), roles `CUSTOMER/STAFF/ADMIN`, 8 fixed tables.
- `skills/` — DB-design skill bundle; read `SKILL.md`, `schema-design.md`, `indexing.md` (others — database-selection, orm-selection, migrations, optimization — not needed since stack is fixed).

What the frontend already forces on the DB (read from `frontend/src/lib/types.ts`, `data.ts`, `booking.ts`, `auth.ts`):
- 8 mock pitches (`Pitch` model: `id, name, address, district, type ('5-a-side'|'7-a-side'|'11-a-side'), surface, pricePerHour, rating, reviews, amenities[], openAt, closeAt`).
- 30-minute slot grid; durations 0.5–3h; prime time starts 17:00 (+15% surcharge); booking window = next 14 days; app TZ `Asia/Ho_Chi_Minh`.
- Booking totals derived from per-hour pricing split into standard/prime hours; mock auth stub only (no Clerk yet).

## What Was Done (Database Design) ✅

Delivered the database design — schema, constraints, triggers, indexes, views, plus a rationale document:

1. **`backend/sql/01_schema.sql`** (NEW) — full MySQL 8.0+ DDL, `bk88_stadium` schema, utf8mb4:
   - **8 tables** (exactly as fixed by PLAN/spec): `USERS` (Clerk-synced, unique `clerk_user_id`/`email`/nullable-unique `phone`, role enum incl. `STAFF`, `team_name`), `FIELDS` (extended to mirror frontend `Pitch`: address/district/rating/review_count/open-close window; `amenities` as a MySQL `SET` — display-only fixed domain), `PRICING_RULES` (per field × `day_of_week` 0–6 + time window + label enum), `BOOKINGS` (`total_amount` = **STORED generated column** `pitch_amount + service_amount`, so derived totals cannot desync; status enum `PENDING/CONFIRMED/COMPLETED/CANCELLED/NO_SHOW`), `SERVICES` (catalogue + `stock_quantity >= 0`), `BOOKING_SERVICES` (junction, `UNIQUE(booking_id, service_id)`, `unit_price_snapshot` for historical pricing, generated `subtotal`), `PAYMENTS` (`DEPOSIT/FULL/REMAINDER/REFUND` × `CASH/BANK_TRANSFER/E_WALLET/CARD`, `payment_status`, nullable `recorded_by`→USERS), `MAINTENANCE_LOGS` (datetime windows, can cross midnight).
   - **Overlap prevention triggers**: `trg_bookings_no_overlap_ins` / `trg_bookings_no_overlap_upd` — `SIGNAL SQLSTATE '45000'` on interval overlap (`NEW.start_time < end_time AND NEW.end_time > start_time`) among `PENDING`/`CONFIRMED` bookings on same `(field_id, booking_date)`; UPDATE variant excludes own `booking_id` and only fires when slot columns changed. Cancelled bookings free their slots.
   - **Invoice sync triggers**: `trg_bsvc_recalc_ins/upd/del` recompute `BOOKINGS.service_amount = SUM(subtotal)` on every line-item change (spec §3.2-D "automatic invoice recalculation").
   - **CHECKs** everywhere required by spec (`end_time > start_time`, `quantity > 0`, non-negative money/stock/cost, dow range), cascade policy: booking artifacts CASCADE with booking; FIELDS/SERVICES RESTRICT (financial history); `PRICING_RULES`/`MAINTENANCE_LOGS` cascade with field.
   - **Indexes** per `skills/indexing.md` (equality-then-range): `BOOKINGS(field_id, booking_date, start_time, end_time)` serves availability + trigger probes + `FOR UPDATE` locks; `(user_id, booking_date)`; `(status)`; `FIELDS(field_type, status)`; `PAYMENTS(created_at)` for revenue GROUP BY; `MAINTENANCE_LOGS(field_id, start_datetime, end_datetime)`.
   - **3 analytical views** for spec §3.2-F: `vw_revenue_daily`, `vw_field_utilization` (booked ÷ opening hours %), `vw_customer_stats` (LTV, cancellations, no-shows).
   - Recurring (weekly) bookings: expanded app-side into individual rows in one transaction — deliberately no recurrence table (out of the fixed 8-table scope).
2. **`backend/sql/DESIGN.md`** (NEW) — design rationale: 3NF/BCNF argument, per-table decisions, integrity "defense in depth" story (app `SELECT ... FOR UPDATE` → triggers → CHECKs → generated columns), index strategy table, currency (`DECIMAL(12,2)` VND) & charset (`utf8mb4`) notes, deliberate non-choices (no JSON columns, no soft deletes, no denormalized counters).

## Verification

- `skills/scripts/schema_validator.py` does **not** support raw MySQL DDL (Prisma/Drizzle heuristic only — it reports "No schema files found"; documented SKILL.md limitation).
- Wrote a one-off static lint (since discarded; scratch) validating: 8 tables + 5 triggers + 3 views uniquely named, every FK targets an existing table/PK, valid `ON DELETE` policies, balanced `DELIMITER`/`BEGIN…END$$` blocks, all tables `ENGINE=InnoDB` → **all checks passed**.
- **NOT yet verified**: actual execution against a live MySQL server. MySQL 26.7 is installed on this machine (bin at `C:\Program Files\MySQL\MySQL Server 26.7\bin`) but `root` requires a password we don't have. First task needing DB access should ask the user for MySQL credentials/connection info, then run `01_schema.sql` end-to-end + an overlap-trigger negative test.

## Open Items / Next Steps (DB-adjacent)

1. **Seed data** — `backend/sql/02_seed.sql` + `init_db.py`: 8 pitches from `frontend/src/lib/data.ts` (translate '5-a-side'→`5v5` etc., 'Floodlights'→`FLOODLIGHTS`), prime/standard `PRICING_RULES` (prime = start ≥ 17:00, ~+15% per `booking.ts`), matchday `SERVICES` (Water, Ball Rental, Bibs, Referee), sample users/bookings/payments.
2. **Live-DB validation** of triggers (overlap rejection + recalc) once credentials are provided.
3. Then the FastAPI backend items in PLAN.md (Clerk JWT sync, booking transactions with `FOR UPDATE` + stock deduction, reports router over the three views).
4. Frontend stays untouched by this task; `data.ts` remains the mock source until `api.ts` lands.

## Conventions Agreed

- Money: `DECIMAL(12,2)` VND, whole-VND app-side, rounded to 1000 (frontend does `Math.round(x/1000)*1000`).
- All operational tables carry `created_at`/`updated_at` (`ON UPDATE CURRENT_TIMESTAMP`).
- Errors crafted so later steps stay consistent with files that already exist (do not renumber/replace 01_schema.sql; extend it or add `03_*.sql` migrations).

---

# Task 2: Sign in / Sign up with the Database ✅ (2026-11-09)

Implemented the full authentication flow against MySQL, per the finalized PLAN.md stack (Clerk + Google OAuth in production, dev fallback without a Clerk account).

## Delivered

**Backend (new, `backend/`):**
- `requirements.txt`, `.env.example`, `.env` (local, gitignored — MySQL root password obtained from user), `pytest.ini`.
- `app/core/config.py` — pydantic-settings; `clerk_enabled` switches auth mode.
- `app/core/security.py` — token verification + RBAC: Clerk RS256 via `PyJWKClient` (JWKS caching) when `CLERK_JWKS_URL` is set; local HS256 dev tokens otherwise. `derive_provider()` maps Clerk `id.oauth_google*` claims → `GOOGLE`. Dependencies: `get_current_claims`, `get_current_user` (DB lookup via `clerk_user_id`), `require_role('STAFF', 'ADMIN')`-style RBAC factory.
- `app/db/session.py` — SQLAlchemy 2.0 engine (explicit parameterized SQL per PLAN.md, no ORM) + user fetch helpers.
- `app/routers/auth.py`:
  - `POST /api/auth/sync` — upserts the Clerk/Google identity into `USERS` (first sign-in = implicit sign-up with `CUSTOMER` role; later sign-ins refresh profile fields). Idempotent by `clerk_user_id`.
  - `GET /api/auth/me` — DB profile + role for the Bearer token.
  - Dev-only routers (mounted only while `CLERK_JWKS_URL` empty): `POST /api/auth/dev/register` (409 duplicate email, implicit 422 validation) and `POST /api/auth/dev/login` (404 unknown email) — real DB-backed sign-up/sign-in without Clerk; passwords are NOT checked locally (Clerk's job in production; dev tokens carry the same claim contract: `sub`/`email`/`name`).
- `app/main.py` — FastAPI app, CORS for Vite origins, conditional dev-router mount, `GET /api/health` reporting auth mode.
- `tests/` — `test_security.py` (8 unit tests: token roundtrip, expired/garbage/wrong-secret/missing-sub rejection, provider derivation), `test_auth_api.py` (11 DB-backed tests: register persists to USERS, duplicate 409, login→profile+token→/me works, sync creates/refreshes without duplicating, sync without email claim 400, /me guards 401), `conftest.py` (auto-creates `bk88_stadium_test`, re-applies `01_schema.sql` per session with proper DELIMITER handling, cleans USERS per test, skips cleanly if MySQL unreachable).

**Frontend:**
- `src/lib/api.ts` (new) — typed API client (fetch wrapper with `ApiError`/`ApiUnavailableError`), `authApi.devLogin/devRegister/health`, sessionStorage session helpers.
- `src/pages/Login.tsx` — Sign in / Sign up tabs; calls the backend dev endpoints; friendly errors (404 → suggests Sign up; 409 duplicate); offline fallback to the old demo credentials when the API is unreachable.
- `src/App.tsx` — session state (lazy restore from sessionStorage), logout clears it.
- `src/lib/auth.ts` — `Errors` type extended with `name`; demo-credential comments updated (offline-only).
- `.env.example` with `VITE_API_URL`.

## Live verification (local MySQL 26.7, service MySQL267, root password from user)

- `01_schema.sql` **deployed to `bk88_stadium`** (all 8 tables + 3 views — first live DDL validation).
- pytest: **19 passed** (8 unit + 11 DB-backed via `BK88_TEST_DATABASE_URL=...bk88_stadium_test`; the test DB is recreated from the schema each session).
- Frontend: **46 vitest passed**, `tsc -b` + `vite build` clean, eslint clean (fixed one `set-state-in-effect` by using lazy `useState` init).
- uvicorn smoke test against the real DB: /health → dev-fallback; register → row id 1 in USERS; login → token → /me → profile; unknown email → 404; missing token → 401. Smoke user deleted afterwards; uvicorn stopped.
- **Bonus — closed previous open item: live trigger verification** (rolled-back transaction, real DB untouched): overlapping INSERT blocked (ER_SIGNAL_EXCEPTION 1644 with 'Slot conflict…'), adjacent half-open slot accepted, overlapping UPDATE blocked, CANCELLED frees the slot for rebooking, and `trg_bsvc_recalc_ins/upd/del` maintain `service_amount`/`total_amount` exactly (20k→30k→0 with correct totals).
- Found + documented MySQL 1442 limitation: `BOOKING_SERVICES` recalc triggers UPDATE `BOOKINGS`, so `INSERT … SELECT … FROM BOOKINGS` into `BOOKING_SERVICES` fails; app must insert line items with plain VALUES (noted in `backend/sql/DESIGN.md` §Invoice sync triggers).

## Bugs found & fixed during verification

- `get_current_user` initially used `next(get_connection())` — the unreferenced generator is GC'd immediately, closing the connection mid-request (ResourceClosedError). Replaced with direct `engine.connect()`; removed the unused `get_connection` helper.
- conftest schema applier initially split statements on `;` and a `--` comment line contained a semicolon, fragmenting the BOOKINGS DDL; now strips full-line comments first. Also made schema apply idempotent (DROP/CREATE test DB per session).
- `URL.set(database=None)` doesn't remove the database name (None = unchanged) — building the server URL with `URL.create` instead.

## Conventions / notes for next steps

- Run backend: `cd backend && python -m uvicorn app.main:app --reload`. Run tests: `BK88_TEST_DATABASE_URL=... python -m pytest` (auto-skips without MySQL).
- `.env` contains the real DB password — **gitignored**, never commit it. Test credentials: DB `bk88_stadium_test` (schema re-applied by conftest; disposable).
- When Clerk is adopted: set `CLERK_JWKS_URL` + `CLERK_ISSUER`, frontend switches to `@clerk/clerk-react` per PLAN.md; `POST /api/auth/sync` then upserts Google OAuth users (`derive_provider` already handles it). Plan items marked remaining: seed data (`02_seed.sql`), bookings/fields/payments/reports routers, frontend live-data wiring.

---

# Task 4: Requirement change — database switched MySQL → SQL Server ✅ (2026-11-09)

**BREAKING CHANGE.** The whole stack now runs on **Microsoft SQL Server 2025 Express** (local instance `localhost\SQLEXPRESS`, Windows Authentication, ODBC Driver 18). The MySQL artifacts (server MySQL267, `bk88_stadium` + `bk88_stadium_test` on `localhost:3306`) are no longer used by this project — they can be dropped by the user at will (left untouched intentionally).

## Schema (`backend/sql/01_schema.sql`, fully rewritten in T-SQL)

- `ENUM` → `NVARCHAR` + `CHECK (col IN (...))` domains (roles, statuses, providers, payment types, field types).
- `AUTO_INCREMENT` → `IDENTITY(1,1)`; `SET amenities` → comma-token `NVARCHAR(200)` with character-class CHECK; utf8mb4 → `NVARCHAR`.
- Generated columns → `total_amount` / `subtotal` computed `PERSISTED` columns (same anti-drift invariant).
- Overlap triggers: MySQL `BEFORE INSERT/UPDATE` + `SIGNAL SQLSTATE '45000'` → **`AFTER` triggers with `ROLLBACK TRANSACTION; THROW 50001`** (same "Slot conflict…" error text; different semantics — whole transaction rolls back, documented in DESIGN.md §3). UPDATE variant joins `inserted`/`deleted` and only fires when a slot-defining column changed.
- Invoice-recalc triggers rework with `inserted`/`deleted` pseudo-tables — **the MySQL 1442 limitation is gone** (`INSERT INTO BOOKING_SERVICES … SELECT … FROM BOOKINGS` now recalculates correctly — verified live).
- `updated_at` columns **dropped** (no `ON UPDATE CURRENT_TIMESTAMP` in SQL Server; `created_at` + status history retained — documented).
- Views translated (`CAST(... AS DATE)`, `DATEDIFF(MINUTE,...)/60.0`, `CASE WHEN` counts); FK cascade policy preserved (`NO ACTION` ≈ RESTRICT).
- Script is fully idempotent: `IF OBJECT_ID` table guards, sys.indexes-guarded `CREATE INDEX` (7 wrapped by script + 1 manual — one spans two lines), `CREATE OR ALTER` triggers/views. Added `SET QUOTED_IDENTIFIER ON; ...` batch at top — **required**: sqlcmd sessions open with QUOTED_IDENTIFIER OFF, which fails CREATE TABLE on PERSISTED computed columns (Msg 1934).

## Backend

- Driver: `pymysql` → **`pyodbc`** (requirements, config default, .env/.env.example). Windows auth → no passwords in the repo; `TrustServerCertificate=yes` for the Express self-signed cert.
- Connection form: `mssql+pyodbc:///?odbc_connect=<URL-encoded ODBC string>` because the instance name (`localhost\SQLEXPRESS`) breaks SQLAlchemy host-based URLs (backslash never decodes) and the instance has **no TCP listener** (Named Pipes/Shared Memory only — did NOT touch the user's server config; no TCP/SQL Browser reconfiguration).
- App SQL was already ANSI-portable (`:named` params, plain INSERT/SELECT) — no query changes needed; only docstrings and error paths.
- Tests: conftest rewritten — GO-batch schema applier (skips the CREATE DATABASE/USE deployment batches, strips per-batch comment lines before anchoring regexes), test DB `BK88_STADIUM_TEST` auto-created and fully rebuilt per session (with `ALTER DATABASE ... SET SINGLE_USER WITH ROLLBACK IMMEDIATE` before DROP to evict pooled connections), per-test cleanup via `DELETE` + `DBCC CHECKIDENT` reseed. Tests now run **without env vars** (defaults in conftest target the local instance).

## Live verification (SQL Server 2025 Express)

- Schema deployed via `sqlcmd -S localhost\SQLEXPRESS -E -C -i backend/sql/01_schema.sql` → 8 tables, 5 triggers, 3 views; **0 errors on three consecutive re-runs** (idempotency verified).
- pytest: **19 passed** (8 unit + 11 DB-backed against `BK88_STADIUM_TEST`).
- Trigger suite (throwaway script, real DB, per-phase fresh transactions because trigger ROLLBACK voids the whole txn): overlap INSERT blocked (50001 custom message), adjacent half-open slot accepted, overlap UPDATE blocked, CANCELLED frees slot, recalc after INSERT...SELECT / UPDATE / DELETE → 20000/30000/0 with correct computed totals. DB left empty.
- uvicorn smoke test: health (dev-fallback), register → `USERS` row, duplicate email 409 (**case-insensitive** via CI collation — even `SMOKE@` hits it), login → token → `/me` 200, unknown email 404. Smoke user removed.
- Frontend: **untouched logic** (only `MySQL`→`SQL Server` copy in Login.tsx help text + auth.ts comment); 46 vitest passed, `tsc -b`+build clean, eslint clean.

## Docs updated for SQL Server

- `README.md` — prerequisites (SQL Server + ODBC Driver 18), deploy/verify via sqlcmd, odbc_connect DATABASE_URL explanation, troubleshooting table (driver/cert/login/cors), test commands simplified.
- `PLAN.md` — change record note; all stack mentions (T-SQL, THROW/ROLLBACK, UPDLOCK/HOLDLOCK, pyodbc); completed items checked (scaffold, schema+triggers, auth sync, docs).
- `project_specification.md` — integrity notes (§4 IMPORTANT block), architecture RDBMS node, API table, stack §6.2, NFR §7: all MySQL/InnoDB/PyMySQL/FOR UPDATE/SIGNAL references replaced.
- `backend/sql/DESIGN.md` — rewritten for T-SQL: change record, updated_at removal rationale, UPDLOCK/HOLDLOCK locking, trigger rollback semantics, 1442-limitation removal, NVARCHAR/collation notes.
- Historical MySQL notes **intentionally kept** only as change-record context (schema header, DESIGN change record, PLAN note).

## Conventions update (supersedes Task 1/2 notes)

- Run backend: `cd backend && python -m uvicorn app.main:app --reload`. Tests: `python -m pytest` (no env needed; defaults target `localhost\SQLEXPRESS`).
- DB conventions: `NVARCHAR` strings, `IDENTITY` PKs, `DECIMAL(12,2)` VND, `created_at` only (no updated_at), CI-collation string matching (emails), trigger errors = transaction aborts (backend must treat `THROW 50001` as retry-able transaction failure).
- Override test target via `BK88_TEST_DATABASE_URL` if the instance differs (parseable `odbc_connect` URLs only).
- ~~Still pending~~ **Resolved by Task 7 (2026-11-09):** seed data `02_seed.sql`, bookings/fields/payments/reports routers, Clerk frontend integration, and live-data wiring are all done; bookings locking uses `WITH (UPDLOCK, HOLDLOCK)` as noted.

---

# Task 7: Complete all remaining PLAN.md items ✅ (2026-11-09)

User requested "done all the thing left" — the 8 previously-open action items were all implemented and verified. **PLAN.md is now 100% ticked.**

## Deliverables

1. **Seed data** — `backend/sql/02_seed.sql` (T-SQL, idempotent via `IF NOT EXISTS`; all DECLAREs in one GO batch) + `backend/app/db/init_db.py` (runs 01+02 via GO-splitter, skips CREATE DATABASE/USE batches; `python -m app.db.init_db [--seed-only]`). Seeds the 8 pitches from frontend `data.ts`, 112 PRICING_RULES (off-peak 06–17 base, peak ≥17:00 ×1.15 weekday / ×1.10 +1.25 weekend), 4 SERVICES, 4 sample users (`admin@bk88.vn` ADMIN, `staff@bk88.vn` STAFF, `ron@bk88.vn`+`charles@bk88.vn` CUSTOMERs), 2 sample bookings (DATEADD day+2/+3), 1 deposit. Verified live: 8 fields / 112 rules / 4 services / 6 users / 2 bookings / 1 payment.
2. **Fields/availability routers** — `app/routers/fields.py`: GET `/api/fields`, `/api/fields/availability?date=`, `/api/fields/{id}/availability?date=`, plus `GET /api/services` (services_router). `app/db/scheduling.py` builds the 30-min slot grid, prices each half from PRICING_RULES (Python `(weekday+1)%7` ISO→T-SQL dow), falls back to base price, and marks maintenance-window slots taken.
3. **Bookings/payments routers** — `app/routers/bookings.py`: POST create uses `UPDLOCK, HOLDLOCK` slot locks; overlap or maintenance → 409, invalid grid/closing → 422; GET `?scope=mine|all` with RBAC; PATCH status (owner may only → CANCELLED; staff/admin all); POST services (stock UPDLOCK, insufficient stock → 409, duplicate UQ → 409). `app/routers/payments.py`: POST `/api/payments` (over-balance → 422, not-owner → 403), GET `/api/bookings/{id}/payments`. Note: no OUTPUT-with-triggers on SQL Server — post-INSERT row fetch via `SELECT TOP 1 ... ORDER BY booking_id DESC`.
4. **Reports router** — `app/routers/reports.py`: GET `/api/reports/revenue?days=` (ADMIN only) over the 3 analytical views + status counts + top customers.
5. **Clerk frontend integration** — `@clerk/clerk-react` installed; `main.tsx` conditionally wraps `<ClerkProvider>` when `VITE_CLERK_PUBLISHABLE_KEY` is set; new `ClerkAuth.tsx` (SignIn → `getToken()` → POST `/api/auth/sync` → onLogin); `Login.tsx` dispatches ClerkAuth vs DevLogin. Backend already supports Clerk RS256 — set `CLERK_JWKS_URL`/`CLERK_ISSUER` in `backend/.env` when adopting Clerk (dev-mode stays the default until then).
6. **Frontend wired to live API** — `api.ts` extended (ApiField/ApiSlot/ApiBooking types, `apiFieldToPitch`/`apiBookingToBooking` mappers, fieldsApi/servicesApi/bookingsApi/paymentsApi/reportsApi); `Dashboard.tsx` live-fetches pitches/services/availability/my-bookings when a session token exists, `confirmBooking` = create → addService → 30% deposit → refresh, `cancelBooking` = PATCH; `BookingDialog.tsx` rewritten (dual-mode slotsOverride live vs mock, extras quantity steppers, deposit checkbox + method select); `types.ts` Booking gets optional `dbId`/`status`. **Full offline mock fallback preserved** — existing components/tests untouched.
7. **Admin UI** — new `components/AdminDashboard.tsx`: bookings table with status dropdown (STAFF/ADMIN), revenue cards + top pitches + top customers (ADMIN), wired into Dashboard as an admin tab.

## Verification (all green)

- Backend: `python -m pytest` → **36/36** (16 new tests in `tests/test_booking_api.py` against auto-created `BK88_STADIUM_TEST`; no env vars needed).
- Frontend: `npm run test` → **46/46**, `npm run lint` → 0 errors/0 warnings, `npm run build` → success.
- **Live E2E smoke test** (against running uvicorn on :8000, live `bk88_stadium` DB): dev login ron@bk88.vn → booking create 2026-11-12 17:00+120min on BK-88 Arena – Court 1 (201, ₫644,000) → overlap rejected 409 → Ball Rental ×2 added (total ₫744,000) → 30% E_WALLET deposit ₫193,200 PAID → admin revenue report 200 (₫338,100 across both courts) → customer report access 403 → cleanup CANCELLED 200.

## Notes / conventions

- Activate Clerk later: set `VITE_CLERK_PUBLISHABLE_KEY` (frontend) + `CLERK_JWKS_URL`/`CLERK_ISSUER` (backend `.env`); dev endpoints remain otherwise.
- Seed/resync DB anytime: `cd backend && python -m app.db.init_db` (add `--seed-only` to skip schema).
- Seeded login accounts: `admin@bk88.vn` / `staff@bk88.vn` / `ron@bk88.vn` / `charles@bk88.vn` (dev login or register your own).
- Task 6's filtered unique index (`UQ_USERS_phone ... WHERE phone IS NOT NULL`) already covers new sign-ups; `init_db.py` redeploys it idempotently.

---

# Task 6: Bug fix — second sign-up failed with UQ_USERS_phone violation ✅

**Symptom (found by the user live):** `dev/register` returned `IntegrityError: Violation of UNIQUE KEY constraint 'UQ_USERS_phone'` with duplicate key value `(NULL)`.

**Root cause:** a MySQL→SQL Server translation gap. MySQL UNIQUE allows unlimited NULLs; **SQL Server UNIQUE constraints allow only one NULL**. Any second sign-up without a phone number (the common case — phone is optional in the register payload) crashed. The Task 4 port kept `UNIQUE (phone)` as a constraint with a wrong "same as MySQL" comment; the test suite never caught it because each test registers at most one phone-less user against a clean table.

**Fix:** `USERS.phone` uniqueness is now a **filtered unique index** — `CREATE UNIQUE INDEX UQ_USERS_phone ON dbo.USERS (phone) WHERE phone IS NOT NULL` (unique for real numbers, unlimited NULLs, matching the original MySQL semantics). Applied to the live DB (dropped the constraint + re-ran the idempotent schema; the running dev server needed no restart), regression test added (`test_dev_register_allows_multiple_users_without_phone`), **20/20 tests pass**. Live re-check: `abc@gmail.com` registered successfully and both phone-less accounts ('charles', 'abc') coexist in `BK88_STADIUM.USERS`.

---

# Task 5: .gitignore hygiene ✅

Verified via `git check-ignore` that the real secrets/artifacts were already covered: `backend/.env` (root `.env` pattern), `__pycache__/`, `.pytest_cache/`, `frontend/dist/`, `frontend/node_modules/`, vitest/vite logs. Added an **Editors/IDE** section (`.vscode/`, `.idea/`) and an **OS artifacts** section (`Thumbs.db`, `Desktop.ini`, `.DS_Store`). Deleted an accidental empty `backend/package-lock.json` (Node artifact in a Python-only dir; no package.json ever existed). `git status` now shows only tracked-file modifications — zero untracked noise.

---

# Task 3: README "How to run this project" ✅

Rewrote `README.md` (was only a title) with clone-to-running instructions in order: prerequisites → clone → schema deploy (`mysql < backend/sql/01_schema.sql`, Workbench alternative) → backend venv/deps/`.env`/uvicorn (+ auth-mode note) → frontend `npm install`/`.env`/`npm run dev` → sign-up/sign-in walkthrough with DB verification query → test commands (backend `BK88_TEST_DATABASE_URL` pytest, frontend vitest/build/lint) → troubleshooting table → project structure. Uses `YOUR_MYSQL_PASSWORD` placeholders — the real password stays only in the gitignored `backend/.env`.
