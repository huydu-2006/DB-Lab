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
