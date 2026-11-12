"""API tests for fields/availability, transactional bookings, services,
payments, and admin reports against the SQL Server test database."""

from datetime import date, timedelta

import pytest
from sqlalchemy import text

from app.db.session import engine

TOMORROW = date.today() + timedelta(days=1)


@pytest.fixture()
def seeded(client):  # noqa: ARG001 - client guarantees a clean USERS table
    """Fresh domain data: one priced pitch, one maintenance-blocked pitch,
    one stocked service."""
    with engine.begin() as conn:
        for table in (
            "BOOKING_SERVICES",
            "PAYMENTS",
            "BOOKINGS",
            "MAINTENANCE_LOGS",
            "PRICING_RULES",
            "FIELDS",
            "SERVICES",
        ):
            conn.execute(text(f"DELETE FROM {table}"))
            conn.execute(text(f"DBCC CHECKIDENT ('{table}', RESEED, 0)"))

        conn.execute(
            text(
                "INSERT INTO FIELDS (name, address, district, latitude, longitude, "
                "                    field_type, surface_type, "
                "                    base_price_per_hour, open_time, close_time) "
                "VALUES ('Test Pitch', '1 Test St', 'D1', 10.776500, 106.697200, "
                "        '5v5', 'ARTIFICIAL_TURF', "
                "        200000, '06:00', '23:00')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO FIELDS (name, address, district, field_type, surface_type, "
                "                    base_price_per_hour, open_time, close_time) "
                "VALUES ('Maint Pitch', '2 Test St', 'D1', '5v5', 'ARTIFICIAL_TURF', "
                "        200000, '06:00', '23:00')"
            )
        )
        prices = "INSERT INTO PRICING_RULES (field_id, day_of_week, start_time, end_time, " \
                 "price_per_hour, label) " \
                 "SELECT field_id, d, '06:00', '17:00', 200000, 'OFF_PEAK' " \
                 "FROM FIELDS CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6)) d(d)"
        conn.execute(text(prices))
        conn.execute(
            text(
                "INSERT INTO PRICING_RULES (field_id, day_of_week, start_time, end_time, "
                "price_per_hour, label) "
                "SELECT field_id, d, '17:00', '23:00', 230000, 'PEAK' "
                "FROM FIELDS CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6)) d(d)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO SERVICES (name, unit, unit_price, stock_quantity) "
                "VALUES ('Test Water', 'BOTTLE', 10000, 5)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO MAINTENANCE_LOGS (field_id, start_datetime, end_datetime, "
                "                               description) "
                "SELECT field_id, :day_start, :day_end, 'Repainting' FROM FIELDS "
                "WHERE name = 'Maint Pitch'"
            ),
            {
                "day_start": f"{TOMORROW.isoformat()} 08:00:00",
                "day_end": f"{TOMORROW.isoformat()} 12:00:00",
            },
        )

        field_id, maint_field_id, service_id = conn.execute(
            text("SELECT (SELECT field_id FROM FIELDS WHERE name = 'Test Pitch'), "
                 "       (SELECT field_id FROM FIELDS WHERE name = 'Maint Pitch'), "
                 "       (SELECT service_id FROM SERVICES WHERE name = 'Test Water')")
        ).one()
    return {
        "field_id": int(field_id),
        "maint_field_id": int(maint_field_id),
        "service_id": int(service_id),
    }


def make_user(client, email: str, role: str = "CUSTOMER") -> dict:
    response = client.post(
        "/api/auth/dev/register",
        json={"email": email, "full_name": email.split("@")[0].title(), "role": role},
    )
    assert response.status_code == 201, response.text
    return response.json()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---- fields & availability (public) ----


def test_fields_listed_publicly(client, seeded):  # noqa: ARG001
    response = client.get("/api/fields")
    assert response.status_code == 200
    fields = response.json()
    assert {f["name"] for f in fields} == {"Test Pitch", "Maint Pitch"}
    body = fields[0]
    assert body["type"] == "5-a-side"
    assert body["surface"] == "Artificial turf"
    assert body["basePricePerHour"] == 200000.0
    assert body["latitude"] == 10.7765
    assert body["longitude"] == 106.6972
    assert fields[1]["latitude"] is None  # coords optional


