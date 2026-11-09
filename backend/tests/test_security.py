"""Unit tests for token handling and provider derivation (no database needed)."""

import time

import jwt
import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.security import (
    create_dev_token,
    derive_provider,
    verify_token,
)


def test_dev_token_roundtrip():
    token = create_dev_token("user_abc", "ron@bk88.vn", "Ron Smith")
    claims = verify_token(token)
    assert claims["sub"] == "user_abc"
    assert claims["email"] == "ron@bk88.vn"
    assert claims["name"] == "Ron Smith"


def test_verify_rejects_garbage():
    with pytest.raises(HTTPException) as excinfo:
        verify_token("not-a-token")
    assert excinfo.value.status_code == 401


def test_verify_rejects_wrong_secret():
    token = jwt.encode(
        {"sub": "user_x", "email": "x@y.vn", "iss": "evil", "exp": int(time.time()) + 60},
        "bogus-secret",
        algorithm="HS256",
    )
    with pytest.raises(HTTPException):
        verify_token(token)


def test_verify_rejects_expired_token():
    token = jwt.encode(
        {"sub": "user_x", "email": "x@y.vn", "iss": "bk88-dev", "exp": int(time.time()) - 60},
        settings.dev_auth_secret,
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as excinfo:
        verify_token(token)
    assert "expired" in excinfo.value.detail.lower()


def test_verify_rejects_missing_sub():
    token = jwt.encode(
        {"email": "x@y.vn", "iss": "bk88-dev", "exp": int(time.time()) + 60},
        settings.dev_auth_secret,
        algorithm="HS256",
    )
    with pytest.raises(HTTPException):
        verify_token(token)


def test_derive_provider_google_oauth():
    claims = {
        "sub": "user_g",
        "id": {"oauth_google": {"email": "g@gmail.com"}},
    }
    assert derive_provider(claims) == "GOOGLE"


def test_derive_provider_email_password():
    claims = {"sub": "user_c", "id": {"password": {"email": "g@bk88.vn"}}}
    assert derive_provider(claims) == "CLERK"


def test_derive_provider_no_id_block():
    assert derive_provider({"sub": "user_c"}) == "CLERK"
