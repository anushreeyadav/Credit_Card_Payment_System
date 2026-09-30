import { expect, test } from '@playwright/test'

import { ACCESS_TOKEN_SECONDS } from '../playwright.config.js'
import { addCardViaUi, guardConsoleForTokens, registerAndLogin, SCREENSHOTS } from './helpers.js'

guardConsoleForTokens()

const PAY_URL = '**/api/payments/'
const REFERENCE = /^PAY-[0-9A-F]{24}$/

async function openPaymentWithCard(page, card) {
  await registerAndLogin(page)
  await addCardViaUi(page, card)
  await page.getByRole('link', { name: 'Make Payment', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Make a payment' })).toBeVisible()
  await expect(page.getByRole('radio').first()).toBeChecked()
}

async function pay(page, amount) {
  await page.getByLabel('Amount').fill(amount)
  await page.getByRole('button', { name: /^Pay/ }).click()
}

const result = (page) => page.getByTestId('payment-result')
const status = (page) => page.getByTestId('payment-status')

test('no saved card', async ({ page }) => {
  await registerAndLogin(page)
  await page.getByRole('link', { name: 'Make Payment', exact: true }).click()

  await expect(page.getByTestId('no-cards')).toContainText('No saved cards')
  await page.getByRole('link', { name: 'Add a card' }).click()
  await expect(page).toHaveURL(/\/cards\?add=1$/) // opens the add-card form straight away
  await expect(page.getByLabel('Card number')).toBeVisible()
})

test('successful payment shows SUCCESS and a reference ID', async ({ page }) => {
  await openPaymentWithCard(page)

  // Summary reflects the selected card (masked) and amount.
  await expect(page.getByTestId('summary-card')).toHaveText('**** **** **** 1111')
  await page.getByLabel('Amount').fill('250.5')
  await page.getByLabel('Note').fill('Order #1001')
  await expect(page.getByTestId('summary-total')).toHaveText('₹250.50')
  await page.screenshot({ path: `${SCREENSHOTS}/payment-form.png`, fullPage: true })

  // Only card_id, amount, currency and note go to FastAPI - never card number or CVV.
  const requestPromise = page.waitForRequest((r) => r.url().endsWith('/api/payments/') && r.method() === 'POST')
  await page.getByRole('button', { name: 'Pay ₹250.50' }).click()
  const body = (await requestPromise).postDataJSON()
  expect(Object.keys(body).sort()).toEqual(['amount', 'card_id', 'currency', 'description'])
  expect(body).toMatchObject({ amount: '250.50', currency: 'INR', description: 'Order #1001' })

  await expect(result(page)).toContainText('Payment successful')
  await expect(status(page)).toHaveAttribute('data-status', 'SUCCESS')
  await expect(page.getByTestId('payment-amount')).toHaveText('₹250.50')
  await expect(page.getByTestId('payment-reference')).toHaveText(REFERENCE)
  await expect(result(page)).toContainText('**** **** **** 1111')
  await expect(result(page)).toContainText('Order #1001')
  expect(await page.content()).not.toContain('4111111111111111')
  await page.screenshot({ path: `${SCREENSHOTS}/payment-success.png`, fullPage: true })

  // Start again with a clean form.
  await page.getByRole('button', { name: 'Make another payment' }).click()
  await expect(page.getByLabel('Amount')).toHaveValue('')
})

test('failed payment shows FAILED with the reason and reference', async ({ page }) => {
  await openPaymentWithCard(page)

  await pay(page, '15000')

  await expect(result(page)).toContainText('Payment failed')
  await expect(status(page)).toHaveAttribute('data-status', 'FAILED')
  await expect(page.getByTestId('failure-reason')).toHaveText('Insufficient funds.')
  await expect(page.getByTestId('payment-reference')).toHaveText(REFERENCE)
  await page.screenshot({ path: `${SCREENSHOTS}/payment-failed.png`, fullPage: true })

  // "Try again" returns to the form with the amount kept.
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByLabel('Amount')).toHaveValue('15000')
})

test('choosing between several cards', async ({ page }) => {
  await registerAndLogin(page)
  await addCardViaUi(page)
  await addCardViaUi(page, { number: '5555555555554444' })
  await page.goto('/payment')

  await page.getByRole('radio', { name: 'Visa **** **** **** 1111' }).check()
  await expect(page.getByTestId('summary-card')).toHaveText('**** **** **** 1111')
  await pay(page, '99')
  await expect(result(page)).toContainText('**** **** **** 1111')
})

test('PENDING while processing, and a pending result can be re-checked', async ({ page }) => {
  await openPaymentWithCard(page)

  // Slow payment service: the form shows PENDING and blocks double submits.
  await page.route(PAY_URL, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })
  await pay(page, '100')
  await expect(page.getByTestId('pending-indicator')).toContainText('PENDING')
  await expect(page.getByRole('button', { name: 'Processing payment…' })).toBeDisabled()
  await expect(status(page)).toHaveAttribute('data-status', 'SUCCESS')
  await page.unrouteAll()

  // A payment that comes back PENDING can be checked again.
  await page.getByRole('button', { name: 'Make another payment' }).click()
  const pending = {
    reference: 'PAY-0123456789ABCDEF01234567', status: 'PENDING', failure_reason: '', amount: '75.00',
    currency: 'INR', description: '', card_id: 1, card_type: 'visa', masked_card: '**** **** **** 1111',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  await page.route(PAY_URL, (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(pending) }),
  )
  await page.route('**/api/payments/PAY-*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...pending, status: 'SUCCESS' }) }),
  )
  await pay(page, '75')
  await expect(result(page)).toContainText('Payment pending')
  await expect(status(page)).toHaveAttribute('data-status', 'PENDING')
  await expect(page.getByTestId('payment-reference')).toHaveText(pending.reference)
  await page.screenshot({ path: `${SCREENSHOTS}/payment-pending.png`, fullPage: true })

  await page.getByRole('button', { name: 'Check status' }).click()
  await expect(status(page)).toHaveAttribute('data-status', 'SUCCESS')
})

