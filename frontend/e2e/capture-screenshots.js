// Submission screenshots. Run with playwright.screenshots.config.js.
// Every shot is checked first: no full card numbers, CVVs, passwords or JWTs on the page.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(here, '../../screenshots')
const PYTHON = path.resolve(here, '../../backend/django_backend/venv/Scripts/python.exe')
const DJANGO = 'http://127.0.0.1:8000'
const FASTAPI = 'http://127.0.0.1:8001'
const CUSTOMER = { username: 'priya_sharma', password: process.env.SCREENSHOT_USER_PASSWORD }
const ADMIN = { username: 'anita_admin', password: process.env.E2E_STAFF_PASSWORD }
const TEST_CARD = '5105105105105100' // public Mastercard test number

test.describe.configure({ mode: 'serial' })

function luhnValid(digits) {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2
    sum += d
  }
  return sum % 10 === 0
}

// Fails the run if anything sensitive is on the page, then saves the screenshot.
async function shot(page, name, { fullPage = true } = {}) {
  await page.waitForLoadState('networkidle')
  const html = await page.content()
  const text = await page.evaluate(() => document.body.innerText)
  const inputs = await page.$$eval('input, textarea', (els) => els.map((e) => ({ type: e.type, name: e.name, value: e.value })))
  const everything = [html, text, ...inputs.map((i) => i.value)].join('\n')

  const cardNumbers = (everything.match(/(?<![\w*])(?:\d[ -]?){12,18}\d(?!\w)/g) ?? [])
    .map((m) => m.replace(/\D/g, ''))
    .filter(luhnValid)
  expect(cardNumbers, `${name}: full card number visible`).toEqual([])
  expect(everything, `${name}: JWT visible`).not.toMatch(/eyJ[\w-]+\.[\w-]+\./)
  for (const secret of [CUSTOMER.password, ADMIN.password]) {
    expect(everything.includes(secret), `${name}: a password is visible`).toBe(false)
  }
  expect(inputs.filter((i) => i.type === 'password' && i.value), `${name}: filled password field`).toEqual([])
  expect(inputs.filter((i) => /cvv|cvc/i.test(i.name)), `${name}: CVV field`).toEqual([])
  expect(text, `${name}: CVV value`).not.toMatch(/\bcvv\b\s*[:=]\s*\d/i)

  await page.mouse.move(0, 0) // no hover highlight in the picture
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage })
}

// Swagger pages: from the top down to the last endpoint (description + every operation,
// without the long schema section underneath).
async function swaggerShot(page, name) {
  await expect(page.locator('.opblock').first()).toBeVisible({ timeout: 30_000 })
  await shot(page, name) // runs the safety checks (overwritten below with the crop)
  const bottom = await page.locator('.opblock').last().evaluate((el) => el.getBoundingClientRect().bottom + window.scrollY)
  const width = page.viewportSize().width
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, clip: { x: 0, y: 0, width, height: Math.ceil(bottom + 32) } })
}

async function login(page, { username, password }) {
  await page.goto('/login')
  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })
}

test.beforeAll(() => {
  const out = execFileSync(PYTHON, [path.join(here, 'seed_screenshot_data.py')], { encoding: 'utf8', env: process.env })
  console.log(out.trim())
})

