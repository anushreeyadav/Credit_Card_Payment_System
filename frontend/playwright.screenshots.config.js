import { randomBytes } from 'node:crypto'

import { defineConfig } from '@playwright/test'

import baseConfig from './playwright.config.js'

// Captures the submission screenshots into ../screenshots/.
//   npx playwright test -c playwright.screenshots.config.js
// Starts the same throwaway servers as the e2e suite (fresh database), seeds
// realistic fake data, and drives Microsoft Edge at a fixed 1440x900 viewport.

process.env.SCREENSHOT_USER_PASSWORD ??= `Shot-${randomBytes(12).toString('hex')}!`

// Normal 5-minute access tokens (the e2e suite shortens them to test expiry).
const webServer = baseConfig.webServer.map((server) =>
  server.env?.JWT_ACCESS_TOKEN_LIFETIME_SECONDS
    ? { ...server, env: { ...server.env, JWT_ACCESS_TOKEN_LIFETIME_SECONDS: '300' } }
    : server,
)

export default defineConfig({
  ...baseConfig,
  testIgnore: undefined,
  testMatch: 'capture-screenshots.js',
  timeout: 180_000,
  webServer,
  use: {
    ...baseConfig.use,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  },
})
