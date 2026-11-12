"""Sign-in / sign-up API tests against the SQL Server USERS table (dev fallback mode).

These exercise the real database flow: register writes a row into USERS,
login resolves it, sync upserts Clerk-style identities, /me reads the DB.
"""

from sqlalchemy import text

from app.core.security import create_dev_token
from app.db.session import engine


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def register(client, **overrides) -> dict:
    payload = {
        "email": "ron@bk88.vn",
        "full_name": "Ron Smith",
        "team_name": "BK United",
    }
    payload.update(overrides)
    response = client.post("/api/auth/dev/register", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


# ---- sign-up (dev register) ----


def test_dev_register_persists_user_in_db(client):
    register(client, email="new@bk88.vn", full_name="New Player")
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT full_name, role, auth_provider FROM USERS WHERE email = :e"),
            {"e": "new@bk88.vn"},
        ).mappings().one()
    assert row["full_name"] == "New Player"
    assert row["role"] == "CUSTOMER"
    assert row["auth_provider"] == "CLERK"


def test_dev_register_rejects_duplicate_email(client):
    register(client, email="dup@bk88.vn", full_name="First")
    response = client.post(
        "/api/auth/dev/register",
        json={"email": "DUP@bk88.vn", "full_name": "Second"},
    )
    assert response.status_code == 409


def test_dev_register_validates_payload(client):
    response = client.post(
        "/api/auth/dev/register",
        json={"email": "not-an-email", "full_name": ""},
    )
    assert response.status_code == 422


# ---- sign-in (dev login) ----


def test_dev_login_returns_profile_and_working_token(client):
    register(client, email="player@bk88.vn", full_name="Nam Frog")
    response = client.post("/api/auth/dev/login", json={"email": "player@bk88.vn"})
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["full_name"] == "Nam Frog"
    assert body["user"]["role"] == "CUSTOMER"

    me = client.get("/api/auth/me", headers=auth_header(body["token"]))
    assert me.status_code == 200
    assert me.json()["email"] == "player@bk88.vn"


def test_dev_login_unknown_email_is_404(client):
    response = client.post("/api/auth/dev/login", json={"email": "ghost@bk88.vn"})
    assert response.status_code == 404


# ---- Clerk sync (production sign-in/sign-up path) ----


def test_sync_creates_user_on_first_sign_in(client):
    token = create_dev_token("user_google123", "kid@gmail.com", "Kid Goblin")
    response = client.post("/api/auth/sync", headers=auth_header(token))
    assert response.status_code == 200
    body = response.json()
    assert body["clerk_user_id"] == "user_google123"
    assert body["role"] == "CUSTOMER"

    with engine.connect() as conn:
        count = conn.execute(
            text("SELECT COUNT(*) AS n FROM USERS WHERE clerk_user_id = :c"),
            {"c": "user_google123"},
        ).mappings().one()
    assert count["n"] == 1


def test_sync_is_idempotent_and_refreshes_profile(client):
    first = create_dev_token("user_u1", "u1@bk88.vn", "Old Name")
    client.post("/api/auth/sync", headers=auth_header(first))

    second = create_dev_token("user_u1", "u1@bk88.vn", "New Name")
    response = client.post("/api/auth/sync", headers=auth_header(second))

    assert response.status_code == 200
    assert response.json()["full_name"] == "New Name"
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT COUNT(*) AS n FROM USERS WHERE clerk_user_id = 'user_u1'")
        ).mappings().one()
    assert rows["n"] == 1, "sync must update, not duplicate"


def test_sync_without_email_claim_is_rejected(client):
    token = create_dev_token("user_noemail", "", "")
    response = client.post("/api/auth/sync", headers=auth_header(token))
    assert response.status_code == 400


# ---- session guards ----


def test_me_without_token_is_401(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_with_garbage_token_is_401(client):
    response = client.get("/api/auth/me", headers=auth_header("garbage.token.here"))
    assert response.status_code == 401


def test_me_rejects_unsynced_identity(client):
    token = create_dev_token("user_never_synced", "ns@bk88.vn", "Ghost")
    response = client.get("/api/auth/me", headers=auth_header(token))
    assert response.status_code == 401
    assert "sync" in response.json()["detail"].lower()
