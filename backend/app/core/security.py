"""Token verification and RBAC dependencies.

Two modes (see PLAN.md "Clerk + Google OAuth" with a dev fallback):

* Production (CLERK_JWKS_URL set): Bearer tokens are Clerk RS256 session
  JWTs, verified against Clerk's JWKS endpoint (works for Google OAuth and
  email/password sign-ins alike — Clerk issues the same session tokens).
* Dev fallback (CLERK_JWKS_URL empty): local HS256 tokens minted by
  /api/auth/dev/* so sign-in/sign-up against MySQL works without a Clerk
  account. Credentials themselves remain Clerk's job in production; the DB
  stores only profile data plus the clerk_user_id linkage.

Both modes produce the same claim contract:
    sub (clerk_user_id), name, email, phone_number?
so downstream code (sync, RBAC) is mode-independent.
"""

import time
from typing import Any

import jwt
from fastapi import Depends, HTTPException, Request, status
from jwt import PyJWKClient

from app.core.config import settings
from app.db.session import fetch_user_by_clerk_id

_clerk_jwk_client: PyJWKClient | None = None

ROLES = ("CUSTOMER", "STAFF", "ADMIN")


def _clerk_jwks() -> PyJWKClient:
    global _clerk_jwk_client
    if _clerk_jwk_client is None:
        _clerk_jwk_client = PyJWKClient(settings.clerk_jwks_url, cache_keys=True)
    return _clerk_jwk_client


def verify_token(token: str) -> dict[str, Any]:
    """Decode + verify a Bearer token; return its claims (or raise 401)."""
    try:
        if settings.clerk_enabled:
            signing_key = _clerk_jwks().get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=settings.clerk_issuer or None,
                audience=settings.clerk_audience or None,
                options={"require": ["exp", "sub"]},
            )
        return jwt.decode(
            token,
            settings.dev_auth_secret,
            algorithms=["HS256"],
            issuer="bk88-dev",
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Session token expired; please sign in again",
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, detail=f"Invalid session token: {exc}"
        ) from exc


def create_dev_token(clerk_user_id: str, email: str, full_name: str) -> str:
    """Mint a local dev-mode token with the same claims Clerk would issue."""
    now = int(time.time())
    payload = {
        "sub": clerk_user_id,
        "email": email,
        "name": full_name,
        "iss": "bk88-dev",
        "iat": now,
        "exp": now + settings.token_expire_seconds,
    }
    return jwt.encode(payload, settings.dev_auth_secret, algorithm="HS256")


def derive_provider(claims: dict[str, Any]) -> str:
    """Map Clerk claim layout to the USERS.auth_provider domain.

    Clerk session tokens embed the identification method under `id`
    (e.g. id.oauth_google, id.oauth_google_another), so any oauth_google*
    block means a Google sign-in.
    """
    ident = claims.get("id")
    if isinstance(ident, dict) and any(
        str(key).startswith("oauth_google") for key in ident
    ):
        return "GOOGLE"
    return "CLERK"


def get_token(request: Request) -> str:
    """Extract the Bearer token from the Authorization header."""
    auth = request.headers.get("Authorization", "")
    scheme, _, param = auth.partition(" ")
    if scheme.lower() != "bearer" or not param.strip():
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return param.strip()


async def get_current_claims(token: str = Depends(get_token)) -> dict[str, Any]:
    return verify_token(token)


async def get_current_user(
    claims: dict[str, Any] = Depends(get_current_claims),
) -> dict:
    """Authenticated user synced in the DB; raises 401 if not synced yet."""
    from app.db.session import engine, fetch_user_by_clerk_id

    with engine.connect() as conn:
        user = fetch_user_by_clerk_id(conn, str(claims["sub"]))
    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="User not yet synced; call POST /api/auth/sync first",
        )
    return user


def require_role(*allowed: str):
    """RBAC dependency: current user must have one of the given DB roles."""

    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in allowed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail=f"Requires role {' or '.join(allowed)}; your role is {user['role']}",
            )
        return user

    return checker
