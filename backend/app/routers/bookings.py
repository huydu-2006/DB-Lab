"""Transactional booking endpoints.

Concurrency (defense in depth, mirroring the DB triggers):
1. `SELECT ... WITH (UPDLOCK, HOLDLOCK)` serializes the overlap check per
   (field_id, booking_date) range until the INSERT commits;
2. `trg_bookings_no_overlap_ins` rejects anything that slips through
   (mapped to HTTP 409 here).

Service line items decrement `SERVICES.stock_quantity` in the same
transaction; the `trg_bsvc_recalc_*` triggers keep `service_amount` and the
computed `total_amount` in sync automatically.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, ProgrammingError, SQLAlchemyError

from app.core.security import get_current_user, require_role
from app.db.scheduling import (
    SLOT_MINUTES,
    build_slot_starts,
    fetch_field,
    minutes_of,
    overlaps_maintenance,
    price_window,
)
from app.db.session import engine

router = APIRouter(prefix="/api/bookings", tags=["bookings"])

ALLOWED_STATUS_TRANSITIONS_OWN = {"CANCELLED"}
ALLOWED_STATUS_TRANSITIONS_STAFF = {"CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"}


class BookingCreateIn(BaseModel):
    field_id: int
    booking_date: date
    start_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    duration_minutes: int = Field(ge=30, le=180)

    # must be a multiple of the 30-minute grid
    def validate_grid(self) -> None:
        if self.duration_minutes % SLOT_MINUTES != 0:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"duration_minutes must be a multiple of {SLOT_MINUTES}",
            )


class StatusUpdateIn(BaseModel):
    status: str = Field(pattern="^(PENDING|CONFIRMED|COMPLETED|CANCELLED|NO_SHOW)$")


class ServiceAddIn(BaseModel):
    service_id: int
    quantity: int = Field(gt=0)


def _fmt_time(value: object) -> str:
    return value.strftime("%H:%M") if hasattr(value, "strftime") else str(value)


def _booking_payload(row: dict) -> dict:
    data = dict(row)
    for key in ("start_time", "end_time"):
        data[key] = _fmt_time(data[key])
    if isinstance(data.get("booking_date"), date):
        data["booking_date"] = data["booking_date"].isoformat()
    data["pitch_amount"] = float(data.get("pitch_amount") or 0)
    data["service_amount"] = float(data.get("service_amount") or 0)
    data["total_amount"] = float(data.get("total_amount") or 0)
    data["paid_amount"] = float(data.get("paid_amount") or 0)
    return data


BOOKING_SELECT = (
    "SELECT b.booking_id, b.user_id, u.full_name AS user_name, b.field_id, "
    "       f.name AS field_name, b.booking_date, b.start_time, b.end_time, "
    "       b.status, b.pitch_amount, b.service_amount, b.total_amount, b.notes, "
    "       COALESCE((SELECT SUM(p.amount) FROM PAYMENTS p "
    "                WHERE p.booking_id = b.booking_id AND p.payment_status = 'PAID'), 0) "
    "         AS paid_amount "
    "FROM BOOKINGS b "
    "JOIN USERS u ON u.user_id = b.user_id "
    "JOIN FIELDS f ON f.field_id = b.field_id "
)


def _load_booking(conn, booking_id: int) -> dict | None:
    row = conn.execute(
        text(BOOKING_SELECT + "WHERE b.booking_id = :bid"),
        {"bid": booking_id},
    ).mappings().first()
    return _booking_payload(dict(row)) if row else None


def _load_services(conn, booking_id: int) -> list[dict]:
    rows = conn.execute(
        text(
            "SELECT bs.booking_service_id, bs.service_id, s.name AS service_name, "
            "       s.unit, bs.quantity, bs.unit_price_snapshot, bs.subtotal "
            "FROM BOOKING_SERVICES bs JOIN SERVICES s ON s.service_id = bs.service_id "
            "WHERE bs.booking_id = :bid ORDER BY bs.booking_service_id"
        ),
        {"bid": booking_id},
    ).mappings().all()
    return [
        {
            "id": r["booking_service_id"],
            "service_id": r["service_id"],
            "name": r["service_name"],
            "unit": r["unit"],
            "quantity": int(r["quantity"]),
            "unit_price": float(r["unit_price_snapshot"]),
            "subtotal": float(r["subtotal"]),
        }
        for r in rows
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_booking(
    payload: BookingCreateIn,
    user: dict = Depends(get_current_user),
) -> dict:
    payload.validate_grid()

    start = minutes_of(payload.start_time)
    end = start + payload.duration_minutes
    end_hhmm = f"{end // 60:02d}:{end % 60:02d}"

    with engine.begin() as conn:
        field = fetch_field(conn, payload.field_id)
        if field is None or field["status"] != "ACTIVE":
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail="Pitch not found or not active",
            )
        grid = build_slot_starts(field["open_time"], field["close_time"])
        if start not in grid:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"start_time must be within the opening window "
                       f"{field['open_time']}–{field['close_time']} on the {SLOT_MINUTES}-minute grid",
            )
        if end > grid[-1] + SLOT_MINUTES:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"The booking would run past closing time ({field['close_time']}).",
            )
        if overlaps_maintenance(
            conn, payload.field_id, payload.booking_date, payload.start_time, end_hhmm
        ):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Slot conflict: the pitch is under maintenance in this window",
            )

        # serialize the range check against concurrent bookings
        conflict = conn.execute(
            text(
                "SELECT COUNT(1) FROM BOOKINGS WITH (UPDLOCK, HOLDLOCK) "
                "WHERE field_id = :fid AND booking_date = :d "
                "  AND status IN ('PENDING', 'CONFIRMED') "
                "  AND CONVERT(time, :st) < end_time AND CONVERT(time, :et) > start_time"
            ),
            {
                "fid": payload.field_id,
                "d": payload.booking_date,
                "st": payload.start_time,
                "et": end_hhmm,
            },
        ).scalar()
        if conflict:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Slot conflict: this pitch is already booked in the requested time window",
            )

        amount = price_window(
            conn, payload.field_id, payload.booking_date,
            payload.start_time, payload.duration_minutes,
        )
        try:
            # NOTE: OUTPUT INSERTED cannot be used here — BOOKINGS has enabled
            # triggers (SQL Server error 334) — so the new row is identified
            # from the unique slot instead.
            conn.execute(
                text(
                    "INSERT INTO BOOKINGS (user_id, field_id, booking_date, start_time, "
                    "                       end_time, status, pitch_amount) "
                    "VALUES (:uid, :fid, :d, :st, :et, 'PENDING', :amt)"
                ),
                {
                    "uid": user["user_id"],
                    "fid": payload.field_id,
                    "d": payload.booking_date,
                    "st": payload.start_time,
                    "et": end_hhmm,
                    "amt": amount,
                },
            )
            booking_id = conn.execute(
                text(
                    "SELECT TOP 1 booking_id FROM BOOKINGS "
                    "WHERE user_id = :uid AND field_id = :fid AND booking_date = :d "
                    "  AND start_time = :st AND status = 'PENDING' "
                    "ORDER BY booking_id DESC"
                ),
                {
                    "uid": user["user_id"],
                    "fid": payload.field_id,
                    "d": payload.booking_date,
                    "st": payload.start_time,
                },
            ).scalar()
        except (ProgrammingError, IntegrityError, SQLAlchemyError) as exc:
            if "Slot conflict" in str(exc):
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    detail="Slot conflict: this pitch is already booked in the requested time window",
                ) from exc
            raise

        result = _load_booking(conn, booking_id)
        result["services"] = []

    return result


@router.get("")
async def list_bookings(
    scope: str = Query(default="mine", pattern="^(mine|all)$"),
    user: dict = Depends(get_current_user),
) -> list[dict]:
    if scope == "all" and user["role"] not in ("STAFF", "ADMIN"):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Only Staff/Admin can list all bookings",
        )
    where = "" if scope == "all" else "WHERE b.user_id = :uid"
    params = {} if scope == "all" else {"uid": user["user_id"]}

    with engine.connect() as conn:
        bookings = [
            _booking_payload(dict(r))
            for r in conn.execute(
                text(BOOKING_SELECT + where + " ORDER BY b.booking_date DESC, b.start_time"),
                params,
            ).mappings()
        ]
        for booking in bookings:
            booking["services"] = _load_services(conn, booking["booking_id"])
    return bookings


@router.patch("/{booking_id}/status")
async def update_status(
    booking_id: int,
    payload: StatusUpdateIn,
    user: dict = Depends(get_current_user),
) -> dict:
    with engine.begin() as conn:
        booking = _load_booking(conn, booking_id)
        if booking is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Booking not found")

        allowed = (
            ALLOWED_STATUS_TRANSITIONS_STAFF
            if user["role"] in ("STAFF", "ADMIN")
            else ALLOWED_STATUS_TRANSITIONS_OWN
        )
        if payload.status not in allowed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail=f"Your role ({user['role']}) may not set status {payload.status}",
            )
        if user["role"] not in ("STAFF", "ADMIN") and booking["user_id"] != user["user_id"]:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, detail="You can only change your own bookings"
            )
        try:
            conn.execute(
                text("UPDATE BOOKINGS SET status = :s WHERE booking_id = :bid"),
                {"s": payload.status, "bid": booking_id},
            )
        except SQLAlchemyError as exc:
            if "Slot conflict" in str(exc):
                raise HTTPException(
                    status.HTTP_409_CONFLICT, detail=str(exc)
                ) from exc
            raise
        updated = _load_booking(conn, booking_id)
        updated["services"] = _load_services(conn, booking_id)
    return updated


@router.post("/{booking_id}/services", status_code=status.HTTP_201_CREATED)
async def add_booking_service(
    booking_id: int,
    payload: ServiceAddIn,
    user: dict = Depends(get_current_user),
) -> dict:
    with engine.begin() as conn:
        booking = _load_booking(conn, booking_id)
        if booking is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Booking not found")
        if booking["user_id"] != user["user_id"] and user["role"] not in ("STAFF", "ADMIN"):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, detail="You can only modify your own bookings"
            )
        if booking["status"] not in ("PENDING", "CONFIRMED"):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Services can only be added to pending or confirmed bookings",
            )

        service = conn.execute(
            text("SELECT service_id, unit_price, stock_quantity FROM SERVICES "
                 "WITH (UPDLOCK, HOLDLOCK) WHERE service_id = :sid"),
            {"sid": payload.service_id},
        ).mappings().first()
        if service is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Service not found")
        if int(service["stock_quantity"]) < payload.quantity:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail=f"Insufficient stock for this service "
                       f"({service['stock_quantity']} left)",
            )
        try:
            conn.execute(
                text(
                    "UPDATE SERVICES SET stock_quantity = stock_quantity - :q "
                    "WHERE service_id = :sid"
                ),
                {"q": payload.quantity, "sid": payload.service_id},
            )
            conn.execute(
                text(
                    "INSERT INTO BOOKING_SERVICES (booking_id, service_id, quantity, "
                    "                               unit_price_snapshot) "
                    "VALUES (:bid, :sid, :q, :p)"
                ),
                {
                    "bid": booking_id,
                    "sid": payload.service_id,
                    "q": payload.quantity,
                    "p": float(service["unit_price"]),
                },
            )
        except IntegrityError as exc:  # duplicate (booking_id, service_id)
            if "UQ_BOOKING_SERVICE" in str(exc):
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    detail="This service is already on the booking; increase the "
                           "quantity there instead",
                ) from exc
            raise

        updated = _load_booking(conn, booking_id)
        updated["services"] = _load_services(conn, booking_id)
    return updated
