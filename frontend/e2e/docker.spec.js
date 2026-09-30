// Full journey through the docker compose stack: nginx -> React, Django, FastAPI -> MySQL.
// Run with playwright.docker.config.js (see that file). Not part of the regular e2e suite.
import { expect, test } from '@playwright/test'

import { addCardViaUi, guardConsoleForTokens, registerAndLogin, SCREENSHOTS } from './helpers.js'

guardConsoleForTokens()

test.describe.configure({ mode: 'serial' })

test('frontend is served by nginx with security headers', async ({ page }) => {
  const response = await page.goto('/login')
  expect(response.status()).toBe(200)
  const headers = response.headers()
  expect(headers['content-security-policy']).toContain("default-src 'self'")
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers.server).toBe('nginx') // no version number
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('customer journey: register, card, payments, history, session, logout', async ({ page }) => {
  // Register + login (Django, JWT, refresh cookie through the proxy)
  await registerAndLogin(page)

  // Dashboard reaches both APIs through nginx
  await expect(page.getByTestId('status-Django')).toHaveText('online')
  await expect(page.getByTestId('status-FastAPI')).toHaveText('online')

  // Card (Django -> MySQL)
  await addCardViaUi(page)
  await expect(page.getByTestId('card-masked-number')).toHaveText('**** **** **** 1111')

  // Payments (FastAPI -> MySQL, reading the card Django stored)
  await page.getByRole('link', { name: 'Make Payment', exact: true }).click()
  await page.getByLabel('Amount').fill('250')
  await page.getByRole('button', { name: /^Pay/ }).click()
  await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'SUCCESS')
  await expect(page.getByTestId('payment-reference')).toHaveText(/^PAY-[0-9A-F]{24}$/)
  await page.getByRole('button', { name: 'Make another payment' }).click()
  await page.getByLabel('Amount').fill('15000')
  await page.getByRole('button', { name: /^Pay/ }).click()
  await expect(page.getByTestId('failure-reason')).toHaveText('Insufficient funds.')

  // Transaction history (Django reading rows FastAPI wrote)
  await page.getByRole('link', { name: 'View transactions' }).click()
  await expect(page.getByTestId('transaction-row')).toHaveCount(2)
  await page.screenshot({ path: `${SCREENSHOTS}/docker-transactions.png`, fullPage: true })

  // Session survives a reload (httpOnly refresh cookie via /api/auth/refresh/)
  await page.reload()
  await expect(page.getByTestId('transaction-row')).toHaveCount(2)

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByText('You have been logged out.')).toBeVisible()
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
})

test('admin dashboard and Django admin through the proxy', async ({ page }) => {
  const password = process.env.DOCKER_ADMIN_PASSWORD
  test.skip(!password, 'DOCKER_ADMIN_PASSWORD not set')

  // React admin dashboard (staff JWT)
  await page.goto('/login')
  await page.getByLabel('Username or email').fill('admin')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })
  await page.getByRole('link', { name: 'Admin' }).click()
  await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible()
  await page.getByRole('link', { name: 'Payment Summary', exact: true }).click()
  await expect(Number(await page.getByTestId('stat-total').textContent())).toBeGreaterThanOrEqual(2)
  await page.screenshot({ path: `${SCREENSHOTS}/docker-admin.png`, fullPage: true })

  // Django admin: session login with CSRF through nginx, static files via WhiteNoise
  await page.goto('/admin/login/')
  const css = await page.request.get('/static/admin/css/base.css')
  expect(css.status()).toBe(200)
  await page.getByLabel('Username:').fill('admin')
  await page.getByLabel('Password:').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible()
  await page.goto('/admin/payments/payment/daily-summary/')
  await expect(page.getByRole('heading', { name: /Daily payment summary/ })).toBeVisible()
})

test('API documentation is reachable', async ({ page }) => {
  await page.goto('/docs')
  await expect(page.getByText('Credit Card Payment Service').first()).toBeVisible({ timeout: 20_000 })
  await page.goto('/api/docs/')
  await expect(page.getByText('Credit Card Payment System - Django API').first()).toBeVisible({ timeout: 20_000 })
})
