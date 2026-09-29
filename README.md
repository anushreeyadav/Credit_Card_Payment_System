# Credit Card Payment System

A credit card payment system: customers register, save cards (stored masked only), make
**simulated** payments and review their transaction history; administrators manage users, cards and
transactions, see daily payment statistics and an audit log. No real payment gateway is used.

| Documentation | |
|---|---|
| [DOCKER.md](DOCKER.md) | Run the whole system with Docker Compose |
| [TESTING.md](TESTING.md) | Test suites, coverage, where each requirement is tested |
| [SECURITY_AUDIT.md](SECURITY_AUDIT.md) | Security review and fixes |
| [database/README.md](database/README.md) | Database scripts and the final dump |
| [postman/README.md](postman/README.md) | Postman collection |
| [screenshots/README.md](screenshots/README.md) | UI screenshots |

## Features

- **Accounts:** registration, login (username or email), logout; JWT access tokens (5 min, kept in memory) with an httpOnly refresh cookie.
- **Cards:** add, list and delete. Only the masked number, last 4 digits, brand, holder and expiry are stored. **Full card numbers and CVVs are never stored or returned.**
- **Payments** (FastAPI): pay with a saved card. Each payment is saved as `PENDING`, then set to `SUCCESS` or `FAILED` by a deterministic simulator (over ₹10,000 or an expired card fails).
- **Transactions:** history filtered by status, amount and date, with pagination. Users only see their own.
- **Admin:** React dashboard (users with activate/deactivate, cards, transactions, daily summary, audit log) plus the Django admin (CSV export, daily summary page).
- **Security:** audit log of admin actions, login rate limits and admin lockout, strict CORS, no-store API responses, production HTTPS settings.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, React Router |
| Backend | Django 5.2 LTS + Django REST Framework, djangorestframework-simplejwt, drf-spectacular |
| Payment service | FastAPI, SQLAlchemy, PyMySQL |
| Database | MySQL 8 (8.0 locally, 8.4 in Docker) |
| Testing | pytest, pytest-django, pytest-cov, Vitest, Playwright, Postman/Newman |
| Containers | Docker, Docker Compose, nginx, gunicorn, uvicorn |

## Project structure

```
Credit_Card_Payment_System/
├── backend/
│   ├── django_backend/     # Django REST API: accounts, cards, transactions, admin API, audit log
│   └── fastapi_backend/    # FastAPI payment service
├── frontend/               # React app (src/), unit tests, Playwright tests (e2e/)
├── database/               # setup/audit/dump scripts; dumps/credit_card_payment_system.sql
├── docker/                 # Dockerfiles, nginx.conf, env and verification scripts
├── postman/                # Postman collection + environment template
├── screenshots/            # Submission screenshots
├── security/               # Live security probe
├── docker-compose.yml
└── run_tests.ps1           # Runs every test suite with coverage
```

## Quick start with Docker

```powershell
powershell -ExecutionPolicy Bypass -File .\docker\init-env.ps1   # creates .env with random secrets
docker compose up -d --build
```

Open **http://localhost:8080**. The admin account is `admin`; its password is `DJANGO_SUPERUSER_PASSWORD`
in `.env`. See [DOCKER.md](DOCKER.md).

## Local setup (without Docker)

**Prerequisites:** Python 3.12+ (developed on 3.14), Node.js 20+ (developed on 24), MySQL 8.

1. **Database.** Create `backend/django_backend/.env` from `.env.example` (fill in the secrets), then create
   the database and application user. The script asks for the MySQL root password:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\database\setup_mysql.ps1
   ```
2. **Django** (port 8000):
   ```powershell
   cd backend\django_backend
   python -m venv venv; .\venv\Scripts\Activate.ps1
   pip install -r requirements-dev.txt
   python manage.py migrate
   python manage.py createsuperuser
   python manage.py runserver
   ```
3. **FastAPI** (port 8001). Create `backend/fastapi_backend/.env` from `.env.example`, using the **same**
   `JWT_SECRET_KEY` and database settings as Django:
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
   Open **http://127.0.0.1:5173**. Use `127.0.0.1`, not `localhost`, because the refresh cookie is
   SameSite and the API runs on `127.0.0.1`.

| URL | What |
|---|---|
| http://127.0.0.1:5173 | App |
| http://127.0.0.1:8000/admin/ | Django admin |
| http://127.0.0.1:8000/api/docs/ | Django API docs (Swagger UI) |
| http://127.0.0.1:8001/docs | FastAPI docs (Swagger UI) |

## Tests

```powershell
powershell -ExecutionPolicy Bypass -File .\run_tests.ps1        # unit/integration with coverage
powershell -ExecutionPolicy Bypass -File .\run_tests.ps1 -All   # + browser and Postman suites
```

Details and coverage are in [TESTING.md](TESTING.md).

## Configuration and secrets

All secrets (Django secret key, JWT signing key, database passwords) come from git-ignored `.env`
files. Every `.env` has a matching `.env.example` with placeholders. Nothing secret is hardcoded, baked
into Docker images, or included in the database dump.

## Security notes

- Never commit real card numbers, CVVs, passwords, JWT secrets or database credentials.
- Use only public test card numbers (e.g. `4111 1111 1111 1111`).
- `database/dumps/` is git-ignored except the sanitised final dump (schema and reference data only).

## Repository policy

This project is kept **local only**. Do not push it to GitHub or any other remote.
