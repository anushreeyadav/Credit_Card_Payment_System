# Security Audit — Credit Card Payment System

**Date:** 29 September 2026
**Scope:** Django backend (auth, cards, transactions, admin API, Django admin), FastAPI payment service, React frontend, MySQL configuration, secrets handling.
**Result:** 8 issues found and fixed (F8 was found later, in prompt 21). 1 item needs manual action. Everything else passes.

| Status | Count |
|---|---|
| ✅ PASS | 44 areas (see below) |
| 🔧 FIXED during audit | 8 (F8 in prompt 21) |
| ⚠️ NEEDS FIX (manual) | 1 |
| ❌ FAIL (open) | 0 |

---

## How it was tested

| Method | Result |
|---|---|
| **Live probes**: `security/live_probe.py` against Django in **production mode (`DEBUG=False`)** + FastAPI on a throwaway database | **97 / 97 pass** after fixes (91 / 97 before) |
| Server log scan after the probes: card numbers, JWTs, passwords, keys, tracebacks | **5 / 5 pass** |
| Django `manage.py check --deploy` (`DEBUG=False`) | 1 accepted warning (W021, see below); 4 warnings before |
| Django test suite | **124 / 124 pass** |
| FastAPI test suite | **38 / 38 pass** |
| Browser tests (Playwright, Microsoft Edge) | **55 / 55 pass** |
| `pip-audit` on both backends' installed packages | No known vulnerabilities |
| `npm audit` on the frontend | 0 vulnerabilities |
| Code review of every database query, `.env` handling, `.gitignore` rules, CORS and error handling | See below |

To repeat the live probes (with ports 8000/8001 free):

```powershell
powershell -ExecutionPolicy Bypass -File .\security\run_live_probe.ps1 -DocsOff
```

---

## Findings fixed during the audit

| # | Severity | Finding | Fix |
|---|---|---|---|
| F1 | **High** | FastAPI accepted a still-valid access token after the user was **deactivated or deleted** (up to 5 minutes). Django already rejected it. | `app/auth.py` now checks that the user exists and is active in `auth_user` on every request. Tested in both the unit tests and the live probes. |
| F2 | **High** | A card number typed into the free-text payment **note** (`description`) was accepted and stored, breaking "never store full card numbers". | FastAPI rejects any 13–19 digit sequence in the note with 422, without echoing it back. The frontend blocks it before sending. |
| F3 | Medium | API responses carrying card, payment and account data had no `Cache-Control: no-store`. FastAPI also lacked `X-Content-Type-Options`. | Django `ApiNoStoreMiddleware` covers `/api/`. FastAPI now adds `no-store`, `nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`. |
| F4 | Medium | Production settings lacked HTTPS enforcement: `check --deploy` raised W004, W008, W012 and W016. | With `DEBUG=False`: SSL redirect, HSTS (1 year, including subdomains), secure session and CSRF cookies. The proxy header is opt-in. Verified: plain HTTP returns 301 to HTTPS. |
| F5 | Medium | The **Django admin login** had no brute-force protection. The API login was throttled, the admin login was not. | 5 failures per IP within 15 minutes blocks further attempts (429) until the window passes. A successful login resets the count. Lockouts are recorded in Admin logs. |
| F6 | Low | FastAPI `/docs`, `/redoc` and `/openapi.json` were always public. | New `ENABLE_API_DOCS` setting: default `true` for development, set `false` in production. |
| F8 | **High** | *Found in prompt 21 (Docker).* The API login/registration **rate limit could be bypassed** by sending a different `X-Forwarded-For` header on each request: DRF's default (`NUM_PROXIES=None`) trusts that client-controlled header. | `DJANGO_NUM_PROXIES` (default 0) now sets DRF `NUM_PROXIES`, and `RealClientIPMiddleware` uses the header only from trusted proxies (1 = nginx in Docker). Regression test `config/tests.py::ClientIpTests`. Verified through nginx: spoofed headers are throttled after 10 attempts. |
| F7 | Low | An admin typing a full card number into a dashboard search box would put it in the URL, and so in server access logs. | The React admin search refuses 13–19 digit input and suggests the last 4 digits. The audit log already redacted such values. |

## Needs manual action

