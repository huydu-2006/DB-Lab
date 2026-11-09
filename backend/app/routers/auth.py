"""Authentication: sign-in / sign-up + user sync into the MySQL USERS table.

Production flow (Clerk configured): the frontend obtains a Clerk session
JWT (email/password or Google OAuth), then POST /api/auth/sync upserts the
user into USERS keyed by clerk_user_id. Each later request carries the same
Bearer token; GET /api/auth/me loads the DB profile and role.

Dev fallback (Clerk not configured): /api/auth/dev/register and
/api/auth/dev/login sign users up/in directly against the database and mint
local HS256 tokens, so the full flow is demonstrable without a Clerk account.
"""

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.core.config import settings
from app.core.security import (
    create_dev_token,
    derive_provider,
    get_current_claims,
    get_current_user,
)
from app.db.session import engine, fetch_user_by_clerk_id

router = APIRouter(prefix="/api/auth", tags=["auth"])


class UserOut(BaseModel):
    user_id: int
    clerk_user_id: str
    full_name: str
    email: str
    phone: str | None = None
    auth_provider: str
    role: str
    team_name: str | None = None


class DevRegisterIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=150)
    phone: str | None = Field(default=None, max_length=20)
    team_name: str | None = Field(default=None, max_length=150)
    role: str = Field(default="CUSTOMER", pattern="^(CUSTOMER|STAFF|ADMIN)$")


class DevLoginIn(BaseModel):
    email: EmailStr


class TokenOut(BaseModel):
    token: str
    user: UserOut


def _user_exists(conn: Connection, email: str) -> dict | None:
    row = conn.execute(
        text(
            "SELECT user_id, clerk_user_id, full_name, email, phone, "
            "       auth_provider, role, team_name "
            "FROM USERS WHERE email = :email"
        ),
        {"email": email},
    ).mappings().first()
    return dict(row) if row else None


def _upsert_from_claims(claims: dict) -> UserOut:
    """Insert or refresh the USERS row for the token's `sub`; return profile.

    Sign-up happens implicitly: the first sign-in with a new Clerk identity
    creates the row with the CUSTOMER role; later sign-ins refresh profile
    fields (name/email/phone can be edited on the Clerk side).
    """
    clerk_user_id = str(claims["sub"])
    provider = derive_provider(claims)
    email = claims.get("email")
    full_name = (claims.get("name") or (email or "").split("@")[0])[:150]
    phone = (claims.get("phone_number") or None)

    with engine.begin() as conn:
        existing = fetch_user_by_clerk_id(conn, clerk_user_id)
        if existing is None:
            conn.execute(
                text(
                    "INSERT INTO USERS (clerk_user_id, full_name, email, phone, "
                    "                   auth_provider, role) "
                    "VALUES (:cid, :name, :email, :phone, :provider, 'CUSTOMER')"
                ),
                {
                    "cid": clerk_user_id,
                    "name": full_name,
                    "email": email,
                    "phone": phone,
                    "provider": provider,
                },
            )
        else:
            conn.execute(
                text(
                    "UPDATE USERS SET full_name = :name, email = :email, "
                    "       phone = COALESCE(:phone, phone), auth_provider = :provider "
                    "WHERE clerk_user_id = :cid"
                ),
                {
                    "name": full_name,
                    "email": email,
                    "phone": phone,
                    "provider": provider,
                    "cid": clerk_user_id,
                },
            )
        user = fetch_user_by_clerk_id(conn, clerk_user_id)
    return UserOut(**user)


@router.post("/sync", response_model=UserOut)
async def sync_user(claims: dict = Depends(get_current_claims)) -> UserOut:
    """Upsert the authenticated Clerk/Google user into USERS (sign-up/sign-in)."""
    if not claims.get("email"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Token carries no email claim; expose the user's primary email in Clerk",
        )
    return _upsert_from_claims(claims)


@router.get("/me", response_model=UserOut)
async def read_current_user(user: dict = Depends(get_current_user)) -> UserOut:
    """Current user's DB profile and role."""
    return UserOut(**user)


# ---- Dev fallback endpoints (only mounted when Clerk is not configured) ----

dev_router = APIRouter(prefix="/api/auth/dev", tags=["auth-dev"])


@dev_router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def dev_register(payload: DevRegisterIn) -> TokenOut:
    """Dev-only sign-up: creates the USERS row and returns a local token."""
    with engine.begin() as conn:
        if _user_exists(conn, payload.email.lower()):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="An account with this email already exists",
            )
        conn.execute(
            text(
                "INSERT INTO USERS (clerk_user_id, full_name, email, phone, "
                "                   team_name, auth_provider, role) "
                "VALUES (:cid, :name, :email, :phone, :team, 'CLERK', :role)"
            ),
            {
                "cid": f"user_{uuid4().hex[:25]}",
                "name": payload.full_name,
                "email": payload.email.lower(),
                "phone": payload.phone,
                "team": payload.team_name,
                "role": payload.role,
            },
        )
        user = _user_exists(conn, payload.email.lower())
    token = create_dev_token(user["clerk_user_id"], user["email"], user["full_name"])
    return TokenOut(token=token, user=UserOut(**user))


@dev_router.post("/login", response_model=TokenOut)
async def dev_login(payload: DevLoginIn) -> TokenOut:
    """Dev-only sign-in: returns the DB profile and a local session token."""
    with engine.begin() as conn:
        user = _user_exists(conn, payload.email.lower())
        if user is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail="No account with this email; sign up first",
            )
    token = create_dev_token(user["clerk_user_id"], user["email"], user["full_name"])
    return TokenOut(token=token, user=UserOut(**user))
