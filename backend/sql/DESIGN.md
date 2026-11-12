# BK-88 Stadium — Database Design (Microsoft SQL Server 2019+/Express, T-SQL)

Implementation: [`01_schema.sql`](./01_schema.sql). This document records the design decisions and how they map to the spec ([project_specification.md](../../project_specification.md)) and the frontend data model ([types.ts](../../frontend/src/lib/types.ts), [booking.ts](../../frontend/src/lib/booking.ts)).

> **Change record (2026-11-09):** the requirement changed from MySQL 8.0+ (InnoDB) to **Microsoft SQL Server**. Translation notes are inline in the schema header; the MySQL `SIGNAL SQLSTATE '45000'` overlap design became `AFTER` triggers with `ROLLBACK TRANSACTION; THROW 50001`, and `ENUM`/`SET`/generated-column/`AUTO_INCREMENT` constructs became `CHECK` constraints, an `NVARCHAR` token list, `PERSISTED` computed columns, and `IDENTITY(1,1)`.

## 1. Entity-Relationship Model

```
USERS ||--o{ BOOKINGS : places
FIELDS ||--o{ PRICING_RULES : has
FIELDS ||--o{ BOOKINGS : hosts
FIELDS ||--o{ MAINTENANCE_LOGS : undergoes
BOOKINGS ||--o{ BOOKING_SERVICES : includes
SERVICES ||--o{ BOOKING_SERVICES : "used in"
BOOKINGS ||--o{ PAYMENTS : "paid via"
USERS ||--o{ PAYMENTS : "records (staff)"   (recorded_by, nullable)
```

The schema is in 3NF/BCNF:

- No multivalued/derived attributes stored redundantly: invoice totals are **computed columns PERSISTED**, subtotals derive from `quantity × unit_price_snapshot`, and the amount actually billed per service is snapshotted (a historical fact), not duplicated from `SERVICES`.
- `PRICING_RULES` is keyed by `(field_id, day_of_week, time window)` so weekday/weekend and peak/off-peak price tiers never repeat across booking rows.
- M:N between bookings and services resolves through the `BOOKING_SERVICES` junction (with `UNIQUE(booking_id, service_id)` — one consolidated line item per service per booking).

## 2. Table Notes

| Table | Key decisions |
|---|---|
| `USERS` | Sync target of Clerk. Natural keys (`clerk_user_id`, `email`, `phone`) are unique; `phone` is nullable (a single NULL passes the UNIQUE constraint). Roles (`CUSTOMER/STAFF/ADMIN`) and providers (`CLERK/GOOGLE`) are CHECK-constrained domains. |
| `FIELDS` | Enriched beyond the spec's minimal ERD to serve the frontend `Pitch` card: `address`, `district`, `rating`, `review_count`, `open_time`/`close_time`, `amenities` (a comma-separated token list — display-only, fixed domain; a junction table would be over-engineering, a character-class CHECK limits it). `base_price_per_hour` is the anchor the backend matches against `PRICING_RULES`. |
| `PRICING_RULES` | Time-local windows per field per `day_of_week` (0=Sun..6=Sat), matching the frontend's prime-time concept (≥17:00 → `PEAK`). `CHECK (end_time > start_time)` guards window sanity. |
| `BOOKINGS` | Central integrity point. `total_amount` = **computed `(pitch_amount + service_amount) PERSISTED`** — desynchronization is structurally impossible. Lifecycle: `PENDING → CONFIRMED → COMPLETED` / `CANCELLED` / `NO_SHOW`. |
| `SERVICES` | Catalogue + on-site stock (`stock_quantity >= 0` via CHECK; deducted inside the booking transaction). |
| `BOOKING_SERVICES` | `unit_price_snapshot` preserves historical pricing; `subtotal` is computed. Invoice recalculation (spec §3.2-D) happens automatically via triggers. |
| `PAYMENTS` | Deposit (30%), full, remainder, refund flows. `recorded_by` → `USERS` (SET NULL on delete) identifies the staff member who processed it. `REFUND` rows are positive amounts with type `REFUND`. |
| `MAINTENANCE_LOGS` | Datetime windows (not date+time) because maintenance routinely crosses midnight. Drives the "unavailable" state in the admin UI and availability queries. |

**Note on `updated_at`:** MySQL's `ON UPDATE CURRENT_TIMESTAMP` has no SQL Server equivalent as a column default, so the audit story is `created_at` + explicit status transitions (`status` history matters more than wall-clock mutation times here). Every table carries `created_at DATETIME2 DEFAULT GETDATE()`; `updated_at` was removed rather than left untrustworthy.

## 3. Integrity Strategy (defense in depth)

1. **Application:** `SELECT ... WITH (UPDLOCK, HOLDLOCK)` inside an explicit transaction serializes slot checks per pitch range — the SQL Server pattern that replaces MySQL's `SELECT ... FOR UPDATE` row locking.
2. **Triggers:** `trg_bookings_no_overlap_ins` / `trg_bookings_no_overlap_upd`
   SQL Server has no BEFORE triggers; the AFTER triggers detect half-open interval overlap (`i.start_time < b.end_time AND i.end_time > b.start_time`) among `PENDING`/`CONFIRMED` bookings on the same `(field_id, booking_date)`, then `ROLLBACK TRANSACTION; THROW 50001` — cancelling the statement and surfacing the same "Slot conflict…" error the old `SIGNAL SQLSTATE '45000'` produced. The UPDATE trigger joins `inserted`/`deleted` and only runs the check when a slot-defining column actually changed; pure status transitions and recalc-trigger writes never re-run the overlap check. `CANCELLED`/`NO_SHOW` rows free their slots.
