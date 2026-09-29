# Automated Tests

**Result (final validation, 29 Sep 2026): 488 checks. 488 passed after one re-run (see note).**

| Suite | Tool | Tests | Passed | Failed | Coverage |
|---|---|---|---|---|---|
| Django API | pytest + pytest-django + pytest-cov | 148 | 148 | 0 | **97.2%** (1,144 statements, branch coverage on) |
| FastAPI payment service | pytest + pytest-cov | 53 | 53 | 0 | **100%** (221 statements, branch coverage on) |
| Frontend logic and API services | Vitest + V8 coverage | 114 | 114 | 0 | **100%** of `src/utils` and `src/services` |
| Browser end-to-end | Playwright (Microsoft Edge) | 55 | 55* | 0* | UI flows (not line-measured) |
| API contract | Postman collection via Newman | 118 assertions / 54 requests | 118 | 0 | every endpoint |
| **Total** | | **370 tests + 118 assertions** | **488** | **0** | **98.5% overall** for the three coverage-measured suites (25 of 1,664 statements missed) |

\* In the full run, one browser test (`admin.spec.js › users, cards, transactions and admin logs views`)
failed when Windows refused to open its screenshot file (`UNKNOWN: unknown error, open ...admin-logs.png`),
a transient file lock under heavy load. All app assertions before that point had passed. Re-running
`admin.spec.js` alone: 7/7 passed.

Target was a minimum of 50% overall coverage.

## Running the tests

```powershell
# Unit/integration suites with coverage (about 2 minutes)
powershell -ExecutionPolicy Bypass -File .\run_tests.ps1

# Everything, including browser and Postman suites (about 8 minutes).
# Ports 5173, 8000 and 8001 must be free.
powershell -ExecutionPolicy Bypass -File .\run_tests.ps1 -All
```

The browser and Postman suites start their own servers on a throwaway MySQL database
(`test_credit_card_payment_db`), which is dropped afterwards. The real database is never touched.

Individual suites:

| Suite | Command (from the folder) |
|---|---|
| Django | `backend\django_backend> .\venv\Scripts\python.exe -m pytest --cov` |
| FastAPI | `backend\fastapi_backend> .\venv\Scripts\python.exe -m pytest --cov=app` |
| Frontend unit | `frontend> npm run test:coverage` |
| Browser | `frontend> npm run test:e2e` |
| Postman | `powershell -File .\postman\run_newman.ps1` |

HTML coverage reports: `backend/django_backend/htmlcov/`, `backend/fastapi_backend/htmlcov/`, `frontend/coverage/`.

## Where each requirement is tested

Test names are `file::test`. Django paths are relative to `backend/django_backend/`, FastAPI paths to
`backend/fastapi_backend/`, browser tests to `frontend/e2e/`.

### Authentication
| Requirement | Tests |
|---|---|
| Registration | `accounts/tests.py::RegisterTests` (success, duplicate username/email, validation, password strength, password never echoed) · e2e `auth.spec.js › registration` |
| Login | `accounts/tests.py::LoginTests::test_login_returns_access_and_sets_httponly_cookie`, `test_login_with_email` · e2e `auth.spec.js › login` |
| Invalid login | `LoginTests::test_invalid_credentials`, `test_inactive_user_cannot_log_in`, `test_missing_fields`, `test_login_is_throttled` · e2e `invalid credentials show an error` |
| JWT authentication | `SessionTests` (valid, expired, garbage token, refresh rotation, blacklist on logout), `SessionEdgeCaseTests` · FastAPI `tests/test_auth_and_health.py::test_invalid_tokens_rejected` (10 forged/expired/wrong-type tokens) |
| Protected routes | `SessionTests::test_unauthorized_requests` · every endpoint's "no token" test · e2e `auth.spec.js › protected routes` (5 pages redirect to `/login`) |

### Card management
| Requirement | Tests |
|---|---|
| Add card | `cards/tests.py::CardAPITests::test_add_valid_card`, `test_detects_card_types`, `CardValidationEdgeCaseTests::test_supported_brands_detected` · e2e `cards.spec.js › add, refresh, delete` |
| List cards | `CardAPITests::test_list_returns_only_own_cards` |
| Delete card | `CardAPITests::test_delete_own_card` · e2e lifecycle test (with confirmation dialog) |
| Unauthorized card access | `test_cannot_delete_another_users_card`, `test_cannot_see_another_users_card`, `test_unauthenticated_requests_rejected`, `test_invalid_token_rejected` |
| No CVV persistence | `test_database_stores_only_masked_data` (raw SQL row check), `CardValidationEdgeCaseTests::test_no_cvv_column_or_value_ever_persisted`, `test_error_messages_do_not_echo_card_number` |