def test_field_availability_counts(client, seeded):
    response = client.get(f"/api/fields/availability?date={TOMORROW.isoformat()}")
    assert response.status_code == 200
    summary = {entry["field_id"]: entry for entry in response.json()}
    # maintenance blocks 08:00-12:00 = 8 slots
    entry = summary[seeded["maint_field_id"]]
    assert entry["total"] == 34          # 06:00 -> 23:00 = 17h = 34 slots
    assert entry["free"] == 34 - 8


def test_field_slot_grid_and_prices(client, seeded):
    response = client.get(
        f"/api/fields/{seeded['field_id']}/availability?date={TOMORROW.isoformat()}"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["openAt"] == "06:00" and body["closeAt"] == "23:00"
    slots = body["slots"]
    assert len(slots) == 34
    by_start = {slot["start"]: slot for slot in slots}
    assert by_start["12:00"]["state"] == "free"
    assert by_start["12:00"]["price_per_hour"] == 200000.0
    assert by_start["18:00"]["price_per_hour"] == 230000.0


def test_unknown_field_is_404(client, seeded):  # noqa: ARG001
    assert client.get(f"/api/fields/9999/availability?date={TOMORROW.isoformat()}").status_code == 404


# ---- booking creation ----


def test_create_booking_prices_rule_rates(client, seeded):
    user = make_user(client, "booker@bk88.vn")
    response = client.post(
        "/api/bookings",
        json={
            "field_id": seeded["field_id"],
            "booking_date": TOMORROW.isoformat(),
            "start_time": "18:00",
            "duration_minutes": 90,
        },
        headers=auth(user["token"]),
    )
    assert response.status_code == 201, response.text
    booking = response.json()
    assert booking["status"] == "PENDING"
    assert booking["total_amount"] == 230000.0 * 1.5   # 1.5h prime
    assert booking["start_time"] == "18:00" and booking["end_time"] == "19:30"


def test_overlapping_booking_rejected_409(client, seeded):
    user = make_user(client, "booker@bk88.vn")
    client.post(
        "/api/bookings",
        json={
            "field_id": seeded["field_id"],
            "booking_date": TOMORROW.isoformat(),
            "start_time": "18:00",
            "duration_minutes": 90,
        },
        headers=auth(user["token"]),
    )
    response = client.post(
        "/api/bookings",
        json={
            "field_id": seeded["field_id"],
            "booking_date": TOMORROW.isoformat(),
            "start_time": "19:00",
            "duration_minutes": 60,
        },
        headers=auth(user["token"]),
    )
    assert response.status_code == 409
    assert "Slot conflict" in response.json()["detail"]


def test_maintenance_window_blocks_booking(client, seeded):
    user = make_user(client, "booker@bk88.vn")
    response = client.post(
        "/api/bookings",
        json={
            "field_id": seeded["maint_field_id"],
            "booking_date": TOMORROW.isoformat(),
            "start_time": "10:00",
            "duration_minutes": 60,
        },
        headers=auth(user["token"]),
    )
    assert response.status_code == 409
    assert "maintenance" in response.json()["detail"]


def test_off_grid_and_past_closing_rejected(client, seeded):
    user = make_user(client, "booker@bk88.vn")
    for payload in (
        {"start_time": "18:05", "duration_minutes": 60},   # off the grid
        {"start_time": "22:30", "duration_minutes": 60},   # runs past closing
    ):
        response = client.post(
            "/api/bookings",
            json={"field_id": seeded["field_id"],
                  "booking_date": TOMORROW.isoformat(), **payload},
            headers=auth(user["token"]),
        )
        assert response.status_code == 422, response.text


# ---- listing & RBAC ----


def test_list_bookings_scope_rules(client, seeded):  # noqa: ARG001
    customer = make_user(client, "cust@bk88.vn")
    admin = make_user(client, "bigadmin@bk88.vn", role="ADMIN")

    client.post(
        "/api/bookings",
        json={"field_id": seeded["field_id"], "booking_date": TOMORROW.isoformat(),
              "start_time": "18:00", "duration_minutes": 60},
        headers=auth(customer["token"]),
    )
    mine = client.get("/api/bookings", headers=auth(customer["token"]))
    assert mine.status_code == 200 and len(mine.json()) == 1

    # a customer cannot list everyone's bookings
    assert client.get(
        "/api/bookings?scope=all", headers=auth(customer["token"])
    ).status_code == 403

    # admin can
    everything = client.get("/api/bookings?scope=all", headers=auth(admin["token"]))
    assert everything.status_code == 200
    assert {b["user_name"] for b in everything.json()} == {"Cust"}


# ---- status transitions ----


def test_owner_can_cancel_but_not_confirm(client, seeded):
    customer = make_user(client, "cust@bk88.vn")
    admin = make_user(client, "bigadmin@bk88.vn", role="ADMIN")
    booking = client.post(
        "/api/bookings",
        json={"field_id": seeded["field_id"], "booking_date": TOMORROW.isoformat(),
              "start_time": "18:00", "duration_minutes": 60},
        headers=auth(customer["token"]),
    ).json()

    confirm = client.patch(
        f"/api/bookings/{booking['booking_id']}/status",
        json={"status": "CONFIRMED"},
        headers=auth(customer["token"]),
    )
    assert confirm.status_code == 403

    cancel = client.patch(
        f"/api/bookings/{booking['booking_id']}/status",
        json={"status": "CANCELLED"},
        headers=auth(customer["token"]),
    )
    assert cancel.status_code == 200 and cancel.json()["status"] == "CANCELLED"

    # staff confirm their own is fine on a fresh booking
    booking2 = client.post(
        "/api/bookings",
        json={"field_id": seeded["field_id"], "booking_date": TOMORROW.isoformat(),
              "start_time": "20:00", "duration_minutes": 60},
        headers=auth(admin["token"]),
    ).json()
    confirmed = client.patch(
        f"/api/bookings/{booking2['booking_id']}/status",
        json={"status": "CONFIRMED"},
        headers=auth(admin["token"]),
    )
    assert confirmed.status_code == 200 and confirmed.json()["status"] == "CONFIRMED"


def test_cancelled_slot_can_be_rebooked(client, seeded):
    customer = make_user(client, "cust@bk88.vn")
    booking = client.post(
        "/api/bookings",
        json={"field_id": seeded["field_id"], "booking_date": TOMORROW.isoformat(),
              "start_time": "18:00", "duration_minutes": 60},
        headers=auth(customer["token"]),
    ).json()
    client.patch(
        f"/api/bookings/{booking['booking_id']}/status",
        json={"status": "CANCELLED"},
        headers=auth(customer["token"]),
    )
    rebook = client.post(
        "/api/bookings",
        json={"field_id": seeded["field_id"], "booking_date": TOMORROW.isoformat(),
              "start_time": "18:00", "duration_minutes": 60},
        headers=auth(customer["token"]),
    )
    assert rebook.status_code == 201


# ---- add-on services & stock ----


def test_add_service_deducts_stock_and_recalculates(client, seeded):
    customer = make_user(client, "cust@bk88.vn")
    booking = client.post(
        "/api/bookings",
        json={"field_id": seeded["field_id"], "booking_date": TOMORROW.isoformat(),
              "start_time": "18:00", "duration_minutes": 60},
        headers=auth(customer["token"]),
    ).json()

    response = client.post(
        f"/api/bookings/{booking['booking_id']}/services",
        json={"service_id": seeded["service_id"], "quantity": 3},
        headers=auth(customer["token"]),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["service_amount"] == 30000.0
    assert body["total_amount"] == 230000.0 + 30000.0

    with engine.connect() as conn:
        stock = conn.execute(
            text("SELECT stock_quantity FROM SERVICES WHERE service_id = :s"),
            {"s": seeded["service_id"]},
        ).scalar()
    assert int(stock) == 5 - 3

    # duplicate line item is rejected with a helpful message
    dup = client.post(
        f"/api/bookings/{booking['booking_id']}/services",
        json={"service_id": seeded["service_id"], "quantity": 1},
        headers=auth(customer["token"]),
    )
    assert dup.status_code == 409


def test_insufficient_stock_is_409(client, seeded):
    customer = make_user(client, "cust@bk88.vn")
    booking = client.post(
        "/api/bookings",
        json={"field_id": seeded["field_id"], "booking_date": TOMORROW.isoformat(),
              "start_time": "18:00", "duration_minutes": 60},
        headers=auth(customer["token"]),
    ).json()
    response = client.post(
        f"/api/bookings/{booking['booking_id']}/services",
        json={"service_id": seeded["service_id"], "quantity": 99},
        headers=auth(customer["token"]),
    )
    assert response.status_code == 409
    assert "Insufficient stock" in response.json()["detail"]


# ---- payments ----


def test_deposit_and_over_balance_rules(client, seeded):
    customer = make_user(client, "cust@bk88.vn")
    booking = client.post(
        "/api/bookings",
        json={"field_id": seeded["field_id"], "booking_date": TOMORROW.isoformat(),
              "start_time": "18:00", "duration_minutes": 60},
        headers=auth(customer["token"]),
    ).json()

    deposit = client.post(
        "/api/payments",
        json={
            "booking_id": booking["booking_id"],
            "amount": 69000,
            "payment_type": "DEPOSIT",
            "payment_method": "CASH",
        },
        headers=auth(customer["token"]),
    )
    assert deposit.status_code == 201
    assert deposit.json()["payment_status"] == "PAID"

    over = client.post(
        "/api/payments",
        json={
            "booking_id": booking["booking_id"],
            "amount": 9999999,
            "payment_type": "FULL",
            "payment_method": "CARD",
        },
        headers=auth(customer["token"]),
    )
    assert over.status_code == 422
    assert "balance" in over.json()["detail"]

    listing = client.get(
        f"/api/bookings/{booking['booking_id']}/payments",
        headers=auth(customer["token"]),
    )
    assert listing.status_code == 200 and len(listing.json()) == 1


def test_cannot_pay_for_someone_elses_booking(client, seeded):
    owner = make_user(client, "owner@bk88.vn")
    intruder = make_user(client, "intruder@bk88.vn")
    booking = client.post(
        "/api/bookings",
        json={"field_id": seeded["field_id"], "booking_date": TOMORROW.isoformat(),
              "start_time": "18:00", "duration_minutes": 60},
        headers=auth(owner["token"]),
    ).json()
    response = client.post(
        "/api/payments",
        json={
            "booking_id": booking["booking_id"],
            "amount": 1000,
            "payment_type": "DEPOSIT",
            "payment_method": "CASH",
        },
        headers=auth(intruder["token"]),
    )
    assert response.status_code == 403


# ---- reports (Admin only) ----


def test_reports_rbac_and_content(client, seeded):
    admin = make_user(client, "bigadmin@bk88.vn", role="ADMIN")
    customer = make_user(client, "cust@bk88.vn")

    booking = client.post(
        "/api/bookings",
        json={"field_id": seeded["field_id"], "booking_date": TOMORROW.isoformat(),
              "start_time": "18:00", "duration_minutes": 60},
        headers=auth(customer["token"]),
    ).json()
    client.post(
        "/api/payments",
        json={
            "booking_id": booking["booking_id"],
            "amount": 230000,
            "payment_type": "FULL",
            "payment_method": "CARD",
        },
        headers=auth(customer["token"]),
    )

    forbidden = client.get("/api/reports/revenue", headers=auth(customer["token"]))
    assert forbidden.status_code == 403

    report = client.get("/api/reports/revenue?days=30", headers=auth(admin["token"]))
    assert report.status_code == 200
    body = report.json()
    assert body["total_revenue"] == 230000.0
    assert body["revenue_by_field"][0]["name"] == "Test Pitch"
    assert body["status_counts"]["PENDING"] == 1