3. **CHECKs:** `end_time > start_time` on BOOKINGS/PRICING_RULES, `end_datetime > start_datetime` on MAINTENANCE_LOGS, `quantity > 0`, non-negative prices/amounts/costs/stock, day-of-week range, and every ENUM-replacement domain list.
4. **Computed columns:** `BOOKINGS.total_amount`, `BOOKING_SERVICES.subtotal` — derived data cannot drift.
5. **Cascade policy:** booking artifacts (`BOOKING_SERVICES`, `PAYMENTS`) cascade-delete with their booking; `FIELDS` and `SERVICES` use `NO ACTION` (≈ RESTRICT) while referenced — never lose financial history to a pitch typo-delete; `MAINTENANCE_LOGS`/`PRICING_RULES` cascade with their field (SQL Server allows only one cascading path, which this graph respects).

### Invoice sync triggers

`trg_bsvc_recalc_ins/upd/del` on `BOOKING_SERVICES` recompute `BOOKINGS.service_amount = SUM(subtotal)` after every line-item change, using the `inserted` (or `deleted`) pseudo-tables. Because the recalc is an `UPDATE ... FROM` join against pseudo-tables — not against the statement's source tables — the MySQL 1442 restriction ("can't update BOOKINGS when the invoking statement reads it") is **gone**: even `INSERT INTO BOOKING_SERVICES ... SELECT ... FROM BOOKINGS` recalculates correctly (verified live).

### Trigger rollback semantics (verified live)

`ROLLBACK` inside an AFTER trigger voids the **whole transaction**, not just the statement (unlike MySQL SIGNAL). Application code must therefore treat an overlap error as a transaction-abort: re-begin, re-check, retry. The pytest suite and trigger smoke checks run each scenario in a fresh transaction for exactly this reason.

### Recurring bookings

Weekly recurring reservations are expanded **in the application** into individual `BOOKINGS` rows inside one transaction (each row gets its own trigger-validated slot). No recurrence metadata is stored; a `recurrence` behavioural field was judged out of scope for the 8-table design fixed in PLAN.md.

## 4. Index Strategy

Following `skills/indexing.md` (equality → range ordering, FK coverage, no over-indexing):

| Index | Serves |
|---|---|
| `BOOKINGS (field_id, booking_date, start_time, end_time)` | Availability lookups, trigger probes, `UPDLOCK/HOLDLOCK` range locks. Equality columns first, range columns last. |
| `BOOKINGS (user_id, booking_date)` | `GET /api/bookings` ("my bookings", newest first). |
| `BOOKINGS (status)` | Low-cardinality but used by staff queue / reports filters. |
| `FIELDS (field_type, status)` | Frontend pitch filters (type + availability). |
| `PRICING_RULES (field_id, day_of_week)` | Price computation per pitch per weekday. |
| `BOOKING_SERVICES` PK/unique | Line-item lookup and duplicate protection. |
| `PAYMENTS (booking_id)`, `PAYMENTS (created_at)` | Invoice detail; daily revenue GROUP BY. |
| `MAINTENANCE_LOGS (field_id, start_datetime, end_datetime)` | Availability blocking windows per field/date. |

All UNIQUE keys are backed by indexes automatically; CHECK-constrained `NVARCHAR` domains avoid free-text drift on every domain value (roles, statuses, payment types).

## 5. Currency & Encoding

- **VND amounts:** `DECIMAL(12,2)` — exact arithmetic, no float drift. Amounts are whole-VND at the application layer.
- **Encoding:** `NVARCHAR` (UTF-16) for Vietnamese names/addresses (`Sân Tao Đàn`, `Phan Đăng Lưu`); string comparisons follow the database's case-insensitive collation (emails are matched case-insensitively — the dev-register duplicate test relies on it).
- **Time:** `DATE` + `TIME` for bookings (matches frontend slot grid), `DATETIME2` for payments/maintenance. App business timezone is `Asia/Ho_Chi_Minh` (frontend `APP_TIME_ZONE`); the DB stores wall-clock times consistently with that.

## 6. Analytical Read Models (spec §3.2-F)

| View | Feeds |
|---|---|
| `vw_revenue_daily` | Revenue by date/pitch/field type (PAID payments only). |
| `vw_field_utilization` | Occupancy % — booked hours ÷ opening hours per field per day. |
| `vw_customer_stats` | Top customers, lifetime value, cancellation & no-show counts. |

Views are pure aggregate read models with no security/ownership filtering — the backend's Admin RBAC guards `GET /api/reports/*` access.

## 7. Deliberate Non-Choices

- **No JSON columns** — every domain is structured and enumerable; amenities use a CHECK-constrained token list.
- **No soft deletes** — operational actions are status transitions (`CANCELLED`, `INACTIVE`), preserving audit trails without `deleted_at` flags on every table.
- **No denormalized aggregates on hot paths** — booking volume for a single-stadium lab scale is trivially aggregatable; premature counters would add write-path complexity for no measurable gain.
- **No `updated_at` triggers** — maintaining them via an extra AFTER UPDATE trigger per table was judged noise over signal; `created_at` + status history covers the audit need.
