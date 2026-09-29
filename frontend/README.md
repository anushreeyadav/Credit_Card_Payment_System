# Frontend

React 19 + Vite + Tailwind CSS 4 + React Router 7.

## Setup

```powershell
cd C:\Credit_Card_Payment_System\frontend
copy .env.example .env    # first time only
npm install
npm run dev               # http://127.0.0.1:5173
```

Start the backends too (Django on 8000, FastAPI on 8001). The dashboard shows whether each one is reachable.

## Environment variables

| Variable | Default | Used for |
|---|---|---|
| `VITE_DJANGO_API_URL` | `http://127.0.0.1:8000` | Cards, transactions, admin, auth |
| `VITE_FASTAPI_URL` | `http://127.0.0.1:8001` | Payments |

`VITE_` variables are compiled into the browser bundle. Never put secrets in them.

## Structure

```
src/
├── assets/       static images/icons
├── components/   shared UI (Navbar, ApiStatus, PagePlaceholder)
├── context/      React context (auth state)
├── hooks/        custom hooks (useAuth, useApiStatus)
├── layouts/      MainLayout (nav + page), AuthLayout (login/register)
├── pages/        one component per route
├── routes/       route table and path constants
├── services/     API clients for Django and FastAPI
└── utils/        formatting helpers
```

## Authentication

- **Access token** (5 min): returned by `POST /api/auth/login/`, kept in memory only
  (never localStorage/sessionStorage). Lost on reload by design.
- **Refresh token**: httpOnly, `SameSite=Strict` cookie `ccps_refresh` scoped to `/api/auth/`.
  JavaScript cannot read it. On page load the app calls `/api/auth/refresh/` to restore the session.
- On a 401 the app refreshes once and retries; if that fails the user is sent to `/login`
  with a "session expired" message. Logout blacklists the refresh token.

Open the app at **http://127.0.0.1:5173** (not `localhost`). The API is on `127.0.0.1:8000`,
and the SameSite cookie is only sent when both use the same host.

## Scripts

- `npm run dev` - dev server
- `npm run build` - production build into `dist/`
- `npm run lint` - ESLint
- `npm run test:e2e` - browser tests (Playwright + installed Microsoft Edge). Starts its own
  Django (on a throwaway `test_credit_card_payment_db`) and Vite servers, so ports 8000 and
  5173 must be free. Screenshots are written to `../screenshots/`.
