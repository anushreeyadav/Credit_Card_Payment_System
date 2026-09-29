import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

// Screenshots taken by the automated test suites (the submission set lives in screenshots/).
export const SCREENSHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../screenshots/test-runs')
export const PASSWORD = 'Gr33n-Harbor-2026!'
let seq = 0

export function newUser() {
  seq += 1
  const id = `${Date.now().toString(36)}${seq}`
  return { first: 'Priya', last: 'Sharma', username: `priya_${id}`, email: `priya_${id}@example.com` }
}

export async function fillRegister(page, user, { password = PASSWORD, confirm = password } = {}) {
  await page.goto('/register')
  await page.getByLabel('First name').fill(user.first)
  await page.getByLabel('Last name').fill(user.last)
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(confirm)
  await page.getByRole('button', { name: 'Create account' }).click()
}

// Registers and waits until the redirect to /login has finished.
// Password hashing (PBKDF2, 1,000,000 rounds) plus a cold server can make the
// first register/login of a run take several seconds.
const AUTH_TIMEOUT = { timeout: 15_000 }

export async function registerUser(page, user = newUser()) {
  await fillRegister(page, user)
  await expect(page).toHaveURL(/\/login$/, AUTH_TIMEOUT)
  await expect(page.getByText('Account created. Log in to continue.')).toBeVisible()
  return user
}

export async function registerAndLogin(page, user = newUser()) {
  await registerUser(page, user)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/, AUTH_TIMEOUT)
  return user
}

// Fails the test if a JWT ever appears in the browser console.
export function guardConsoleForTokens() {
  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.consoleMessages = []
    page.on('console', (msg) => testInfo.consoleMessages.push(msg.text()))
  })
  test.afterEach(async ({}, testInfo) => {
    for (const text of testInfo.consoleMessages) {
      expect(text, 'no JWT in console output').not.toMatch(/eyJ[\w-]+\.[\w-]+\./)
    }
  })
}

// Adds a saved card through the Cards page and waits for it to appear.
export async function addCardViaUi(page, { number = '4111111111111111', name = 'Priya Sharma', expiry } = {}) {
  const yy = String((new Date().getFullYear() + 2) % 100).padStart(2, '0')
  await page.goto('/cards')
  await expect(page.getByRole('heading', { name: 'Saved cards' })).toBeVisible()
  await expect(page.getByLabel('Loading cards')).toHaveCount(0)
  const addButton = page.getByRole('button', { name: 'Add card', exact: true })
  if (await addButton.isVisible()) await addButton.click()
  await page.getByLabel('Card number').fill(number)
  await page.getByLabel('Name on card').fill(name)
  await page.getByLabel('Expiry date').fill(expiry ?? `12${yy}`)
  await page.getByRole('button', { name: 'Save card' }).click()
  await expect(page.getByText(/ending in \d{4} was added\./)).toBeVisible()
}

// --- Fast data seeding through the real APIs (for tests that need many rows) ---
const DJANGO = 'http://127.0.0.1:8000'
const FASTAPI = 'http://127.0.0.1:8001'

// Returns an access token for an existing user (via Django's login API).
export async function apiLogin(request, username, password = PASSWORD) {
  const response = await request.post(`${DJANGO}/api/auth/login/`, { data: { username, password } })
  expect(response.status()).toBe(200)
  return (await response.json()).access
}

export async function apiAddCard(request, token, number = '4111111111111111') {
  const yy = new Date().getFullYear() + 2
  const response = await request.post(`${DJANGO}/api/cards/`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { card_number: number, cardholder_name: 'Priya Sharma', expiry_month: 12, expiry_year: yy },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id
}

export async function apiPay(request, token, cardId, amount, description = '') {
  const response = await request.post(`${FASTAPI}/api/payments/`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { card_id: cardId, amount, currency: 'INR', description },
  })
  expect(response.status()).toBe(201)
  return response.json()
}
