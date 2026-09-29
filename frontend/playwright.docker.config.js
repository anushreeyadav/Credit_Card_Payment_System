import { defineConfig } from '@playwright/test'

// Browser test of the docker compose stack (http://localhost:8080).
// Start the stack first: `docker compose up -d`. Nothing is started here.
//   DOCKER_ADMIN_PASSWORD=<from .env> npx playwright test -c playwright.docker.config.js
export default defineConfig({
  testDir: './e2e',
  testMatch: 'docker.spec.js',
  workers: 1,
  timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.DOCKER_BASE_URL ?? 'http://localhost:8080',
    channel: 'msedge',
    headless: true,
    trace: 'retain-on-failure',
  },
})
