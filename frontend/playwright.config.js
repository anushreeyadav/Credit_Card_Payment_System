import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from '@playwright/test'

// Browser tests for the frontend + Django + FastAPI, using the locally installed
// Microsoft Edge (no browser download). Django runs against a throwaway
// database (see e2e/django_test_server.py). Ports 8000, 8001 and 5173 must be free.

const here = path.dirname(fileURLToPath(import.meta.url))
const djangoPython = path.resolve(here, '../backend/django_backend/venv/Scripts/python.exe')
const fastapiPython = path.resolve(here, '../backend/fastapi_backend/venv/Scripts/python.exe')

// Generated per run; never written to disk.
process.env.E2E_STAFF_PASSWORD ??= `E2e-${randomBytes(12).toString('hex')}!`
export const ACCESS_TOKEN_SECONDS = 6

export default defineConfig({
  testDir: './e2e',
  // docker.spec.js runs against docker compose (playwright.docker.config.js);
  // capture-screenshots.js makes the submission screenshots (playwright.screenshots.config.js).
  testIgnore: ['docker.spec.js', 'capture-screenshots.js'],
  fullyParallel: false,
  workers: 1, // tests share one server and database
  timeout: 45_000,
  reporter: [['list']],
  globalTeardown: './e2e/global-teardown.js',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'msedge',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `"${djangoPython}" e2e/django_test_server.py`,
      url: 'http://127.0.0.1:8000/api/auth/me/',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        // Short access tokens so expiry/refresh can be tested in seconds.
        JWT_ACCESS_TOKEN_LIFETIME_SECONDS: String(ACCESS_TOKEN_SECONDS),
        THROTTLE_LOGIN_RATE: '1000/min',
        THROTTLE_REGISTER_RATE: '1000/min',
        E2E_STAFF_PASSWORD: process.env.E2E_STAFF_PASSWORD,
      },
    },
    {
      // FastAPI payment service on the same throwaway database. /health returns
      // 503 until Django has created it, so Playwright keeps waiting.
      command: `"${fastapiPython}" -m uvicorn app.main:app --host 127.0.0.1 --port 8001`,
      cwd: path.resolve(here, '../backend/fastapi_backend'),
      url: 'http://127.0.0.1:8001/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { DB_NAME: 'test_credit_card_payment_db' },
    },
    {
      command: 'npm run dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
