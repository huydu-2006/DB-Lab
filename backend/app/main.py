"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers.auth import dev_router, router as auth_router
from app.routers.bookings import router as bookings_router
from app.routers.fields import router as fields_router, services_router
from app.routers.payments import router as payments_router
from app.routers.reports import router as reports_router

app = FastAPI(title=settings.app_name, version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(fields_router)
app.include_router(services_router)
app.include_router(bookings_router)
app.include_router(payments_router)
app.include_router(reports_router)
if not settings.clerk_enabled:
    # Dev fallback: DB-backed sign-in/sign-up without a Clerk instance.
    app.include_router(dev_router)


@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "auth_mode": "clerk" if settings.clerk_enabled else "dev-fallback",
    }
