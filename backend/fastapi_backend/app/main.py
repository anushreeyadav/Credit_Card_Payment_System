import os

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .database import get_db
from .routes import payments
from .schemas import ErrorResponse, HealthResponse

# Swagger/ReDoc/OpenAPI are on for development; set ENABLE_API_DOCS=false in
# production so the API surface is not published.
_docs = os.getenv('ENABLE_API_DOCS', 'true').lower() == 'true'

API_DESCRIPTION = """
Simulated payment processing for the Credit Card Payment System. **No real payment gateway is used.**

## Authentication

This service does not issue tokens. Log in through the **Django API** and use its access token here:

1. `POST http://127.0.0.1:8000/api/auth/login/` with `{"username": "...", "password": "..."}`
2. Copy `access` from the response.
3. Click **Authorize** (top right) and paste the token. Requests then send `Authorization: Bearer <token>`.

Access tokens last **5 minutes**. Refresh them with `POST /api/auth/refresh/` on the Django API.
A token is rejected (401) when it is missing, malformed, expired, signed with the wrong key, is a
refresh token, or belongs to a deactivated or deleted account.

## Card data

Payments reference a saved card by `card_id` only. Full card numbers and CVVs are never accepted,
stored or returned. Card numbers are always shown masked (`**** **** **** 1111`).

## Errors

| Status | Body | When |
|---|---|---|
| 401 | `{"detail": "..."}` | Authentication failed |
| 404 | `{"detail": "..."}` | Card or payment not found, or belongs to another user |
| 422 | `{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}` | Invalid or missing fields. Values are never echoed back. |
| 503 | `{"detail": "Database unavailable."}` | Health check only |
"""

TAGS = [
    {'name': 'Payments', 'description': 'Saved cards (masked) and simulated payments. Requires a Django access token.'},
    {'name': 'Health', 'description': 'Service and database status. No authentication.'},
]

app = FastAPI(
    title='Credit Card Payment Service',
    description=API_DESCRIPTION,
    openapi_tags=TAGS,
    version='1.0.0',
    docs_url='/docs' if _docs else None,
    redoc_url='/redoc' if _docs else None,
    openapi_url='/openapi.json' if _docs else None,
)

_SECURITY_HEADERS = {
    # Payment and card data must never be stored by browsers or proxies.
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
}


@app.middleware('http')
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for name, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    return response

# CORS: only the listed frontend origins may call the API from a browser.
# Auth uses Bearer tokens, not cookies, so credentials are not allowed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv('CORS_ALLOWED_ORIGINS', '').split(',') if o.strip()],
    allow_credentials=False,
    allow_methods=['GET', 'POST', 'OPTIONS'],
    allow_headers=['Authorization', 'Content-Type', 'Accept'],
)

app.include_router(payments.router)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """422 without the submitted values.

    FastAPI's default handler echoes each rejected value back ("input"), which
    would return a card number or CVV if a client sent one. Only the field
    location, message and error type are returned here.
    """
    errors = [
        {'loc': list(err.get('loc', ())), 'msg': err.get('msg', ''), 'type': err.get('type', '')}
        for err in exc.errors()
    ]
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, content={'detail': errors})


@app.get(
    '/health',
    response_model=HealthResponse,
    tags=['Health'],
    summary='Service health',
    description='Returns 200 when the service and its database are reachable. No authentication required.',
    responses={503: {'model': ErrorResponse, 'description': 'Database unavailable.'}},
)
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text('SELECT 1'))
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='Database unavailable.',
        )
    return HealthResponse(status='ok', database='ok')