| # | Severity | Item | What to do |
|---|---|---|---|
| M1 | **High** | The `admin` superuser still uses the password generated during Module 5, which was shown in a chat transcript. | `cd backend\django_backend` then `.\venv\Scripts\python.exe manage.py changepassword admin` |

---

## Detailed results

### Authentication
| Check | Status | Evidence |
|---|---|---|
| JWT signature validated (HS256 only) | ✅ PASS | Wrong key, `alg: none`, HS512 and tampered payloads are all rejected (401) on all 14 protected endpoints |
| Protected endpoints require a token | ✅ PASS | All 14 return 401 without a token, including every `/api/admin/` endpoint |
| Token expiry | ✅ PASS | Expired tokens get 401. The frontend refreshes silently once, then sends the user to login (browser-tested) |
| Refresh token can't be used as an access token | ✅ PASS | `token_type` is checked by both Django and FastAPI |
| Refresh rotation and blacklist | ✅ PASS | A rotated-out token can't be reused. Logout blacklists the current one. |
| Deactivated or deleted users | 🔧 FIXED (F1) | Django and FastAPI both return 401 |
| Refresh token storage | ✅ PASS | httpOnly, SameSite=Strict cookie scoped to `/api/auth/`, Secure in production. The access token is kept in memory only (browser-tested). |
| Login brute force (API) | ✅ PASS | 10/min per IP, 429 afterwards (unit-tested) |
| Login brute force (Django admin) | 🔧 FIXED (F5) | |

### Password security
| Check | Status | Evidence |
|---|---|---|
| Passwords hashed | ✅ PASS | PBKDF2-SHA256, 1,000,000 iterations |
| Strength rules | ✅ PASS | Minimum length 8, common-password list, all-numeric check, similarity to username/email |
| No plaintext passwords | ✅ PASS | No hardcoded passwords in app code. Probe and server logs contain none. |
| Hashes never returned | ✅ PASS | Register, `/me`, admin users API and the Django admin were all probed. The Django admin shows only a masked hash summary. |
| Passwords not echoed in errors | ✅ PASS | Weak-password errors don't repeat the password. Error reports treat it as sensitive. |

### Card security
| Check | Status | Evidence |
|---|---|---|
| Full card number never stored | ✅ PASS | `cards_card` has only a masked number, last 4, brand, holder and expiry. Checked with a direct MySQL query. |
| CVV never stored | ✅ PASS | No CVV column. The CVV is accepted optionally, validated, then discarded. The UI doesn't collect it. |
| Full card number never returned | ✅ PASS | Card, payment, transaction and admin APIs return masked data only |
| Card data in payment requests | ✅ PASS | FastAPI rejects `card_number` and `cvv` fields (422) without echoing the values |
| Card numbers in free text | 🔧 FIXED (F2, F7) | |
| Not logged | ✅ PASS | Server logs after the probe contain no card numbers. The audit log redacts card-like values and JWTs. |
| Not in screenshots | ✅ PASS | Screenshots show masked numbers only (fixed in prompt 14) |
| Browser caching | 🔧 FIXED (F3) | |

