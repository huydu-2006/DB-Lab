"""Pitch & availability endpoints (public reading, per PLAN.md)."""

from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import text

from app.db.scheduling import fetch_field, slot_states
from app.db.session import engine

router = APIRouter(prefix="/api/fields", tags=["fields"])


def _field_payload(row: dict) -> dict:
    return {
        "id": row["field_id"],
        "name": row["name"],
        "address": row["address"],
        "district": row["district"],
        # WGS-84 coordinates for map links; NULL when unknown (frontend then
        # links by address text).
        "latitude": float(row["latitude"]) if row["latitude"] is not None else None,
        "longitude": float(row["longitude"]) if row["longitude"] is not None else None,
        "type": {"5v5": "5-a-side", "7v7": "7-a-side", "11v11": "11-a-side"}.get(
            row["field_type"], row["field_type"]
        ),
        "surface": {
            "ARTIFICIAL_TURF": "Artificial turf",
            "NATURAL_GRASS": "Natural grass",
        }.get(row["surface_type"], row["surface_type"]),
        "basePricePerHour": float(row["base_price_per_hour"]),
        "rating": float(row["rating"]),
        "reviews": int(row["review_count"]),
        "amenities": [
            {
                "FLOODLIGHTS": "Floodlights",
                "CHANGING_ROOMS": "Changing rooms",
                "PARKING": "Parking",
                "SHOWERS": "Showers",
                "CAFE": "Café",
                "FREE_WIFI": "Free Wi-Fi",
                "EQUIPMENT_HIRE": "Equipment hire",
                "FIRST_AID": "First aid",
            }[token.strip()]
            for token in (row["amenities"] or "").split(",")
            if token.strip()
        ],
        "openAt": row["open_time"],
        "closeAt": row["close_time"],
        "status": row["status"],
    }


@router.get("")
async def list_fields(
    field_type: str | None = Query(default=None, pattern="^(5v5|7v7|11v11)$"),
    status_filter: str | None = Query(default=None, alias="status"),
) -> list[dict]:
    """List pitches with optional type/status filters (public)."""
    query = (
        "SELECT field_id, name, address, district, latitude, longitude, "
        "       field_type, surface_type, "
        "       base_price_per_hour, rating, review_count, amenities, "
        "       CONVERT(varchar(5), open_time, 108) AS open_time, "
        "       CONVERT(varchar(5), close_time, 108) AS close_time, status "
        "FROM FIELDS WHERE (:t IS NULL OR field_type = :t) "
        "  AND (:s IS NULL OR status = :s) ORDER BY field_id"
    )
    params = {"t": field_type, "s": status_filter}
    with engine.connect() as conn:
        rows = conn.execute(text(query), params).mappings().all()
    return [_field_payload(dict(row)) for row in rows]


@router.get("/availability")
async def fields_availability(day: date = Query(alias="date")) -> list[dict]:
    """Free/total slot counts for every ACTIVE field on a date (public)."""
    with engine.connect() as conn:
        fields = conn.execute(
            text(
                "SELECT field_id FROM FIELDS "
                "WHERE status = 'ACTIVE' ORDER BY field_id"
            )
        ).scalars().all()
        summary = []
        for field_id in fields:
            slots = slot_states(conn, field_id, day)
            summary.append(
                {
                    "field_id": field_id,
                    "free": sum(1 for slot in slots if slot["state"] == "free"),
                    "total": len(slots),
                }
            )
    return summary


@router.get("/{field_id}/availability")
async def field_availability(field_id: int, day: date = Query(alias="date")) -> dict:
    """30-minute slot grid with states and prices for one pitch/date (public)."""
    with engine.connect() as conn:
        field = fetch_field(conn, field_id)
        if field is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Field not found")
        slots = slot_states(conn, field_id, day)
    return {
        "field_id": field_id,
        "date": day.isoformat(),
        "openAt": field["open_time"],
        "closeAt": field["close_time"],
        "slots": slots,
    }


services_router = APIRouter(prefix="/api/services", tags=["services"])


@services_router.get("")
async def list_services(active_only: bool = True) -> list[dict]:
    """Add-on matchday service catalogue (public)."""
    query = (
        "SELECT service_id, name, unit, unit_price, stock_quantity, is_active "
        "FROM SERVICES ORDER BY service_id"
    )
    with engine.connect() as conn:
        rows = [dict(r) for r in conn.execute(text(query)).mappings().all()]
    if active_only:
        rows = [r for r in rows if r["is_active"]]
    return [
        {
            "id": r["service_id"],
            "name": r["name"],
            "unit": r["unit"],
            "unitPrice": float(r["unit_price"]),
            "stock": int(r["stock_quantity"]),
        }
        for r in rows
    ]
