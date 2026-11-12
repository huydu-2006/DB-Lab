"""Scheduling domain helpers shared by the fields/booking routers.

Mirrors the frontend slot grid (booking.ts): 30-minute slots between the
pitch's open/close times, prime-time pricing from PRICING_RULES, and the
half-open interval overlap predicate that the database triggers enforce.
"""

from datetime import date, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.engine import Connection

SLOT_MINUTES = 30


def _fmt_time(value: object) -> str:
    return value.strftime("%H:%M") if hasattr(value, "strftime") else str(value)


def day_of_week_0_sunday(day: date) -> int:
    """Bookings/Pricing use 0=Sun..6=Sat (DB convention)."""
    return (day.weekday() + 1) % 7


def minutes_of(hhmm: str) -> int:
    hours, minutes = hhmm.split(":")
    return int(hours) * 60 + int(minutes)


def hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def build_slot_starts(open_at: str, close_at: str) -> list[int]:
    """Every 30-minute slot start (minutes from midnight) in [open, close)."""
    open_min, close_min = minutes_of(open_at), minutes_of(close_at)
    return list(range(open_min, close_min, SLOT_MINUTES))


def fetch_field(conn: Connection, field_id: int) -> dict | None:
    row = conn.execute(
        text(
            "SELECT field_id, name, address, district, field_type, surface_type, "
            "       base_price_per_hour, rating, review_count, amenities, "
            "       open_time, close_time, status "
            "FROM FIELDS WHERE field_id = :fid"
        ),
        {"fid": field_id},
    ).mappings().first()
    if row is None:
        return None
    field = dict(row)
    field["open_time"] = _fmt_time(field["open_time"])
    field["close_time"] = _fmt_time(field["close_time"])
    field["amenities"] = field["amenities"] or ""
    return field


def slot_price_per_hour(conn: Connection, field_id: int, day: date, slot_start: str) -> float:
    """Best matching PRICING_RULES rate for the slot; fallback to base price."""
    rate = conn.execute(
        text(
            "SELECT TOP 1 r.price_per_hour FROM PRICING_RULES r "
            "WHERE r.field_id = :fid AND r.day_of_week = :dow "
            "  AND CONVERT(time, :st) >= r.start_time "
            "  AND DATEADD(MINUTE, :mins, CONVERT(time, :st)) <= r.end_time "
            "ORDER BY r.start_time DESC"
        ),
        {
            "fid": field_id,
            "dow": day_of_week_0_sunday(day),
            "st": slot_start,
            "mins": SLOT_MINUTES,
        },
    ).scalar()
    if rate is None:
        rate = conn.execute(
            text("SELECT base_price_per_hour FROM FIELDS WHERE field_id = :fid"),
            {"fid": field_id},
        ).scalar()
    return float(rate)


def covered_minutes(
    conn: Connection, field_id: int, day: date
) -> tuple[set[int], set[int], bool]:
    """Slots covered by bookings / maintenance blocks on a field on a date.

    Returns (taken_minutes, maintenance_minutes, has_any_maintenance) where
    the sets hold slot-start minutes (from midnight).
    """
    taken: set[int] = set()
    for b in conn.execute(
        text(
            "SELECT start_time, end_time FROM BOOKINGS "
            "WHERE field_id = :fid AND booking_date = :d "
            "  AND status IN ('PENDING', 'CONFIRMED')"
        ),
        {"fid": field_id, "d": day},
    ).mappings():
        start = max(minutes_of(_fmt_time(b["start_time"])), 0)
        end = minutes_of(_fmt_time(b["end_time"]))
        taken.update(
            minute
            for minute in range(start, end, SLOT_MINUTES)
            if minute % SLOT_MINUTES == 0
        )

    maintenance: set[int] = set()
    day_start = datetime.combine(day, datetime.min.time())
    has_maint = conn.execute(
        text(
            "SELECT COUNT(1) FROM MAINTENANCE_LOGS "
            "WHERE field_id = :fid AND start_datetime < :day_end AND end_datetime > :day_start"
        ),
        {"fid": field_id, "day_start": day_start, "day_end": day_start + timedelta(days=1)},
    ).scalar() > 0
    if has_maint:
        for m in conn.execute(
            text(
                "SELECT start_datetime, end_datetime FROM MAINTENANCE_LOGS "
                "WHERE field_id = :fid "
                "  AND start_datetime < :day_end AND end_datetime > :day_start"
            ),
            {"fid": field_id, "day_start": day_start, "day_end": day_start + timedelta(days=1)},
        ).mappings():
            start = max(minutes_of(_fmt_time(m["start_datetime"].time())), 0)
            end = minutes_of(_fmt_time(m["end_datetime"].time()))
            maintenance.update(
                minute
                for minute in range(start, end, SLOT_MINUTES)
                if minute % SLOT_MINUTES == 0
            )

    return taken, maintenance, has_maint


def slot_states(
    conn: Connection, field_id: int, day: date
) -> list[dict]:
    """Every 30-minute slot with its state and per-hour price."""
    field = fetch_field(conn, field_id)
    if field is None:
        return []
    taken, maintenance, _ = covered_minutes(conn, field_id, day)
    now = datetime.now()
    today = now.date()

    slots = []
    for minute in build_slot_starts(field["open_time"], field["close_time"]):
        state = "free"
        if minute in taken or minute in maintenance:
            state = "taken"
        elif day == today and minute < now.hour * 60 + now.minute:
            state = "past"
        slots.append(
            {
                "start": hhmm(minute),
                "end": hhmm(minute + SLOT_MINUTES),
                "state": state,
                "price_per_hour": slot_price_per_hour(conn, field_id, day, hhmm(minute)),
            }
        )
    return slots


def price_window(
    conn: Connection, field_id: int, day: date, start_hhmm: str, duration_minutes: int
) -> float:
    """Total pitch price for a booking window: sum of 30-min slot halves."""
    start = minutes_of(start_hhmm)
    total = 0.0
    for minute in range(start, start + duration_minutes, SLOT_MINUTES):
        rate = slot_price_per_hour(conn, field_id, day, hhmm(minute))
        total += rate * (SLOT_MINUTES / 60)
    return round(total)


def overlaps_maintenance(
    conn: Connection, field_id: int, day: date, start_hhmm: str, end_hhmm: str
) -> bool:
    day_start = datetime.combine(day, datetime.min.time())
    collision = conn.execute(
        text("SELECT COUNT(1) FROM MAINTENANCE_LOGS "
             "WHERE field_id = :fid AND start_datetime < :day_end AND end_datetime > :day_start "
             "  AND start_datetime < :win_end AND end_datetime > :win_start"),
        {
            "fid": field_id,
            "day_start": day_start,
            "day_end": day_start + timedelta(days=1),
            "win_start": datetime.combine(day, datetime.strptime(start_hhmm, "%H:%M").time()),
            "win_end": datetime.combine(day, datetime.strptime(end_hhmm, "%H:%M").time()),
        },
    ).scalar()
    return bool(collision)
