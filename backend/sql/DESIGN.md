# BK-88 Stadium — Database Design (MySQL 8.0+, InnoDB)

Implementation: [`01_schema.sql`](./01_schema.sql). This document records the design decisions and how they map to the spec ([project_specification.md](../../project_specification.md)) and the frontend data model ([types.ts](../../frontend/src/lib/types.ts), [booking.ts](../../frontend/src/lib/booking.ts)).

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

- No multivalued/derived attributes stored redundantly: invoice totals are **generated columns**, subtotals derive from `quantity × unit_price_snapshot`, and the amount actually billed per service is snapshotted (a historical fact), not duplicated from `SERVICES`.
- `PRICING_RULES` is keyed by `(field_id, day_of_week, time window)` so weekday/weekend and peak/off-peak price tiers never repeat across booking rows.
- M:N between bookings and services resolves through the `BOOKING_SERVICES` junction (with `UNIQUE(booking_id, service_id)` — one consolidated line item per service per booking).

## 2. Table Notes

| Table | Key decisions |
|---|---|
| `USERS` | Sync target of Clerk. Natural keys (`clerk_user_id`, `email`, `phone`) are unique; `phone` is nullable so multiple Clerk-only accounts are allowed. Computed at auth time, never stored raw-material. |
| `FIELDS` | Enriched beyond the spec's minimal ERD to serve the frontend `Pitch` card: `address`, `district`, `rating`, `review_count`, `open_time`/`close_time`, `amenities` (a MySQL `SET` — display-only, fixed-domain attribute; a junction table would be over-engineering). `base_price_per_hour` is the anchor the backend matches against `PRICING_RULES`. |
| `PRICING_RULES` | Time-local windows per field per `day_of_week` (0=Sun..6=Sat), matching the frontend's prime-time concept (≥17:00 → `PEAK`). `CHECK (end_time > start_time)` guards window sanity. |
| `BOOKINGS` | Central integrity point. `total_amount` = `GENERATED (pitch_amount + service_amount) STORED` — the spec's `total >= 0` invariant becomes structurally true, no application math can desynchronize it. Lifecycle: `PENDING → CONFIRMED → COMPLETED` / `CANCELLED` / `NO_SHOW`. |
| `SERVICES` | Catalogue + on-site stock (`stock_quantity >= 0` via CHECK; deducted inside the booking transaction). |
| `BOOKING_SERVICES` | `unit_price_snapshot` preserves historical pricing; `subtotal` is generated. Invoice recalculation (spec §3.2-D) happens automatically via triggers. |
| `PAYMENTS` | Deposit (30%), full, remainder, refund flows. `recorded_by` → `USERS` (SET NULL on delete) identifies the staff member who processed it. `REFUND` rows are positive amounts with type `REFUND`. |
| `MAINTENANCE_LOGS` | Datetime windows (not date+time) because maintenance routinely crosses midnight. Drives the "unavailable" state in the admin UI and availability queries. |

## 3. Integrity Strategy (defense in depth)

1. **Application:** `SELECT ... FOR UPDATE` inside an InnoDB transaction locks the pitch's slot range before inserting a booking.
2. **Triggers:** `trg_bookings_no_overlap_ins` / `trg_bookings_no_overlap_upd`
   `SIGNAL SQLSTATE '45000'` when a `PENDING`/`CONFIRMED` booking would overlap an existing one on the same `(field_id, booking_date)` using the half-open interval test `NEW.start_time < b.end_time AND NEW.end_time > b.start_time`. The UPDATE trigger excludes the row's own `booking_id` and only runs when the slot-defining columns changed. A cancelled booking frees its slot (statuses `CANCELLED`/`NO_SHOW`/`COMPLETED` are not blocking).
   - Note: cancelling/proceeding through status transitions that don't touch time columns never re-fires the overlap check.
