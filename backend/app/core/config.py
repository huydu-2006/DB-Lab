"""Application configuration loaded from environment / .env."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "BK-88 Stadium API"
    database_url: str = "mysql+pymysql://root:CHANGE_ME@localhost:3306/bk88_stadium"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Clerk production mode: when CLERK_JWKS_URL is non-empty, Bearer tokens
    # are Clerk RS256 session JWTs and the dev-only auth endpoints are off.
    clerk_jwks_url: str = ""
    clerk_issuer: str = ""
    clerk_audience: str = ""

    # Dev fallback mode (Clerk not configured yet): local HS256 tokens.
    dev_auth_secret: str = "dev-secret-change-me-0123456789abcdef"
    token_expire_seconds: int = 12 * 60 * 60

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def clerk_enabled(self) -> bool:
        return bool(self.clerk_jwks_url.strip())


settings = Settings()
