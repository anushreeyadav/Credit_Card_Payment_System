// API base URLs come from Vite environment variables (see .env.example).
// These are public values that end up in the browser bundle - never secrets.
//
// "/" means "same origin as the page": used when a reverse proxy serves the
// app and both APIs from one address (docker compose). Requests then go to
// relative paths such as /api/cards/.

function readUrl(name) {
  const value = import.meta.env[name]
  if (!value) {
    throw new Error(`Missing ${name}. Copy frontend/.env.example to frontend/.env and restart the dev server.`)
  }
  return value.replace(/\/+$/, '')
}

export const DJANGO_API_URL = readUrl('VITE_DJANGO_API_URL')
export const FASTAPI_URL = readUrl('VITE_FASTAPI_URL')
export const DJANGO_ADMIN_URL = `${DJANGO_API_URL}/admin/`
