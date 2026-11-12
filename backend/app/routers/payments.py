"""Deposit / settlement / refund recording for bookings."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.security import get_current_user
from app.db.session import engine

router = APIRouter(prefix="/api", tags=["payments"])


class PaymentCreateIn(BaseModel):
    booking_id: int
    amount: float = Field(gt=0)
    payment_type: str = Field(pattern="^(DEPOSIT|FULL|REMAINDER|REFUND)$")
    payment_method: str = Field(pattern="^(CASH|BANK_TRANSFER|E_WALLET|CARD)$")


@router.post("/payments", status_code=status.HTTP_201_CREATED)
async def record_payment(
    payload: PaymentCreateIn,
    user: dict = Depends(get_current_user),
) -> dict:
    with engine.begin() as conn:
        booking = conn.execute(
            text(
                "SELECT b.booking_id, b.user_id, b.total_amount, b.status, "
                "       COALESCE((SELECT SUM(p.amount) FROM PAYMENTS p "
                "                WHERE p.booking_id = b.booking_id "
                "                  AND p.payment_status = 'PAID'), 0) AS paid "
                "FROM BOOKINGS b WHERE b.booking_id = :bid"
            ),
            {"bid": payload.booking_id},
        ).mappings().first()
        if booking is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Booking not found")
        if booking["user_id"] != user["user_id"] and user["role"] not in ("STAFF", "ADMIN"):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="You can only pay for your own bookings",
            )
        if booking["status"] not in ("PENDING", "CONFIRMED", "COMPLETED"):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail=f"Cannot record a payment on a booking with status {booking['status']}",
            )

        total = float(booking["total_amount"])
        paid = float(booking["paid"])
        balance = total - paid
        if payload.payment_type != "REFUND" and payload.amount > balance + 0.01:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Amount exceeds the outstanding balance ({balance:,.0f} ₫)",
            )

        payment_id = conn.execute(
            text(
                "INSERT INTO PAYMENTS (booking_id, recorded_by, amount, payment_type, "
                "                       payment_method, payment_status, paid_at) "
                "OUTPUT INSERTED.payment_id "
                "VALUES (:bid, :uid, :amt, :ptype, :pmethod, 'PAID', GETDATE())"
            ),
            {
                "bid": payload.booking_id,
                "uid": user["user_id"],
                "amt": payload.amount,
                "ptype": payload.payment_type,
                "pmethod": payload.payment_method,
            },
        ).scalar()

        row = conn.execute(
            text(
                "SELECT p.payment_id, p.booking_id, p.recorded_by, p.amount, "
                "       p.payment_type, p.payment_method, p.payment_status, p.paid_at "
                "FROM PAYMENTS p WHERE p.payment_id = :pid"
            ),
            {"pid": payment_id},
        ).mappings().one()
    return {
        "id": row["payment_id"],
        "booking_id": row["booking_id"],
        "recorded_by": row["recorded_by"],
        "amount": float(row["amount"]),
        "payment_type": row["payment_type"],
        "payment_method": row["payment_method"],
        "payment_status": row["payment_status"],
        "paid_at": row["paid_at"].isoformat(),
    }


@router.get("/bookings/{booking_id}/payments")
async def booking_payments(
    booking_id: int,
    user: dict = Depends(get_current_user),
) -> list[dict]:
    with engine.connect() as conn:
        booking = conn.execute(
            text("SELECT user_id FROM BOOKINGS WHERE booking_id = :bid"),
            {"bid": booking_id},
        ).mappings().first()
        if booking is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Booking not found")
        if booking["user_id"] != user["user_id"] and user["role"] not in ("STAFF", "ADMIN"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not your booking")
        rows = conn.execute(
            text(
                "SELECT payment_id, booking_id, amount, payment_type, payment_method, "
                "       payment_status, paid_at FROM PAYMENTS "
                "WHERE booking_id = :bid ORDER BY payment_id"
            ),
            {"bid": booking_id},
        ).mappings().all()
    return [
        {
            "id": r["payment_id"],
            "booking_id": r["booking_id"],
            "amount": float(r["amount"]),
            "payment_type": r["payment_type"],
            "payment_method": r["payment_method"],
            "payment_status": r["payment_status"],
            "paid_at": r["paid_at"].isoformat() if r["paid_at"] else None,
        }
        for r in rows
    ]