test('customer screens', async ({ page }) => {
  // 1. Register (details filled in, password fields left empty)
  await page.goto('/register')
  await page.getByLabel('First name').fill('Arjun')
  await page.getByLabel('Last name').fill('Mehta')
  await page.getByLabel('Username').fill('arjun_m')
  await page.getByLabel('Email').fill('arjun.mehta@example.com')
  await shot(page, '01-register')

  // 2. Login (username only)
  await page.goto('/login')
  await page.getByLabel('Username or email').fill('priya_sharma')
  await shot(page, '02-login')

  // 3. Dashboard
  await login(page, CUSTOMER)
  await expect(page.getByTestId('stat-cards')).toHaveText('3')
  await expect(page.getByTestId('status-FastAPI')).toHaveText('online')
  await shot(page, '03-dashboard')

  // 4. Add card: a partial number shows brand detection; the full number is never on screen
  await page.getByRole('link', { name: 'Cards', exact: true }).click()
  await expect(page.getByTestId('card-tile')).toHaveCount(3)
  await page.getByRole('button', { name: 'Add card', exact: true }).click()
  await page.getByLabel('Card number').fill('510510')
  await page.getByLabel('Name on card').fill('Priya Sharma')
  await page.getByLabel('Expiry date').fill(`05${String((new Date().getFullYear() + 3) % 100)}`)
  await expect(page.getByTestId('detected-brand')).toHaveText('Mastercard')
  await shot(page, '04-add-card')

  // 5. Saved cards: the card is added through the real API (masked on return)
  await page.getByLabel('Card number').fill(TEST_CARD)
  await page.getByRole('button', { name: 'Save card' }).click()
  await expect(page.getByText('Mastercard ending in 5100 was added.')).toBeVisible()
  await expect(page.getByTestId('card-tile')).toHaveCount(4)
  await shot(page, '05-saved-cards')

  // 6. Make payment
  await page.getByRole('link', { name: 'Pay', exact: true }).click()
  await page.getByRole('radio', { name: 'Visa **** **** **** 1111' }).check()
  await page.getByLabel('Amount').fill('2499')
  await page.getByLabel('Note').fill('Broadband bill - October')
  await shot(page, '06-make-payment')

  // 7. Payment success (processed by FastAPI)
  await page.getByRole('button', { name: /^Pay/ }).click()
  await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'SUCCESS')
  await shot(page, '07-payment-success')

  // 8. Payment failed (simulated insufficient funds above 10,000)
  await page.getByRole('button', { name: 'Make another payment' }).click()
  await page.getByRole('radio', { name: 'Mastercard **** **** **** 4444' }).check()
  await page.getByLabel('Amount').fill('24999')
  await page.getByLabel('Note').fill('Smartphone purchase')
  await page.getByRole('button', { name: /^Pay/ }).click()
  await expect(page.getByTestId('failure-reason')).toHaveText('Insufficient funds.')
  await shot(page, '08-payment-failed')

  // 9. Transaction history
  await page.getByRole('link', { name: 'Transactions', exact: true }).click()
  await expect(page.getByTestId('transaction-row')).toHaveCount(10)
  await shot(page, '09-transaction-history')

  // 10. Transaction filtering
  await page.getByLabel('Status').selectOption('SUCCESS')
  await page.getByLabel('Min amount').fill('1000')
  await page.getByLabel('Max amount').fill('5000')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page).toHaveURL(/status=SUCCESS/)
  await expect(page.getByTestId('pagination-summary')).toContainText('of 6')
  await shot(page, '10-transaction-filtering')
})

test('admin screens', async ({ page }) => {
  await login(page, ADMIN)

  // 11. Admin users
  await page.goto('/admin?tab=users')
  await expect(page.getByTestId('admin-users-row')).toHaveCount(8)
  await shot(page, '11-admin-users')

  // 12. Admin cards
  await page.getByRole('tab', { name: 'Cards' }).click()
  await expect(page.getByTestId('admin-cards-row')).toHaveCount(8)
  await shot(page, '12-admin-cards')

  // 13. Admin transactions
  await page.getByRole('tab', { name: 'Transactions' }).click()
  await expect(page.getByTestId('admin-transactions-row')).toHaveCount(10)
  await shot(page, '13-admin-transactions')

  // 14. Daily payment summary
  await page.getByRole('tab', { name: 'Overview' }).click()
  await expect(Number(await page.getByTestId('stat-total').textContent())).toBeGreaterThan(0)
  await shot(page, '14-daily-payment-summary')
})

test('API documentation', async ({ page }) => {
  // 15. FastAPI Swagger (top of the page: description, auth guide, endpoints)
  await page.goto(`${FASTAPI}/docs`)
  await swaggerShot(page, '15-fastapi-swagger')

  // 16. Django API documentation
  await page.goto(`${DJANGO}/api/docs/`)
  await swaggerShot(page, '16-django-api-docs')
})