### Payments (FastAPI)
| Requirement | Tests (`tests/test_payments.py`) |
|---|---|
| Successful payment | `test_successful_payment`, `test_amount_at_limit_succeeds` · e2e `payments.spec.js › successful payment` |
| Failed payment | `test_failed_payment_insufficient_funds`, `test_failed_payment_expired_card` |
| Pending payment | `test_payment_is_pending_while_processing` (row read as PENDING mid-processing), `test_payment_stays_pending_if_processing_crashes` · e2e PENDING test |
| Invalid amount | `test_invalid_amount_rejected` (9 cases: 0, negative, 3 decimals, over the maximum, text, null, empty) |
| Invalid card | `test_invalid_card_rejected` (5 cases), `test_nonexistent_card_returns_404`, `test_cannot_pay_with_another_users_card` |
| Unauthorized payment | `test_unauthenticated_rejected` (none/garbage/expired/refresh token), `test_token_of_deactivated_user_rejected`, `test_token_of_deleted_user_rejected` |
| No card data accepted or stored | `test_card_number_and_cvv_rejected_and_not_echoed`, `test_card_number_in_description_rejected`, `test_payment_table_has_no_sensitive_columns` |

### Transactions
| Requirement | Tests (`payments/tests.py::TransactionHistoryTests`) |
|---|---|
| History | `test_history_lists_own_transactions_newest_first`, `test_history_survives_card_deletion`, `test_pagination` |
| Status filter | `test_status_filter` |
| Amount filter | `test_amount_filter`, `test_equal_bounds_allowed` |
| Date filter | `test_date_filter` (date_to includes the whole day) |
| Combined filters and validation | `test_combined_filters`, `test_invalid_query_parameters_rejected` |
| User isolation | `test_user_isolation` · e2e `transactions.spec.js › users only see their own transactions` (two browser sessions) |

### Admin
| Requirement | Tests |
|---|---|
| Admin authentication | `payments/test_admin.py::AdminLoginTests` (login, wrong password, non-staff refused, anonymous redirected) · `adminlogs/tests.py::AdminLoginLockoutTests` (brute-force lockout) |
| Admin-only endpoints | `adminpanel/tests.py::AccessControlTests` (anonymous 401, customer 403, staff without permission 403, per-section permissions, superuser 200, inactive staff 401) · e2e `admin.spec.js › access control` |
| Daily summary | `adminpanel/tests.py::SummaryTests`, `payments/test_admin.py::DailySummaryTests` (counts, per-currency totals, success rate, other days, empty day, invalid date, permission) · e2e `daily statistics update with new payments` |
| Admin logs | `adminlogs/tests.py` (login, failed login, user changes, card/transaction views, CSV export, no secrets stored) |

## Bug found by this round of testing

**Refreshing a session after the account was deleted returned HTTP 500.** simplejwt's
`TokenRefreshSerializer` looks the user up with `.get()`, which raises `DoesNotExist`. It's now handled
(401, and the stale cookie is cleared) in `accounts/views.py::RefreshView`. Regression tests:
`SessionEdgeCaseTests::test_refresh_refused_after_account_deleted` and
`test_refresh_refused_after_account_deactivated`.

## Lines not covered, and why

| Code | Reason |
|---|---|
| `manage.py` (9 lines) | Command-line entry point, not run by tests |
| `config/settings.py` lines 51–59 | Production-only block (`DEBUG=False`). Tested in a separate interpreter (`config/tests.py::DeploymentConfigTests`), which coverage can't see. |
| `accounts/views.py` 203–205 | Defensive check after the token is validated. It's only reachable if the account changes between two queries in one request. |
| `accounts/serializers.py` 34 | Case-insensitive duplicate-username check. On MySQL (case-insensitive collation) Django's own unique check rejects `ALICE` first. Kept for case-sensitive databases. |
| `cards/serializers.py` 70 | Month range check. The model's validator always rejects first. |
| `adminlogs/throttle.py` 29–30 | Cache race: the counter expires between `add` and `incr`. |
