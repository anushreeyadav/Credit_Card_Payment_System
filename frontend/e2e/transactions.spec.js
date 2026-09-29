import { expect, test } from '@playwright/test'

import {
  apiAddCard,
  apiLogin,
  apiPay,
  guardConsoleForTokens,
  registerAndLogin,
  SCREENSHOTS,
} from './helpers.js'

guardConsoleForTokens()

const TODAY = new Date().toISOString().slice(0, 10) // UTC, matching the server
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
const REFERENCE = /^PAY-[0-9A-F]{24}$/

// Creates payments for a user through the real Django + FastAPI APIs.
// Access tokens are short-lived in e2e, so log in again every few payments.
async function seedPayments(request, username, amounts, cardNumber) {
  let token = await apiLogin(request, username)
  const cardId = await apiAddCard(request, token, cardNumber)
  const payments = []
  for (const [i, amount] of amounts.entries()) {
    if (i && i % 5 === 0) token = await apiLogin(request, username)
    payments.push(await apiPay(request, token, cardId, amount, `Order #${1000 + i}`))
  }
  return payments
}

const rows = (page) => page.getByTestId('transaction-row')

async function openTransactions(page) {
  await page.getByRole('link', { name: 'Transactions', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible()
}

async function applyFilters(page, { status, min, max, from, to } = {}) {
  if (status !== undefined) await page.getByLabel('Status').selectOption(status)
  if (min !== undefined) await page.getByLabel('Min amount').fill(min)
  if (max !== undefined) await page.getByLabel('Max amount').fill(max)
  if (from !== undefined) await page.getByLabel('From date').fill(from)
  if (to !== undefined) await page.getByLabel('To date').fill(to)
  await page.getByRole('button', { name: 'Apply filters' }).click()
}

test('empty state for a new user', async ({ page }) => {
  await registerAndLogin(page)
  await openTransactions(page)

  await expect(page.getByTestId('transactions-empty')).toContainText('No transactions yet')
  await page.getByRole('link', { name: 'Make a payment' }).click()
  await expect(page).toHaveURL(/\/payment$/)
})

test('lists transactions with ID, amount, masked card, status and date', async ({ page, request }) => {
  const user = await registerAndLogin(page)
  const [ok, failed] = await seedPayments(request, user.username, ['250.00', '15000.00', '99.00'])
  await openTransactions(page)

  await expect(rows(page)).toHaveCount(3)
  // Newest first.
  await expect(page.getByTestId('tx-amount')).toHaveText(['₹99.00', '₹15,000.00', '₹250.00'])
  for (const ref of await page.getByTestId('tx-reference').allTextContents()) expect(ref).toMatch(REFERENCE)
  await expect(page.getByTestId('tx-card')).toHaveText(Array(3).fill('**** **** **** 1111'))

  const failedRow = rows(page).filter({ hasText: failed.reference })
  await expect(failedRow.getByTestId('payment-status')).toHaveAttribute('data-status', 'FAILED')
  await expect(failedRow).toContainText('Insufficient funds.')
  const okRow = rows(page).filter({ hasText: ok.reference })
  await expect(okRow.getByTestId('payment-status')).toHaveAttribute('data-status', 'SUCCESS')
  await expect(okRow).toContainText(/\d{4}/) // date/time column
  await expect(page.getByTestId('pagination-summary')).toHaveText('Showing 1–3 of 3')

  // No sensitive data in the page.
  const html = await page.content()
  expect(html).not.toContain('4111111111111111')
  expect(html.toLowerCase()).not.toContain('cvv')
  await page.screenshot({ path: `${SCREENSHOTS}/transactions.png`, fullPage: true })
})

test('status, amount and date filters (and they survive a reload)', async ({ page, request }) => {
  const user = await registerAndLogin(page)
  await seedPayments(request, user.username, ['50.00', '250.00', '15000.00', '800.00', '12000.00'])
  await openTransactions(page)
  await expect(rows(page)).toHaveCount(5)

  // Status
  await applyFilters(page, { status: 'FAILED' })
  await expect(page).toHaveURL(/status=FAILED/)
  await expect(page.getByTestId('tx-amount')).toHaveText(['₹12,000.00', '₹15,000.00'])
  await page.reload()
  await expect(page.getByLabel('Status')).toHaveValue('FAILED')
  await expect(rows(page)).toHaveCount(2)

  // Amount (status cleared)
  await applyFilters(page, { status: '', min: '100', max: '1000' })
  await expect(page.getByTestId('tx-amount')).toHaveText(['₹800.00', '₹250.00'])

  // Date: today includes everything; up to yesterday shows the filtered empty state.
  await applyFilters(page, { min: '', max: '', from: TODAY, to: TODAY })
  await expect(rows(page)).toHaveCount(5)
  await applyFilters(page, { from: '', to: YESTERDAY })
  await expect(page.getByTestId('transactions-empty')).toContainText('No transactions match your filters')

  // Combined
  await page.getByTestId('transactions-empty').getByRole('button', { name: 'Clear filters' }).click()
  await expect(rows(page)).toHaveCount(5)
  await applyFilters(page, { status: 'SUCCESS', min: '100', from: TODAY })
  await expect(page.getByTestId('tx-amount')).toHaveText(['₹800.00', '₹250.00'])
  await page.screenshot({ path: `${SCREENSHOTS}/transactions-filtered.png`, fullPage: true })

  // Clear filters resets everything.
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page).toHaveURL(/\/transactions$/)
  await expect(rows(page)).toHaveCount(5)
})

test('invalid filters are rejected', async ({ page }) => {
  await registerAndLogin(page)
  await openTransactions(page)

  await applyFilters(page, { min: '500', max: '100' })
  await expect(page.getByText('Minimum cannot be more than maximum.')).toBeVisible()

  await applyFilters(page, { min: '', max: '', from: TODAY, to: YESTERDAY })
  await expect(page.getByText('Start date cannot be after end date.')).toBeVisible()
  await expect(page).toHaveURL(/\/transactions$/) // nothing applied

  // A hand-edited URL is validated by the server.
  await page.goto('/transactions?status=DONE')
  await expect(page.getByText('Some filters are invalid.')).toBeVisible()
  await expect(page.getByText('Must be one of: PENDING, SUCCESS, FAILED.')).toBeVisible()
})

test('pagination', async ({ page, request }) => {
  const user = await registerAndLogin(page)
  const amounts = Array.from({ length: 23 }, (_, i) => `${i + 1}.00`)
  await seedPayments(request, user.username, amounts)
  await openTransactions(page)

  const summary = page.getByTestId('pagination-summary')
  await expect(summary).toHaveText('Showing 1–10 of 23')
  await expect(rows(page)).toHaveCount(10)
  await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled()
  const page1 = await page.getByTestId('tx-reference').allTextContents()

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(summary).toHaveText('Showing 11–20 of 23')
  await expect(page).toHaveURL(/page=2/)
  const page2 = await page.getByTestId('tx-reference').allTextContents()
  expect(page2.filter((ref) => page1.includes(ref))).toEqual([]) // no overlap

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(summary).toHaveText('Showing 21–23 of 23')
  await expect(rows(page)).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
  await expect(page.getByTestId('tx-amount')).toHaveText(['₹3.00', '₹2.00', '₹1.00'])

  // Back button returns to page 2.
  await page.goBack()
  await expect(summary).toHaveText('Showing 11–20 of 23')

  // Page size
  await page.getByLabel('Per page').selectOption('25')
  await expect(summary).toHaveText('Showing 1–23 of 23')
  await expect(rows(page)).toHaveCount(23)

  // Filters reset to page 1 and paginate the filtered set.
  await page.getByLabel('Per page').selectOption('10')
  await page.getByRole('button', { name: 'Next' }).click()
  await applyFilters(page, { min: '5', max: '20' })
  await expect(summary).toHaveText('Showing 1–10 of 16')
  await expect(page).not.toHaveURL(/page=2/)

  // A URL past the last page falls back to page 1.
  await page.goto('/transactions?page=99')
  await expect(summary).toHaveText('Showing 1–10 of 23')
})

test('users only see their own transactions', async ({ page, browser, request }) => {
  const alice = await registerAndLogin(page)
  const [alicePayment] = await seedPayments(request, alice.username, ['321.00'])

  const bobContext = await browser.newContext()
  const bobPage = await bobContext.newPage()
  const bob = await registerAndLogin(bobPage)
  await seedPayments(request, bob.username, ['654.00'], '5555555555554444')
  await openTransactions(bobPage)

  await expect(rows(bobPage)).toHaveCount(1)
  await expect(bobPage.getByTestId('tx-amount')).toHaveText('₹654.00')
  await expect(bobPage.getByText(alicePayment.reference)).toHaveCount(0)
  await bobContext.close()

  await openTransactions(page)
  await expect(rows(page)).toHaveCount(1)
  await expect(page.getByTestId('tx-amount')).toHaveText('₹321.00')
})

test('loading and error states', async ({ page }) => {
  await registerAndLogin(page)

  let apiDown = true
  await page.route('**/api/transactions/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800))
    if (apiDown) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
    return route.continue()
  })
  await openTransactions(page)

  await expect(page.getByLabel('Loading transactions')).toBeVisible()
  await expect(page.getByText('The server had a problem. Please try again shortly.')).toBeVisible()

  apiDown = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByTestId('transactions-empty')).toBeVisible()
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('transactions fit a phone screen', async ({ page, request }) => {
    const user = await registerAndLogin(page)
    await seedPayments(request, user.username, ['250.00', '15000.00'])
    await openTransactions(page)

    await expect(page.getByTestId('transactions-cards').getByRole('listitem')).toHaveCount(2)
    await expect(page.getByTestId('transactions-table')).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
    await page.screenshot({ path: `${SCREENSHOTS}/transactions-mobile.png`, fullPage: true })
  })
})
