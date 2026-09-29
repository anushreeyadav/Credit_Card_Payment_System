REST API for accounts, saved cards, transaction history and the admin dashboard.
Payments are made through the separate **FastAPI payment service** (`http://127.0.0.1:8001/docs`).

## Authentication

JWT (Bearer) authentication:

1. **Register**: `POST /api/auth/register/`
2. **Log in**: `POST /api/auth/login/` returns an `access` token (valid 5 minutes) and sets the
   refresh token as an **httpOnly cookie** (`ccps_refresh`, path `/api/auth/`). The refresh
   token is never in a response body.
3. Click **Authorize** and paste the `access` token. Requests then send `Authorization: Bearer <token>`.
4. **Refresh**: `POST /api/auth/refresh/` (cookie only, no body) returns a new access token and
   rotates the refresh cookie. The previous refresh token stops working.
5. **Log out**: `POST /api/auth/logout/` blacklists the refresh token and clears the cookie.

The same access token works on the FastAPI payment service.

## Security rules

* Full card numbers and CVVs are never stored or returned. Cards are always masked (`**** **** **** 1111`).
* Users only ever see their own cards and transactions. Another user's card id returns **404**.
* `/api/admin/` endpoints require an active **staff** account with the matching Django
  permission (superusers have all).
* Login is limited to 10 attempts/minute and registration to 10/hour per IP address.

## Errors

| Status | Body | When |
|---|---|---|
| 400 | `{"field": ["message", ...]}` | Validation failed. Submitted values are never echoed back. |
| 401 | `{"detail": "...", "code": "..."}` | Missing, invalid or expired token; bad credentials |
| 403 | `{"detail": "..."}` | Authenticated but not allowed (e.g. non-staff on admin endpoints) |
| 404 | `{"detail": "..."}` | Not found, or belongs to another user |
| 429 | `{"detail": "Request was throttled. ..."}` | Too many login/registration attempts |