3. **CHECKs:** `end_time > start_time` on BOOKINGS/PRICING_RULES, `end_datetime > start_datetime` on MAINTENANCE_LOGS, `quantity > 0`, non-negative prices/amounts/costs, day-of-week range.
4. **Generated columns:** `BOOKINGS.total_amount`, `BOOKING_SERVICES.subtotal` — derived data cannot drift.
5. **Cascade policy:** booking artifacts (`BOOKING_SERVICES`, `PAYMENTS`) cascade-delete with their booking; `FIELDS` and `SERVICES` are `RESTRICT` while referenced (never lose financial history to a pitch typo-delete); `MAINTENANCE_LOGS`/`PRICING_RULES` cascade with their field.

### Invoice sync triggers

`trg_bsvc_recalc_ins/upd/del` on `BOOKING_SERVICES` recompute `BOOKINGS.service_amount = SUM(subtotal)` after every line-item change. This does fire the booking UPDATE trigger, which is a no-op because the time columns didn't change.

> MySQL 1442 constraint (verified live): these triggers `UPDATE BOOKINGS`, so a statement that both inserts into `BOOKING_SERVICES` and *reads* `BOOKINGS` in the same statement (`INSERT … SELECT booking_id … FROM BOOKINGS`) fails with error 1442. The application must insert line items with plain `VALUES` (after resolving `booking_id`) — which is the only pattern the API uses.

### Recurring bookings

Weekly recurring reservations are expanded **in the application** into individual `BOOKINGS` rows inside one transaction (each row gets its own trigger-validated slot). No recurrence metadata is stored; a `recurrence` behavioural field was judged out of scope for the 8-table design fixed in PLAN.md.

## 4. Index Strategy

Following `skills/indexing.md` (equality → range ordering, FK coverage, no over-indexing):

| Index | Serves |
|---|---|
| `BOOKINGS (field_id, booking_date, start_time, end_time)` | Availability lookups, trigger probes, `FOR UPDATE` range locks. Equality columns first, range columns last. |
| `BOOKINGS (user_id, booking_date)` | `GET /api/bookings` ("my bookings", newest first). |
| `BOOKINGS (status)` | Low-cardinality but used by staff queue / reports filters; InnoDB secondary index is cheap here. |
| `FIELDS (field_type, status)` | Frontend pitch filters (type + availability). |
| `PRICING_RULES (field_id, day_of_week)` | Price computation per pitch per weekday. |
| `BOOKING_SERVICES` PK/unique | Line-item lookup and duplicate protection. |
| `PAYMENTS (booking_id)`, `PAYMENTS (created_at)` | Invoice detail; daily revenue GROUP BY. |
| `MAINTENANCE_LOGS (field_id, start_datetime, end_datetime)` | Availability blocking windows per field/date. |

All unique keys are backed by InnoDB indexes automatically; `ENUM` columns avoid free-text drift on every domain value (roles, statuses, payment types).

## 5. Currency & Encoding

- **VND amounts:** `DECIMAL(12,2)` — exact arithmetic, no float drift. Amounts are whole-VND at the application layer.
- **Charset:** `utf8mb4` / `utf8mb4_0900_ai_ci` for Vietnamese names/addresses (`Sân Tao Đàn`, `Phan Đăng Lưu`).
- **Time:** `DATE` + `TIME` for bookings (matches frontend slot grid), `DATETIME` for payments/maintenance. App business timezone is `Asia/Ho_Chi_Minh` (frontend `APP_TIME_ZONE`); the DB stores wall-clock times consistently with that.

## 6. Analytical Read Models (spec §3.2-F)

| View | Feeds |
|---|---|
| `vw_revenue_daily` | Revenue by date/pitch/field type (PAID payments only). |
| `vw_field_utilization` | Occupancy % — booked hours ÷ opening hours per field per day. |
| `vw_customer_stats` | Top customers, lifetime value, cancellation & no-show counts. |

Views are kept as pure aggregate read models with no security/ownership filtering — the backend's Admin RBAC guards `GET /api/reports/*` access.

## 7. Deliberate Non-Choices

- **No JSON columns** — every domain is structured and enumerable (per `skills/schema-design.md` anti-pattern); amenities use `SET`.
- **No soft deletes** — operational actions are status transitions (`CANCELLED`, `INACTIVE`), preserving audit trails without `deleted_at` flags on every table.
- **No denormalized aggregates on hot paths** — booking volume for a single-stadium lab scale is trivially aggregatable; premature counters would add write-path complexity for no measurable gain.
