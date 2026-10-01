# Credit Card Payment System — Project Documentation

This document is the complete technical reference for the project: what the system does, how it is built,
how the parts talk to each other, every API endpoint, the data model, the security design, configuration,
setup, testing and operations.

For quick-start instructions see [README.md](README.md). Topic-specific documents are linked where relevant:
[DOCKER.md](DOCKER.md), [TESTING.md](TESTING.md), [SECURITY_AUDIT.md](SECURITY_AUDIT.md),
[database/README.md](database/README.md), [postman/README.md](postman/README.md),
[screenshots/README.md](screenshots/README.md).

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Technology stack](#3-technology-stack)
4. [Repository structure](#4-repository-structure)
5. [Data model](#5-data-model)
6. [Authentication and sessions](#6-authentication-and-sessions)
7. [Django REST API reference](#7-django-rest-api-reference)
8. [FastAPI payment service reference](#8-fastapi-payment-service-reference)
9. [Payment processing and simulation](#9-payment-processing-and-simulation)
10. [Card handling and validation](#10-card-handling-and-validation)
11. [Administration](#11-administration)
12. [Frontend application](#12-frontend-application)
13. [Security design](#13-security-design)
14. [Configuration reference](#14-configuration-reference)
15. [Setup and running](#15-setup-and-running)
16. [Docker deployment](#16-docker-deployment)
17. [Database scripts and dump](#17-database-scripts-and-dump)
18. [Testing](#18-testing)
19. [Postman collection](#19-postman-collection)
20. [Troubleshooting](#20-troubleshooting)
21. [Glossary](#21-glossary)

---

## 1. Overview

The Credit Card Payment System is a full-stack web application in which:

- **Customers** register, log in, save credit cards, make **simulated** payments with a saved card, and
  review, filter and chart their transaction history.
- **Administrators** manage users (activate/deactivate), view all saved cards and transactions, see daily
  payment statistics, export transactions to CSV and review an audit log of administrative actions.

No real payment gateway is contacted. A deterministic simulator decides whether each payment succeeds or
fails, so every path can be demonstrated and tested.

### Core guarantees

| Guarantee | How it is enforced |
|---|---|
| Full card numbers are never stored | The card serializer derives `last4`, `masked_number` and `card_type`, then drops the number before saving. No table has a column that could hold it. |
| CVVs are never stored | CVV is optional, validated, then discarded. There is no CVV column. |
| Card data is never echoed back | Write-only serializer fields; validation messages never include the submitted value; FastAPI's 422 handler strips submitted values. |
| Users only see their own data | Every customer query is filtered by the authenticated user; another user's ids return 404. |
| Admin actions are audited | `AdminLog.record()` logs logins, views, changes and exports, scrubbing anything sensitive. |

### Functional modules

| Module | Service | Summary |
|---|---|---|
| 1. Accounts | Django | Register, log in (username or email), refresh, log out, current user |
| 2. Cards | Django | Add, list, delete saved cards (masked only) |
| 3. Payments | FastAPI | Pay with a saved card; `PENDING` → `SUCCESS` / `FAILED` |
| 4. Transactions | Django | Paginated history with status, amount and date filters |
| 5. Administration | Django | React admin console + Django admin, daily summary, CSV export, audit log |

---

## 2. Architecture

### Components

```
                          ┌──────────────────────────────────────────┐
                          │          Browser (React SPA)             │
                          │  access token in memory only             │
                          │  refresh token in httpOnly cookie        │
                          └───────────────┬──────────────────────────┘
                                          │ HTTPS/HTTP (JSON)
              ┌───────────────────────────┴───────────────────────────┐
              │                                                       │
   /api/auth, /api/cards, /api/transactions,             /api/payments/*, /health
   /api/admin/*, /admin/ (Django admin)                               │
              │                                                       │
   ┌──────────▼───────────┐                              ┌────────────▼──────────┐
   │  Django 5.2 + DRF    │   shared JWT_SECRET_KEY      │  FastAPI payment      │
   │  (port 8000)         │ ──── (HS256 tokens) ───────▶ │  service (port 8001)  │
   │  issues JWTs         │                              │  verifies JWTs only   │
   │  owns the DB schema  │                              │  maps existing tables │
   └──────────┬───────────┘                              └────────────┬──────────┘
              │ mysqlclient                                   PyMySQL │ SQLAlchemy
              └────────────────────────┬──────────────────────────────┘
                                       ▼
                           ┌────────────────────────┐
                           │  MySQL 8               │
                           │  credit_card_payment_db│
                           └────────────────────────┘
```

### Responsibilities

| Component | Responsibilities | Does **not** |
|---|---|---|
| **React frontend** | UI, client-side validation, session restoration, silent token refresh, charts | Store tokens in web storage; log request bodies |
| **Django backend** | Accounts and JWT issuance, cards, transaction history, admin API, Django admin, audit log, **all database migrations** | Process payments |
| **FastAPI service** | List the user's cards (read-only), create and process payments, fetch a payment by reference, health check | Issue tokens; create or alter tables |
| **MySQL** | Single shared database for both services | — |

### Why two backends share one database

Django owns the schema through migrations (`payments.Payment`, `cards.Card`, `auth_user`, …). FastAPI maps
the same tables with SQLAlchemy ([backend/fastapi_backend/app/models.py](backend/fastapi_backend/app/models.py))
and never calls `create_all` outside its test suite. A payment written by FastAPI is therefore immediately
visible in Django's transaction history, admin console and Django admin.

### Request flow: making a payment

```
Browser                    Django                      FastAPI                    MySQL
   │  POST /api/auth/login/   │                           │                         │
   │─────────────────────────▶│  verify password          │                         │
   │◀── {access, user} + Set-Cookie: ccps_refresh ────────│                         │
   │                          │                           │                         │
   │  GET /api/payments/cards  (Authorization: Bearer access)                       │
   │─────────────────────────────────────────────────────▶│ verify JWT, user active │
   │◀──────────────────── masked cards ───────────────────│◀────────────────────────│
   │                          │                           │                         │
   │  POST /api/payments/ {card_id, amount, currency, description}                  │
   │─────────────────────────────────────────────────────▶│ INSERT status=PENDING ─▶│
   │                          │                           │ simulate_payment()      │
   │                          │                           │ UPDATE SUCCESS/FAILED ─▶│
   │◀──────────────── 201 {reference, status, …} ─────────│                         │
   │                          │                           │                         │
   │  GET /api/transactions/  │                           │                         │
   │─────────────────────────▶│ SELECT … WHERE user=me ──────────────────────────▶ │
```

### Deployment topologies

| Mode | Frontend | Django | FastAPI | Notes |
|---|---|---|---|---|
| Local development | Vite on `127.0.0.1:5173` | `runserver` on `127.0.0.1:8000` | `uvicorn` on `127.0.0.1:8001` | Three origins; CORS allow-lists required |
| Docker Compose | nginx on `localhost:8080` (only published port) | gunicorn (internal) | uvicorn (internal) | Single origin; nginx proxies both APIs |

---

## 3. Technology stack

| Layer | Technology | Version (pinned range) |
|---|---|---|
| Frontend | React, React Router, Vite, Tailwind CSS, Inter font | React 19, Router 7, Vite 8, Tailwind 4 |
| Backend API | Django, Django REST Framework | Django 5.2 LTS, DRF 3.18 |
| Auth | djangorestframework-simplejwt (with token blacklist) | 5.5 |
| API docs | drf-spectacular (Django), FastAPI built-in OpenAPI | 0.28 |
| CORS | django-cors-headers, FastAPI `CORSMiddleware` | 4.7 |
| Payment service | FastAPI, Pydantic 2, SQLAlchemy 2, PyMySQL, PyJWT | FastAPI 0.141 |
| Database | MySQL | 8.0 locally, 8.4 in Docker |
| Servers | gunicorn (Django), uvicorn (FastAPI), nginx (frontend + reverse proxy), WhiteNoise (static) | |
| Testing | pytest, pytest-django, pytest-cov, Vitest, Playwright, Postman/Newman | |
| Tooling | ESLint, PowerShell scripts, Docker Compose | |

Runtime requirements for local development: **Python 3.12+** (developed on 3.14), **Node.js 20+**
(developed on 24), **MySQL 8**.

---

## 4. Repository structure

```
Credit_Card_Payment_System/
├── backend/
│   ├── django_backend/
│   │   ├── config/            # settings, root URLs, middleware, Django admin config, OpenAPI helpers
│   │   ├── accounts/          # register / login / refresh / logout / me
│   │   ├── cards/             # Card model, validators (Luhn, brand detection), CRUD API
│   │   ├── payments/          # Payment model, transaction history API, daily summary, Django admin + CSV
│   │   ├── adminpanel/        # staff-only JSON API for the React admin console
│   │   ├── adminlogs/         # AdminLog model, scrubbing, signals, login lockout, audit mixin
│   │   ├── manage.py
│   │   ├── requirements.txt / requirements-dev.txt
│   │   └── pytest.ini, .coveragerc, .env.example
│   └── fastapi_backend/
│       ├── app/
│       │   ├── main.py        # app, security headers, CORS, validation handler, /health
│       │   ├── auth.py        # verifies Django-issued JWTs
│       │   ├── database.py    # SQLAlchemy engine + session dependency
│       │   ├── models.py      # maps auth_user, cards_card, payments_payment
│       │   ├── schemas.py     # Pydantic request/response models
│       │   ├── simulator.py   # deterministic payment outcome
│       │   └── routes/payments.py
│       ├── tests/
│       └── requirements.txt / requirements-dev.txt, .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/             # one component per route
│   │   ├── components/        # layout, ui kit, cards, payments, transactions, admin, charts
│   │   ├── context/           # AuthProvider, ToastProvider, ActivityContext
│   │   ├── hooks/             # data and UI hooks (useAuth, useCards, useTransactions, …)
│   │   ├── services/          # fetch client, Django and FastAPI service wrappers
│   │   ├── routes/            # AppRoutes, ProtectedRoute, PublicOnlyRoute, paths
│   │   └── utils/             # validation, formatting, analytics, cards, payments (unit-tested)
│   ├── e2e/                   # Playwright browser tests + test server helpers
│   └── package.json, vite.config.js, playwright*.config.js
├── database/                  # setup_mysql.ps1, audit_db.py, create/verify dump, dumps/*.sql
├── docker/                    # Dockerfiles, nginx.conf, entrypoint, healthcheck, init-env.ps1, verify.ps1
├── postman/                   # collection, environment template, generator, Newman runner
├── security/                  # live security probe
├── screenshots/               # UI screenshots and recordings
├── docker-compose.yml
├── run_tests.ps1              # runs every test suite with coverage
└── README.md, DOCKER.md, TESTING.md, SECURITY_AUDIT.md, PROJECT_DOCUMENTATION.md
```

---

## 5. Data model

The database is `credit_card_payment_db` (utf8mb4, `STRICT_TRANS_TABLES`). Django migrations create
15 tables; the application-specific ones are below. Django also creates its standard `auth_*`,
`django_*` and `token_blacklist_*` tables.

### Entity relationships

```
auth_user 1 ──── * cards_card
    │                  │
    │ 1                │ 0..1 (SET NULL on card delete)
    │                  │
    └──── * payments_payment

auth_user 0..1 ──── * adminlogs_adminlog   (SET NULL on admin delete; username copied)
auth_user 1 ──── * token_blacklist_outstandingtoken 1 ──── 0..1 token_blacklist_blacklistedtoken
```

### `cards_card` — saved cards ([cards/models.py](backend/django_backend/cards/models.py))

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT PK | |
| `user_id` | FK → `auth_user` | `ON DELETE CASCADE` |
| `cardholder_name` | VARCHAR(100) | Letters, spaces, `.`, `'`, `-` |
| `masked_number` | VARCHAR(19) | Always `**** **** **** NNNN` |
| `last4` | VARCHAR(4) | Exactly 4 digits |
| `card_type` | VARCHAR(20) | `visa`, `mastercard`, `amex`, `discover`, `rupay` |
| `expiry_month` | SMALLINT UNSIGNED | 1–12, DB `CHECK` constraint |
| `expiry_year` | SMALLINT UNSIGNED | Current year to +20 |
| `created_at` | DATETIME | Default ordering: newest first |

There is **no** column for the full number or the CVV.

### `payments_payment` — transactions ([payments/models.py](backend/django_backend/payments/models.py))

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT PK | |
| `reference` | VARCHAR(40) UNIQUE | `PAY-` + 24 uppercase hex characters |
| `user_id` | FK → `auth_user` | `ON DELETE CASCADE` |
| `card_id` | FK → `cards_card`, nullable | `ON DELETE SET NULL` — history survives card deletion |
| `card_last4`, `card_type` | VARCHAR | Copied at payment time |
| `amount` | DECIMAL(12,2) | `CHECK amount > 0` |
| `currency` | VARCHAR(3) | `INR` (default), `USD`, `EUR`, `GBP` |
| `description` | VARCHAR(255) | Optional; card-number-like text rejected |
| `status` | VARCHAR(10) | `PENDING`, `SUCCESS`, `FAILED` (`CHECK` constraint) |
| `failure_reason` | VARCHAR(255) | Empty unless `FAILED` |
| `created_at`, `updated_at` | DATETIME(6) | Naive UTC |

Index: `payment_user_created_idx (user_id, created_at DESC)` for history queries.

### `adminlogs_adminlog` — audit trail ([adminlogs/models.py](backend/django_backend/adminlogs/models.py))

| Column | Notes |
|---|---|
| `user_id` | Admin who acted; null for failed logins or deleted admins |
| `username` | Copied so the log stays readable after account deletion |
| `action` | One of the actions listed in [§11](#audit-log-actions) (indexed) |
| `object_type`, `object_id`, `object_repr` | Target object, scrubbed |
| `ip_address`, `user_agent` | From `REMOTE_ADDR` (see trusted proxies in [§13](#13-security-design)) |
| `metadata` | JSON, scrubbed of passwords, tokens, card numbers |
| `created_at` | Indexed |

---

## 6. Authentication and sessions

### Token design

| Token | Lifetime | Where it lives | Sent as |
|---|---|---|---|
| Access (JWT, HS256) | 5 min (`JWT_ACCESS_TOKEN_LIFETIME_SECONDS`) | Frontend memory only (a React ref) | `Authorization: Bearer <token>` |
| Refresh (JWT, HS256) | 24 h (`JWT_REFRESH_TOKEN_LIFETIME_SECONDS`) | httpOnly cookie `ccps_refresh`, path `/api/auth/`, `SameSite=Strict`, `Secure` outside development | Cookie, automatically |

- **Rotation:** every refresh issues a new refresh token and blacklists the old one.
- **Logout:** blacklists the current refresh token and clears the cookie. Access tokens already issued
  remain valid until they expire (≤5 minutes).
- **Deactivation:** an admin deactivating a user blacklists all their outstanding refresh tokens.
  Both Django and FastAPI also check `is_active` on every request, so access tokens stop working
  immediately.
- **Cross-service:** FastAPI verifies tokens with the same `JWT_SECRET_KEY`, requires `exp`, `token_type`
  and `user_id` claims, rejects refresh tokens (`token_type != "access"`) and checks the user still exists
  and is active ([app/auth.py](backend/fastapi_backend/app/auth.py)).

### Frontend session lifecycle ([AuthProvider.jsx](frontend/src/context/AuthProvider.jsx))

1. On page load the app calls `POST /api/auth/refresh/`. If the cookie is valid the session is restored;
   otherwise the user is anonymous.
2. `login()` stores the returned access token in memory and the user object in state.
3. Every API call goes through `authRequest(call)`. On a **401** it refreshes once (de-duplicated — only
   one refresh runs at a time because refresh tokens rotate) and retries the call. If refresh fails the
   session ends with reason `expired` and the route guard redirects to `/login`.
4. `logout()` calls the API and clears local state even if the server is unreachable.

### Login rules

- `username` may be a username **or** an email address (case-insensitive email lookup).
- Usernames and emails are unique case-insensitively.
- Passwords must pass Django's validators: minimum length 8, not common, not entirely numeric,
  not similar to username/email/name.
- Throttling per client IP: login `10/min`, registration `10/hour` (configurable).
- Inactive accounts cannot log in; the error message is the same as wrong credentials.

---

## 7. Django REST API reference

Base URL: `http://127.0.0.1:8000` locally, same origin (`/`) in Docker.
All endpoints accept and return JSON only. Unless stated, a valid access token is required.
Every `/api/` response carries `Cache-Control: no-store`.

Interactive documentation (when `ENABLE_API_DOCS=True`):
`/api/docs/` (Swagger UI), `/api/redoc/`, `/api/schema/` (OpenAPI).

### 7.1 Authentication — `/api/auth/`

| Method | Path | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| POST | `/api/auth/register/` | none | `username, email, first_name?, last_name?, password, password_confirm` | 201 user object (does **not** log in) | 400 field errors, 429 throttled |
| POST | `/api/auth/login/` | none | `username` (or email), `password` | 200 `{access, user}` + `Set-Cookie: ccps_refresh` | 400, 401 invalid credentials, 429 |
| POST | `/api/auth/refresh/` | refresh cookie | — | 200 `{access, user}` + rotated cookie | 401 session expired, 403 origin not allowed |
| POST | `/api/auth/logout/` | refresh cookie (optional) | — | 204 (always) | 403 origin not allowed |
| GET | `/api/auth/me/` | access token | — | 200 user object | 401 |

User object:

```json
{
  "id": 7, "username": "priya", "email": "priya@example.com",
  "first_name": "Priya", "last_name": "Sharma",
  "is_staff": false, "date_joined": "2026-09-29T06:00:00Z"
}
```

`refresh` and `logout` also reject requests whose `Origin` header is not in the CORS allow-list
(defence in depth on top of `SameSite=Strict`).

### 7.2 Cards — `/api/cards/`

| Method | Path | Description | Success | Errors |
|---|---|---|---|---|
| GET | `/api/cards/` | Your cards, newest first | 200 list | 401 |
| POST | `/api/cards/` | Add a card | 201 card | 400, 401 |
| DELETE | `/api/cards/{id}/` | Delete one of your cards (past transactions kept) | 204 | 401, 404 (missing or another user's) |

Request (POST):

```json
{ "card_number": "4111 1111 1111 1111", "cvv": "123",
  "cardholder_name": "Priya Sharma", "expiry_month": 12, "expiry_year": 2028 }
```

Response:

```json
{ "id": 3, "cardholder_name": "Priya Sharma", "card_type": "visa",
  "masked_number": "**** **** **** 1111", "last4": "1111",
  "expiry_month": 12, "expiry_year": 2028, "created_at": "2026-09-29T06:06:02Z" }
```

`card_number` and `cvv` are write-only and never appear in any response. Validation rules are in
[§10](#10-card-handling-and-validation).

### 7.3 Transactions — `/api/transactions/`

`GET /api/transactions/` — your own payments, newest first, paginated.

| Query parameter | Type | Meaning |
|---|---|---|
| `status` | `PENDING` \| `SUCCESS` \| `FAILED` | Case-insensitive |
| `min_amount` | decimal | `amount >= value` |
| `max_amount` | decimal | `amount <= value` (must be ≥ `min_amount`) |
| `date_from` | `YYYY-MM-DD` | Created on or after (UTC) |
| `date_to` | `YYYY-MM-DD` | Created on or before, whole day inclusive (must be ≥ `date_from`) |
| `page` | int | Default 1; beyond last page → 404 |
| `page_size` | int | Default 10, max 100 |

Response:

```json
{
  "count": 23, "next": "…?page=2", "previous": null,
  "results": [{
    "reference": "PAY-5EC1A6C3C08348AFB5E2609C", "status": "SUCCESS", "failure_reason": "",
    "amount": "250.00", "currency": "INR", "description": "Order #1001",
    "card_id": 3, "card_type": "visa", "masked_card": "**** **** **** 1111",
    "created_at": "…", "updated_at": "…"
  }]
}
```

Invalid parameters return 400 with per-field errors.

### 7.4 Admin API — `/api/admin/`

Every endpoint requires an **active staff** user holding the named Django permission (superusers hold all).
Non-staff users always get 403. List views are paginated (10 per page, max 100) and recorded in the audit
log (except `page`/`page_size` parameters).

| Method | Path | Permission | Query / body | Returns |
|---|---|---|---|---|
| GET | `/api/admin/summary/` | `payments.view_payment` | `date=YYYY-MM-DD` (default today, UTC) | Day totals: `total, success, failed, pending, success_rate`, `successful_amounts` per currency (`count, total_amount, average_amount`), `last_7_days` counts |
| GET | `/api/admin/users/` | `auth.view_user` | `search, status=active\|inactive, role=staff\|customer` | Users with `card_count`, `payment_count`, `is_superuser`, `last_login` |
| PATCH | `/api/admin/users/{id}/` | `auth.view_user` + `auth.change_user` | `{"is_active": bool}` | Updated user. Cannot change yourself; only a superuser can change a superuser. Deactivation blacklists the user's refresh tokens. |
| GET | `/api/admin/cards/` | `cards.view_card` | `search` (username, cardholder, exact last 4), `card_type` | Masked cards with `username` |
| GET | `/api/admin/transactions/` | `payments.view_payment` | `search` (reference, username) + all transaction filters | Transactions with `username` |
| GET | `/api/admin/logs/` | `adminlogs.view_adminlog` | `search` (username, object), `action` | Audit entries |
| GET | `/api/admin/logs/actions/` | `adminlogs.view_adminlog` | — | `[{value, label}]` for the action filter |

`search` is trimmed to 100 characters.

### 7.5 Error format

| Status | Body |
|---|---|
| 400 | `{"field": ["message", …], …}` |
| 401 | `{"detail": "…"}` with `WWW-Authenticate: Bearer realm="api"` |
| 403 | `{"detail": "You do not have permission to view this section."}` |
| 404 | `{"detail": "No Card matches the given query."}` |
| 429 | `{"detail": "Request was throttled. Expected available in N seconds."}` |

---

## 8. FastAPI payment service reference

Base URL: `http://127.0.0.1:8001` locally, same origin in Docker. Uses the **Django-issued** access token.
Interactive docs (when `ENABLE_API_DOCS=true`): `/docs`, `/redoc`, `/openapi.json`.

| Method | Path | Auth | Description | Success | Errors |
|---|---|---|---|---|---|
| GET | `/health` | none | Service and DB status | 200 `{"status":"ok","database":"ok"}` | 503 database unavailable |
| GET | `/api/payments/cards` | Bearer | Your saved cards (masked); use `id` as `card_id` | 200 list | 401 |
| POST | `/api/payments/` | Bearer | Make a simulated payment | 201 payment (check `status`) | 401, 404 card not found / not yours, 422 |
| GET | `/api/payments/{reference}` | Bearer | One of your payments | 200 payment | 401, 404 |

### Payment request

```json
{ "card_id": 1, "amount": "250.00", "currency": "INR", "description": "Order #1001" }
```

| Field | Rules |
|---|---|
| `card_id` | Integer > 0; must be one of the caller's cards |
| `amount` | Decimal > 0, ≤ 1,000,000.00, max 2 decimal places, max 12 digits |
| `currency` | `INR` (default), `USD`, `EUR`, `GBP` |
| `description` | Optional, ≤ 255 characters, must not contain a 13–19 digit card-number-like sequence |
| *anything else* | Rejected (`extra="forbid"`), so a `card_number` or `cvv` field causes 422 |

### Payment response

```json
{
  "reference": "PAY-4F49AC7A8F254E038827C8B4", "status": "FAILED",
  "failure_reason": "Insufficient funds.", "amount": "15000.00", "currency": "INR",
  "description": "", "card_id": 3, "card_type": "visa",
  "masked_card": "**** **** **** 1111",
  "created_at": "2026-09-29T06:06:02.662576Z", "updated_at": "2026-09-29T06:06:02.672666Z"
}
```

### Error format

| Status | Body |
|---|---|
| 401 | `{"detail": "Token has expired." \| "Token is invalid." \| "Authentication credentials were not provided."}` |
| 404 | `{"detail": "Card not found."}` / `{"detail": "Payment not found."}` |
| 422 | `{"detail": [{"loc": ["body","amount"], "msg": "…", "type": "…"}]}` — submitted values are **never** echoed |
| 503 | `{"detail": "Database unavailable."}` (health only) |

All responses carry `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`.

---

## 9. Payment processing and simulation

Implemented in [routes/payments.py](backend/fastapi_backend/app/routes/payments.py) and
[simulator.py](backend/fastapi_backend/app/simulator.py).

1. Look up the card **by id and owner**. Missing and foreign cards both return 404, so other users'
   card ids cannot be discovered.
2. Insert the payment with status **`PENDING`** and a new reference (`PAY-` + 24 hex chars), copying the
   card's `last4` and `card_type`, and **commit**. The record exists even if processing crashes.
3. Run the simulator and update the row to the final status, then commit.
4. Return **201** with the final state regardless of outcome — clients must check `status`.

### Simulation rules (deterministic, evaluated in order)

| Condition | Result | `failure_reason` |
|---|---|---|
| Card's expiry month is before the current month (UTC) | `FAILED` | `Card has expired.` |
| Amount > **10,000.00** (`SIMULATED_CARD_LIMIT`) | `FAILED` | `Insufficient funds.` |
| Otherwise | `SUCCESS` | *(empty)* |

An amount of exactly 10,000.00 succeeds. Currency does not affect the outcome.

### Test card numbers

Use only public test numbers, for example:

| Brand | Number |
|---|---|
| Visa | `4111 1111 1111 1111` |
| Mastercard | `5555 5555 5555 4444` |
| American Express | `3782 822463 10005` |
| Discover | `6011 1111 1111 1117` |

---

## 10. Card handling and validation

Implemented in [cards/serializers.py](backend/django_backend/cards/serializers.py) and
[cards/validators.py](backend/django_backend/cards/validators.py).

| Field | Rule | Error message |
|---|---|---|
| `card_number` | Spaces and dashes stripped; digits only | `Card number must contain only digits.` |
| | 13–19 digits | `Card number must be 13 to 19 digits long.` |
| | Passes Luhn checksum | `Card number is invalid.` |
| | Supported brand with valid length | `Card type is not supported.` |
| `cvv` (optional) | 3 or 4 digits; never stored | `CVV must be 3 or 4 digits.` |
| `cardholder_name` | Whitespace collapsed; letters, spaces, `.`, `'`, `-`; 2–100 chars | `Cardholder name may contain only …` |
| `expiry_month` | 1–12 | `Expiry month must be between 1 and 12.` |
| `expiry_year` | Current year to current year + 20 | `Expiry year must be between …` |
| combined | Expiry not before current month | `Card has expired.` |

### Brand detection (first matching prefix wins)

| Brand | Prefix | Lengths |
|---|---|---|
| American Express | `34`, `37` | 15 |
| Visa | `4` | 13, 16, 19 |
| Mastercard | `51`–`55`, `2221`–`2720` | 16 |
| Discover | `6011`, `65`, `644`–`649` | 16–19 |
| RuPay | `60`, `81`, `82`, `508` | 16 |

After validation, `card_number` and `cvv` are popped from the validated data; only `card_type`, `last4` and
`masked_number` are derived and saved. Card-number functions are decorated with `@sensitive_variables`,
and views with `sensitive_post_parameters`, so the number cannot appear in Django error reports.

---

## 11. Administration

There are two admin interfaces, both backed by Django permissions.

### 11.1 React admin console (`/admin` in the SPA)

Reached from the user menu for staff accounts. Sections are selected with `?tab=` because `/admin/` (with a
trailing slash) is the Django admin behind the reverse proxy.

| Tab | Content |
|---|---|
| Dashboard | Overview figures and charts |
| Users | Search/filter users; activate or deactivate (with confirmation) |
| Cards | All saved cards, masked; search and brand filter |
| Transactions | All payments; search and status/amount/date filters |
| Payment Summary | Daily statistics with date picker and 7-day trend |
| Admin Logs | Audit trail with action filter |
| Export Data | Export of transaction data |
| Settings | Console preferences |

The admin search boxes refuse 13–19 digit input (suggesting the last 4 digits instead), so a full card
number never ends up in a URL or access log.

### 11.2 Django admin (`/admin/`)

| Model | Capabilities |
|---|---|
| Users | Django `UserAdmin` plus card and transaction counts and an inline of saved cards |
| Cards | Masked card data |
| Transactions | **Read-only** (no add/change/delete). Filters by status, amount range, currency, brand, date. Action **Export selected transactions to CSV**. Extra page **Daily summary** (`/admin/payments/payment/daily-summary/?date=YYYY-MM-DD`). |
| Admin logs | Read-only audit trail |
| Log entries | Read-only Django change history |

**CSV export** columns: `reference, username, card_type, masked_card, amount, currency, status,
failure_reason, description, created_at, updated_at`. Text starting with `=`, `+`, `-`, `@`, tab or CR is
prefixed with `'` to prevent spreadsheet formula injection. Each export is logged with the row count.

**Login lockout:** 5 failed Django-admin logins from one IP within 15 minutes returns HTTP 429 until the
window passes (`ADMIN_LOGIN_MAX_FAILURES`, `ADMIN_LOGIN_LOCKOUT_SECONDS`). Counting is per IP, not per
username, so an attacker cannot lock out a real admin by guessing their username.

### Audit log actions

`login`, `login_failed`, `logout`, `user_list_viewed`, `user_created`, `user_updated`,
`user_password_changed`, `user_deleted`, `card_list_viewed`, `card_viewed`, `card_deleted`,
`transaction_list_viewed`, `transaction_viewed`, `transactions_exported`, `daily_summary_viewed`,
`admin_logs_viewed`, `object_created`, `object_updated`, `object_deleted`.

Every entry is created through `AdminLog.record()`, which passes all text and metadata through
[adminlogs/sanitize.py](backend/django_backend/adminlogs/sanitize.py):

- Values under keys matching `pass`, `secret`, `token`, `jwt`, `auth`, `cookie`, `session`, `csrf`,
  `api_key`, `cvv`, `card_number`, … are replaced with `[REDACTED]`.
- Any 12–19 digit sequence and anything shaped like a JWT is redacted in free text.
- Strings are capped at 200 characters, collections at 50 items, nesting at depth 4.
- For user edits only the **names** of changed fields are stored, never values; password changes are a
  separate action.

### Creating an admin

```powershell
cd backend\django_backend
.\venv\Scripts\python.exe manage.py createsuperuser
```

In Docker the first superuser is created from `DJANGO_SUPERUSER_*` in `.env` (only if it does not exist).
Non-superuser staff need explicit view permissions (`auth.view_user`, `cards.view_card`,
`payments.view_payment`, `adminlogs.view_adminlog`, and `auth.change_user` to (de)activate users).

---

## 12. Frontend application

React 19 single-page app built with Vite and styled with Tailwind CSS 4, with light and dark themes and a
responsive layout (sidebar on desktop, drawer on mobile).

### Routes ([routes/AppRoutes.jsx](frontend/src/routes/AppRoutes.jsx))

| Path | Page | Access |
|---|---|---|
| `/` | Redirects to `/dashboard` | — |
| `/login`, `/register` | Login, Registration | Public only (signed-in users are redirected) |
| `/dashboard` | Account overview: stats, cards widget, recent activity | Signed in |
| `/cards` | Saved cards, add-card form, delete with confirmation | Signed in |
| `/payment` | Choose a card, enter amount/currency/note, see result | Signed in |
| `/transactions` | History with filters, pagination, details panel | Signed in |
| `/analytics` | Charts: status donut, daily bar chart, amount by card, success rate | Signed in |
| `/notifications` | Latest payment results | Signed in |
| `/profile`, `/settings`, `/help` | Account details, preferences, FAQ | Signed in |
| `/admin` | Admin console (own `AdminShell` layout) | Signed in, staff |
| `*` | Not found | Signed in |

`ProtectedRoute` sends anonymous users to `/login`; `PublicOnlyRoute` sends signed-in users to the dashboard.

### Source layout

| Folder | Purpose |
|---|---|
| `services/` | `apiClient.js` (fetch wrapper with `ApiError`; never logs bodies), `djangoApi.js` (`authService`, `cardService`, `transactionService`, `adminService`), `paymentApi.js` (`paymentService`, `pingFastApi`), `config.js` (reads `VITE_*` URLs) |
| `context/` | `AuthProvider` (session, `authRequest`), `ToastProvider`, activity context |
| `hooks/` | `useAuth`, `useCards`, `usePaymentCards`, `useTransactions`, `useTransactionHistory`, `useApiQuery`, `useApiStatus`, `usePreferences`, `useActivity`, `useLogout`, `useDismiss`, `useToast` |
| `components/` | `layout/` (shell, sidebar, header, search, menus), `ui/` (Button, TextField, Modal, ConfirmDialog, Alert, Skeleton, …), `cards/`, `payments/`, `transactions/`, `admin/`, `charts/` (BarChart, DonutChart), `dashboard/` |
| `utils/` | Pure logic with unit tests: `validation`, `cards`, `payments`, `transactions`, `analytics`, `format`, `errors` |

### Client-side behaviour worth knowing

- **API base URLs** come from `VITE_DJANGO_API_URL` and `VITE_FASTAPI_URL`. A value of `/` means
  "same origin" (used behind nginx in Docker).
- **Token storage:** access token in memory only; nothing sensitive in `localStorage`. `localStorage` holds
  only UI preferences (`usePreferences`) and a per-user "notifications last read" timestamp (`useActivity`).
- **Payment safety:** if a payment request fails with a network error (status 0) the UI tells the user the
  outcome is unknown and to check their transactions, instead of suggesting they pay again.
- **Validation** mirrors the server (card-number in note blocked, amount format, password rules), but the
  server remains the authority.
- **API status indicator** pings Django (`/api/cards/` → 401 means up) and FastAPI (`/health`).

---

## 13. Security design

A full review with evidence is in [SECURITY_AUDIT.md](SECURITY_AUDIT.md). Summary of controls:

| Area | Control |
|---|---|
| Card data | Never stored or returned in full; CVV never stored; write-only fields; FastAPI forbids unknown fields; card numbers rejected in notes; audit log scrubbing |
| Authentication | Short-lived access tokens in memory; httpOnly `SameSite=Strict` refresh cookie scoped to `/api/auth/`; rotation + blacklist; HS256 only; FastAPI rejects refresh tokens and inactive/deleted users |
| Authorization | Per-user query scoping (404 for others' objects); staff + per-section Django permissions for admin; self/superuser protections on (de)activation |
| Brute force | DRF scoped throttles on login/registration; Django admin IP lockout; shared DB cache in Docker so all workers agree |
| Client IP | `RealClientIPMiddleware` trusts `X-Forwarded-For` only from `DJANGO_NUM_PROXIES` trusted proxies (0 locally, 1 = nginx in Docker); DRF `NUM_PROXIES` matches, preventing throttle bypass via spoofed headers |
| CORS / CSRF | Explicit origin allow-lists (never `*`); FastAPI disallows credentials; `refresh`/`logout` check `Origin`; JSON-only parsers |
| Responses | `Cache-Control: no-store` on all API responses; nosniff, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`; strict CSP on the SPA in nginx; JSON renderer only (no browsable API that could echo card data) |
| Production | With `DJANGO_DEBUG=False`: HTTPS redirect, HSTS (1 year, subdomains; preload opt-in), secure cookies; optional proxy SSL header; API docs can be disabled |
| Secrets | All secrets from git-ignored `.env` files with `.env.example` templates; nothing baked into images or the DB dump |
| Containers | Non-root users (uid 10001, unprivileged nginx); only nginx published; DB on an `internal` network |
| Supply chain | `pip-audit` and `npm audit` clean at audit time |

Outstanding manual item from the audit: rotate the `admin` superuser password
(`manage.py changepassword admin`).

---

## 14. Configuration reference

Every `.env` file is git-ignored and has a matching `.env.example`.

### Django — `backend/django_backend/.env`

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DJANGO_SECRET_KEY` | yes | — | Django secret key |
| `DJANGO_DEBUG` | | `False` | Development mode |
| `DJANGO_ALLOWED_HOSTS` | | empty | Comma-separated hosts |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | | empty | Origins allowed to POST forms (Django admin behind a proxy) |
| `DJANGO_CORS_ALLOWED_ORIGINS` | | empty | Frontend origins allowed to call `/api/` |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | yes | — | MySQL database and application user |
| `DB_HOST`, `DB_PORT` | | `127.0.0.1`, `3306` | MySQL address |
| `JWT_SECRET_KEY` | yes | — | JWT signing key (**must equal FastAPI's**) |
| `JWT_ACCESS_TOKEN_LIFETIME_SECONDS` | | `300` | Access token lifetime |
| `JWT_REFRESH_TOKEN_LIFETIME_SECONDS` | | `86400` | Refresh token lifetime |
| `AUTH_COOKIE_SECURE` | | `not DEBUG` | `Secure` flag on refresh cookie |
| `THROTTLE_LOGIN_RATE` | | `10/min` | API login throttle |
| `THROTTLE_REGISTER_RATE` | | `10/hour` | Registration throttle |
| `DJANGO_NUM_PROXIES` | | `0` | Trusted reverse proxies in front of Django |
| `DJANGO_CACHE_BACKEND` | | `locmem` | `database` to share throttle counters between workers (`createcachetable`) |
| `ADMIN_LOGIN_MAX_FAILURES` | | `5` | Django admin lockout threshold |
| `ADMIN_LOGIN_LOCKOUT_SECONDS` | | `900` | Django admin lockout window |
| `ENABLE_API_DOCS` | | `True` | Serve `/api/docs/`, `/api/redoc/`, `/api/schema/` |
| `DJANGO_SECURE_SSL_REDIRECT` | prod | `True` | HTTPS redirect (DEBUG off) |
| `DJANGO_SECURE_HSTS_SECONDS` | prod | `31536000` | HSTS max-age |
| `DJANGO_SECURE_HSTS_PRELOAD` | prod | `False` | HSTS preload |
| `DJANGO_SECURE_COOKIES` | prod | `True` | Secure session/CSRF cookies |
| `DJANGO_SECURE_PROXY_SSL_HEADER` | prod | `False` | Trust `X-Forwarded-Proto: https` |

### FastAPI — `backend/fastapi_backend/.env`

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | yes | — | Same database and user as Django |
| `DB_HOST`, `DB_PORT` | | `127.0.0.1`, `3306` | MySQL address |
| `JWT_SECRET_KEY` | yes | — | Must be identical to Django's |
| `CORS_ALLOWED_ORIGINS` | | empty | Frontend origins |
| `ENABLE_API_DOCS` | | `true` | Serve `/docs`, `/redoc`, `/openapi.json` |

### Frontend — `frontend/.env`

| Variable | Example | Purpose |
|---|---|---|
| `VITE_DJANGO_API_URL` | `http://127.0.0.1:8000` | Django base URL (`/` = same origin) |
| `VITE_FASTAPI_URL` | `http://127.0.0.1:8001` | FastAPI base URL (`/` = same origin) |

These values are compiled into the public JavaScript bundle — never put secrets here.

### Docker Compose — `.env` (project root)

`FRONTEND_PORT` (8080), `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `DJANGO_SECRET_KEY`,
`JWT_SECRET_KEY`, `DJANGO_SUPERUSER_USERNAME/EMAIL/PASSWORD`, `ENABLE_API_DOCS`.
Generate it with random secrets using `docker\init-env.ps1`.

---

## 15. Setup and running

### 15.1 Local development (without Docker)

**Prerequisites:** Python 3.12+, Node.js 20+, MySQL 8.

1. **Database** — create `backend/django_backend/.env` from `.env.example` and fill in the secrets, then:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\database\setup_mysql.ps1
   ```
   This creates `credit_card_payment_db` and the `ccps_app` user (asks for the MySQL root password).

2. **Django** (port 8000):
   ```powershell
   cd backend\django_backend
   python -m venv venv; .\venv\Scripts\Activate.ps1
   pip install -r requirements-dev.txt
   python manage.py migrate
   python manage.py createsuperuser
   python manage.py runserver
   ```

3. **FastAPI** (port 8001) — create `backend/fastapi_backend/.env` with the **same** `JWT_SECRET_KEY` and
   database settings:
   ```powershell
   cd backend\fastapi_backend
   python -m venv venv; .\venv\Scripts\Activate.ps1
   pip install -r requirements-dev.txt
   uvicorn app.main:app --port 8001 --reload
   ```

4. **Frontend** (port 5173):
   ```powershell
   cd frontend
   copy .env.example .env
   npm install
   npm run dev
   ```

5. Open **http://127.0.0.1:5173** — use `127.0.0.1`, not `localhost`, because the refresh cookie is
   `SameSite=Strict` and the APIs run on `127.0.0.1`.

| URL | What |
|---|---|
| http://127.0.0.1:5173 | Application |
| http://127.0.0.1:8000/admin/ | Django admin |
| http://127.0.0.1:8000/api/docs/ | Django API (Swagger UI) |
| http://127.0.0.1:8001/docs | FastAPI (Swagger UI) |

### 15.2 Typical user walkthrough

1. Register at `/register`, then log in.
2. Go to **My Cards** and add `4111 1111 1111 1111` with a future expiry.
3. Go to **Make Payment**, choose the card, pay `500` → `SUCCESS`.
4. Pay `15000` → `FAILED` ("Insufficient funds.").
5. Open **Transactions**, filter by status `FAILED` or by date; open **Payment Analytics** for charts.
6. Log in as a staff user and open the **Admin Console** to see users, cards, transactions, the daily
   summary and the audit log.

### 15.3 Frontend scripts

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server on 127.0.0.1:5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the build on 127.0.0.1:4173 |
| `npm run lint` | ESLint |
| `npm test` / `npm run test:coverage` | Vitest unit tests (coverage threshold 80%) |
| `npm run test:e2e` | Playwright browser tests |

---

## 16. Docker deployment

Details in [DOCKER.md](DOCKER.md).

```powershell
powershell -ExecutionPolicy Bypass -File .\docker\init-env.ps1   # creates .env with random secrets
docker compose up -d --build
```

Open **http://localhost:8080**. Log in as `admin` with `DJANGO_SUPERUSER_PASSWORD` from `.env`.

### Services

| Service | Image / build | Network | Notes |
|---|---|---|---|
| `mysql` | `mysql:8.4` | `data` | Volume `mysql_data`; healthcheck via `mysqladmin ping` |
| `django` | `docker/django.Dockerfile` (multi-stage, python:3.14-slim) | `data`, `edge` | Entrypoint runs `migrate`, `createcachetable`, optional superuser creation, then gunicorn (3 workers) |
| `fastapi` | `docker/fastapi.Dockerfile` | `data`, `edge` | Starts after Django is healthy (tables exist); uvicorn |
| `frontend` | `docker/frontend.Dockerfile` (node:24 build → nginx-unprivileged) | `edge` | Only published port: `${FRONTEND_PORT:-8080}` |

The `data` network is `internal: true` — MySQL is unreachable from the host or internet.

### nginx routing ([docker/nginx.conf](docker/nginx.conf))

| Path | Upstream |
|---|---|
| `/api/payments/`, `/health`, `/docs`, `/redoc`, `/openapi.json` | FastAPI |
| `/api/`, `/admin/`, `/static/` | Django |
| `/admin` (no slash) | React admin console (`index.html`) |
| everything else | React SPA (`try_files … /index.html`) |

Because everything is served from one origin, no CORS is needed in the browser and the `SameSite` refresh
cookie works naturally. The compose file runs production mode over plain HTTP on localhost
(SSL redirect/HSTS/secure cookies switched off); put a TLS-terminating proxy in front and remove those four
overrides for a real deployment.

`docker\verify.ps1` checks a running stack end to end.

---

## 17. Database scripts and dump

Details in [database/README.md](database/README.md).

| Script | Purpose |
|---|---|
| `database/setup_mysql.ps1` | Create database and `ccps_app` user |
| `database/audit_db.py` | Read-only audit: schema, password hash check, scan every text column for card numbers, CVVs, JWTs, secrets |
| `database/create_dump.ps1` | Write the sanitised dump |
| `database/verify_dump.ps1` | Scan the dump, import into clean MySQL 8.0/8.4, compare schema, check Django accepts it |

`database/dumps/credit_card_payment_system.sql` contains the complete schema (15 tables, indexes, foreign
keys, CHECK constraints) and reference data (`django_migrations`, `django_content_type`,
`auth_permission`) — **no** users, sessions, tokens, cards, payments or logs. Import it, run
`manage.py migrate` (reports nothing to apply) and create your own superuser.

---

## 18. Testing

Details and requirement-to-test mapping in [TESTING.md](TESTING.md).

| Suite | Tool | Tests | Coverage |
|---|---|---|---|
| Django API | pytest + pytest-django + pytest-cov | 148 | 97.2% (branch) |
| FastAPI service | pytest + pytest-cov | 53 | 100% (branch) |
| Frontend logic & services | Vitest + V8 | 114 | 100% of `src/utils` and `src/services` |
| Browser end-to-end | Playwright (Microsoft Edge) | 55 | UI flows |
| API contract | Postman via Newman | 54 requests / 118 assertions | Every endpoint |

```powershell
powershell -ExecutionPolicy Bypass -File .\run_tests.ps1        # unit/integration with coverage (~2 min)
powershell -ExecutionPolicy Bypass -File .\run_tests.ps1 -All   # + Playwright and Newman (~8 min)
```

Browser and Postman suites start their own servers against a throwaway database
(`test_credit_card_payment_db`) that is dropped afterwards; ports 5173, 8000 and 8001 must be free.

HTML coverage reports: `backend/django_backend/htmlcov/`, `backend/fastapi_backend/htmlcov/`,
`frontend/coverage/`.

The live security probe (`security\run_live_probe.ps1 -DocsOff`) runs 97 checks against Django in
production mode plus FastAPI.

---

## 19. Postman collection

Details in [postman/README.md](postman/README.md).

- `postman/Credit_Card_Payment_System.json` — 54 requests with tests in folders Authentication, Cards,
  Payments, Transactions, Admin.
- `postman/Credit_Card_Payment_System.postman_environment.example.json` — environment template
  (`django_base_url`, `fastapi_base_url`, `admin_username`, `admin_password`, `test_password`).
- Run top to bottom; requests store `access_token`, `admin_access_token` and ids for later requests.
  Postman handles the `ccps_refresh` cookie automatically.
- `postman\run_newman.ps1` runs the whole collection against throwaway servers.
- `postman/build_collection.py` generates both JSON files — edit requests there, not in the JSON.

---

## 20. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `KeyError: 'DJANGO_SECRET_KEY'` (or `DB_NAME`, `JWT_SECRET_KEY`) on start | Missing `.env` | Copy `.env.example` to `.env` in that backend folder and fill it in |
| Frontend error "Missing VITE_DJANGO_API_URL" | No `frontend/.env` | `copy .env.example .env`, restart `npm run dev` |
| Logged out on every page reload | Opened the app on `localhost` while APIs are on `127.0.0.1` | Use `http://127.0.0.1:5173` |
| FastAPI returns 401 "Token is invalid." for a fresh token | `JWT_SECRET_KEY` differs between Django and FastAPI | Make both identical and restart both |
| Browser CORS error | Frontend origin not in `DJANGO_CORS_ALLOWED_ORIGINS` / `CORS_ALLOWED_ORIGINS` | Add the exact origin (scheme, host, port) |
| `POST /api/auth/refresh/` returns 403 "Origin not allowed." | Same as above | Add origin to Django's CORS allow-list |
| 429 on login | Throttle (10/min) or admin lockout (5 failures/15 min) | Wait for the window, or adjust `THROTTLE_LOGIN_RATE` / `ADMIN_LOGIN_*` in development |
| FastAPI errors about missing tables | Django migrations not applied | `python manage.py migrate` |
| `/health` returns 503 | Database unreachable | Check MySQL is running and the FastAPI `.env` DB settings |
| MySQL auth error from FastAPI | `cryptography` missing (needed for `caching_sha2_password`) | `pip install -r requirements.txt` |
| Payment always FAILED | Amount > 10,000 or card expired | Expected simulator behaviour (see [§9](#9-payment-processing-and-simulation)) |
| Admin console shows 403 for a section | Staff user lacks that view permission | Grant the permission in Django admin, or use a superuser |
| Django admin redirects to HTTPS locally | `DJANGO_DEBUG=False` without the local overrides | Set `DJANGO_DEBUG=True` in development, or `DJANGO_SECURE_SSL_REDIRECT=False` |
| Port already in use when running tests with `-All` | Dev servers still running | Stop servers on 5173/8000/8001 |

---

## 21. Glossary

| Term | Meaning |
|---|---|
| **Access token** | Short-lived JWT sent as `Authorization: Bearer …` on API calls |
| **Refresh token** | Longer-lived JWT in the `ccps_refresh` httpOnly cookie, used only to obtain new access tokens |
| **Blacklist** | simplejwt table of refresh tokens that can no longer be used (after rotation, logout or deactivation) |
| **Masked number** | `**** **** **** NNNN` — the only form in which a card number is stored or shown |
| **Luhn check** | Checksum algorithm that detects mistyped card numbers |
| **Reference** | Unique transaction id, `PAY-` followed by 24 hex characters |
| **Simulator** | Deterministic stand-in for a payment gateway (expired card or amount > 10,000 → FAILED) |
| **Staff / superuser** | Django flags; staff can use admin interfaces with granted permissions, superusers have all permissions |
| **AdminLog** | Application audit trail of administrative actions, scrubbed of sensitive data |
| **Trusted proxy** | Reverse proxy (nginx) whose `X-Forwarded-For` entry is believed for the client IP |

---

*Repository policy: this project is kept local only. Do not push it to GitHub or any other remote.*