test('invalid amounts are rejected', async ({ page }) => {
  await openPaymentWithCard(page)
  const payButton = page.getByRole('button', { name: /^Pay/ })

  await payButton.click()
  await expect(page.getByText('Enter an amount.')).toBeVisible()

  for (const value of ['0', '0.00', '.']) {
    await page.getByLabel('Amount').fill(value)
    await payButton.click()
    await expect(page.getByText(/Amount must be greater than 0\.|Enter a valid amount/)).toBeVisible()
  }

  await page.getByLabel('Amount').fill('2000000')
  await payButton.click()
  await expect(page.getByText('Amount cannot exceed 10,00,000.')).toBeVisible()

  // Typing is filtered: letters, minus signs and a third decimal are dropped.
  await page.getByLabel('Amount').fill('-12abc.345')
  await expect(page.getByLabel('Amount')).toHaveValue('12.34')

  // Server-side validation errors are shown too.
  await page.route(PAY_URL, (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ detail: [{ loc: ['body', 'amount'], msg: 'Input should be greater than 0', type: 'greater_than' }] }),
    }),
  )
  await payButton.click()
  await expect(page.getByText('Please check the payment details.')).toBeVisible()
  await expect(page.getByText('Input should be greater than 0')).toBeVisible()
  await expect(result(page)).toHaveCount(0)
})

test('network error does not claim success or failure', async ({ page }) => {
  await openPaymentWithCard(page)
  await page.route(PAY_URL, (route) => route.abort('connectionrefused'))

  await pay(page, '50')

  await expect(page.getByText(/could not confirm your payment because of a network problem/)).toBeVisible()
  await expect(result(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pay ₹50.00' })).toBeEnabled()
})

test('payment service error and a card that no longer exists', async ({ page }) => {
  await openPaymentWithCard(page)

  await page.route(PAY_URL, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }))
  await pay(page, '50')
  await expect(page.getByText(/payment service had a problem/)).toBeVisible()

  await page.unrouteAll()
  await page.route(PAY_URL, (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"Card not found."}' }),
  )
  await page.getByRole('button', { name: /^Pay/ }).click()
  await expect(page.getByText('That card is no longer available. Choose another card.')).toBeVisible()
})

test('expired access token is refreshed and the payment still goes through', async ({ page }) => {
  await openPaymentWithCard(page)
  await page.waitForTimeout((ACCESS_TOKEN_SECONDS + 2) * 1000)

  await pay(page, '42')

  await expect(status(page)).toHaveAttribute('data-status', 'SUCCESS')
})

test('unauthorized: an expired session sends the user to login', async ({ page, context }) => {
  await openPaymentWithCard(page)
  await context.clearCookies()
  await page.waitForTimeout((ACCESS_TOKEN_SECONDS + 2) * 1000)

  await pay(page, '42')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('Your session has expired. Please log in again.')).toBeVisible()
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('payment page fits a phone screen', async ({ page }) => {
    await openPaymentWithCard(page)
    await page.getByLabel('Amount').fill('1200')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
    await page.screenshot({ path: `${SCREENSHOTS}/payment-mobile.png`, fullPage: true })
    await page.getByRole('button', { name: /^Pay/ }).click()
    await expect(status(page)).toHaveAttribute('data-status', 'SUCCESS')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  })
})

test('a card number in the note is refused before it is sent', async ({ page }) => {
  await openPaymentWithCard(page)
  let posted = false
  page.on('request', (r) => {
    if (r.url().endsWith('/api/payments/') && r.method() === 'POST') posted = true
  })

  await page.getByLabel('Note').fill('my card 4111 1111 1111 1111')
  await pay(page, '10')

  await expect(page.getByText('Do not put card numbers in the note.')).toBeVisible()
  expect(posted).toBe(false)
})
