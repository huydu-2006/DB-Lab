"""Analytical reports for the Admin dashboard, over the schema's views."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text

from app.core.security import require_role
from app.db.session import engine

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/revenue")
async def revenue_report(
    days: int = Query(default=30, ge=1, le=366),
    user: dict = Depends(require_role("ADMIN")),
) -> dict:
    to_date = date.today()
    from_date = to_date - timedelta(days=days - 1)

    with engine.connect() as conn:
        total = conn.execute(
            text("SELECT COALESCE(SUM(revenue), 0) FROM vw_revenue_daily "
                 "WHERE CAST(payment_date AS date) >= :from_date"),
            {"from_date": from_date},
        ).scalar() or 0

        by_day = [
            {"date": r["payment_date"].isoformat(), "revenue": float(r["revenue"])}
            for r in conn.execute(
                text(
                    "SELECT payment_date, SUM(revenue) AS revenue FROM vw_revenue_daily "
                    "WHERE payment_date >= :from_date GROUP BY payment_date "
                    "ORDER BY payment_date"
                ),
                {"from_date": from_date},
            ).mappings()
        ]

        by_field = [
            {
                "field_id": r["field_id"],
                "name": r["field_name"],
                "field_type": r["field_type"],
                "revenue": float(r["revenue"]),
                "paid_bookings": int(r["paid_bookings"]),
            }
            for r in conn.execute(
                text(
                    "SELECT field_id, field_name, field_type, SUM(revenue) AS revenue, "
                    "       SUM(paid_bookings) AS paid_bookings "
                    "FROM vw_revenue_daily WHERE payment_date >= :from_date "
                    "GROUP BY field_id, field_name, field_type ORDER BY revenue DESC"
                ),
                {"from_date": from_date},
            ).mappings()
        ]

        utilization = [
            {
                "field_id": r["field_id"],
                "name": r["field_name"],
                "avg_utilization_pct": float(r["avg_utilization_pct"]),
                "booked_hours": float(r["booked_hours"]),
            }
            for r in conn.execute(
                text(
                    "SELECT field_id, field_name, AVG(utilization_pct) AS avg_utilization_pct, "
                    "       SUM(booked_hours) AS booked_hours "
                    "FROM vw_field_utilization WHERE booking_date >= :from_date "
                    "GROUP BY field_id, field_name ORDER BY avg_utilization_pct DESC"
                ),
                {"from_date": from_date},
            ).mappings()
        ]

        top_customers = [
            {
                "user_id": r["user_id"],
                "full_name": r["full_name"],
                "total_bookings": int(r["total_bookings"] or 0),
                "lifetime_value": float(r["lifetime_value"] or 0),
                "cancellations": int(r["cancellations"] or 0),
                "no_shows": int(r["no_shows"] or 0),
            }
            for r in conn.execute(
                text(
                    "SELECT TOP 10 * FROM vw_customer_stats "
                    "WHERE lifetime_value IS NOT NULL "
                    "ORDER BY lifetime_value DESC"
                )
            ).mappings()
        ]

        status_counts = {
            r["status"]: int(r["n"])
            for r in conn.execute(
                text("SELECT status, COUNT(*) AS n FROM BOOKINGS GROUP BY status")
            ).mappings()
        }

    return {
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "generated_for": user["full_name"],
        "total_revenue": float(total),
        "revenue_by_day": by_day,
        "revenue_by_field": by_field,
        "utilization": utilization,
        "top_customers": top_customers,
        "status_counts": status_counts,
    }