### Authorization
| Check | Status | Evidence |
|---|---|---|
| User A can't list, delete or pay with User B's card | ✅ PASS | Probed: 404 (existence isn't revealed) |
| User A can't see User B's transactions or payments | ✅ PASS | Probed on the list and `GET /api/payments/{ref}` |
| Admin endpoints protected | ✅ PASS | Customers get 403 everywhere. Staff need the specific Django permission per section. |
| Account status changes | ✅ PASS | Need the change-user permission. You can't change your own status. Only a superuser can change a superuser. |

### Input validation
| Check | Status | Evidence |
|---|---|---|
| Invalid amounts | ✅ PASS | `0`, `-1`, `abc`, `1.234`, `1e309`, `NaN`, `Infinity`, over the maximum, empty, null: all 422 |
| Invalid cards | ✅ PASS | Checksum, length, brand and expiry validated. Rejected numbers aren't echoed back. |
| Invalid IDs | ✅ PASS | Text, negative, huge, decimal and array IDs, in the body and the URL, give 404/422 and never a 500 |
| Invalid dates | ✅ PASS | `2026-13-01`, `2026-02-30`, `abc`, and from-after-to all give 400 |
| Invalid status | ✅ PASS | `DONE` and injection strings give 400 |
| Invalid authentication data | ✅ PASS | Missing fields, a list instead of a string, a 10,000-character username, null password and malformed JSON give 400/401 and never a 500 |
| Unknown fields | ✅ PASS | FastAPI forbids extra fields. DRF ignores unknown fields and read-only fields can't be set. |

### SQL injection
| Check | Status | Evidence |
|---|---|---|
| Queries use the ORM / parameters | ✅ PASS | Every query is Django ORM or SQLAlchemy. The only raw SQL in app code is `SELECT 1` (health check). DDL with f-strings appears only in test setup scripts, using constant names. |
| Behavioural test | ✅ PASS | `' OR '1'='1`, `; DROP TABLE`, `" OR ""="`, `%' --` and a time-based `SLEEP(5)` payload are all treated as text: no results, no delay, tables intact. Login injection doesn't authenticate. |

### Secrets
| Check | Status | Evidence |
|---|---|---|
| `.env` used | ✅ PASS | Django: secret key, JWT key and DB credentials. FastAPI: DB credentials and JWT key. Frontend: API URLs only (public). |
| No hardcoded secrets | ✅ PASS | Code scan clean. The key `startproject` generated was removed in prompt 3. |
| `.env` ignored by Git | ✅ PASS | Checked with `git check-ignore` against the real ignore files: all three `.env` files, venvs, `node_modules`, database dumps and test output are ignored. `.env.example` files are tracked. |
| Key quality | ✅ PASS | JWT key 64 random characters, separate from the 50-character Django `SECRET_KEY`. DB password 32 random characters. The JWT key is identical in both backends, as required. |
| Admin password exposure | ⚠️ NEEDS FIX (M1) | |

### CORS
| Check | Status | Evidence |
|---|---|---|
| Explicit allow-list, no wildcard | ✅ PASS | Only `http://127.0.0.1:5173` and `http://localhost:5173`, configured through `.env` |
| Other origins refused | ✅ PASS | `evil.example` gets no `Access-Control-Allow-Origin` on Django or FastAPI |
| Credentials | ✅ PASS | Django allows credentials only for the refresh cookie on `/api/`. FastAPI doesn't allow credentials (Bearer only). |
| Cookie endpoints from foreign origins | ✅ PASS | Refresh and logout return 403 when `Origin` isn't allowed |
| CSRF | ✅ PASS | The API uses Bearer tokens. Cookie endpoints are protected by SameSite=Strict, the origin check and JSON-only parsing. The Django admin uses Django's CSRF protection. |

### Error handling
| Check | Status | Evidence |
|---|---|---|
| No stack traces in production | ✅ PASS | With `DEBUG=False` the 404 and error pages are generic. FastAPI returns plain `{"detail": ...}`. No tracebacks appeared in the logs during the probes. |
| No DB credentials, tokens or passwords in errors | ✅ PASS | Every probe response was scanned for secret keys, the DB password, test passwords and card numbers |
| Validation errors don't echo input | ✅ PASS | FastAPI's default 422 (which echoes input) was replaced in Module 3. DRF errors don't echo values. |
| Django debug page (development only) | ✅ PASS | Development runs with `DEBUG=True`. Django's error-report filter hides keys, passwords and tokens, and card and password fields are marked sensitive. |
| Production headers and HTTPS | 🔧 FIXED (F3, F4) | |

---

## Accepted / informational

| Item | Notes |
|---|---|
| `check --deploy` W021 (HSTS preload) | Opt-in through `DJANGO_SECURE_HSTS_PRELOAD`. Only enable it after submitting the domain to the preload list. |
| Registration reveals whether a username or email exists | Required by the assignment ("duplicate email/user" errors). Mitigated by the 10/hour registration limit. |
| Development `.env` has `DJANGO_DEBUG=True` | Intended for local use. Production must set `False`, which also turns on F4. |

## Recommendations for production

1. **Least-privilege database users:** `ccps_app` has ALL on its database. Run the apps with SELECT/INSERT/UPDATE/DELETE only, give migrations their own user, and give FastAPI a separate, more limited user.
2. **Shared cache (e.g. Redis)** so the login throttles and admin lockout apply across all server workers.
3. **Content-Security-Policy** header on the hosted React app.
4. **Idempotency key** on `POST /api/payments/` so a retried request can't create a duplicate payment, plus a per-user rate limit.
5. **Run `security/run_live_probe.ps1`, `pip-audit` and `npm audit`** before every release.
