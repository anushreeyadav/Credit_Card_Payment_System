import { expect, test } from '@playwright/test'

import {
  apiAddCard,
  apiLogin,
  apiPay,
  guardConsoleForTokens,
  PASSWORD,
  registerAndLogin,
  SCREENSHOTS,
} from './helpers.js'

guardConsoleForTokens()

const ADMIN_PASSWORD = process.env.E2E_STAFF_PASSWORD
const DJANGO = 'http://127.0.0.1:8000'

async function loginAs(page, username, password = ADMIN_PASSWORD) {
  await page.goto('/login')
  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })
}

async function openTab(page, name) {
  await page.getByRole('tab', { name }).click()
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true')
}

async function search(page, text) {
  await page.getByLabel('Search').fill(text)
  await page.getByRole('button', { name: 'Apply' }).click()
}

// A customer with a card and three payments (success, success, failed), via the real APIs.
async function seedCustomer(request, browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const user = await registerAndLogin(page)
  await context.close()
  const token = await apiLogin(request, user.username)
  const cardId = await apiAddCard(request, token)
  const payments = [
    await apiPay(request, token, cardId, '250.00'),
    await apiPay(request, token, cardId, '100.50'),
    await apiPay(request, token, cardId, '15000.00'),
  ]
  return { user, payments }
}

const tileValue = async (page, id) => Number(await page.getByTestId(id).textContent())

test.describe('access control', () => {
  test('customers cannot see the dashboard or call the admin API', async ({ page, request }) => {
    const user = await registerAndLogin(page)
    await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0)
    await page.goto('/admin')
    await expect(page.getByText('Admin access required.', { exact: false })).toBeVisible()
    await expect(page.getByRole('tablist')).toHaveCount(0)

    const token = await apiLogin(request, user.username)
    for (const path of ['summary', 'users', 'cards', 'transactions', 'logs']) {
      const response = await request.get(`${DJANGO}/api/admin/${path}/`, { headers: { Authorization: `Bearer ${token}` } })
      expect(response.status(), path).toBe(403)
    }
    expect((await request.get(`${DJANGO}/api/admin/summary/`)).status()).toBe(401)
  })

  test('staff without permissions see no data', async ({ page }) => {
    await loginAs(page, 'e2e_staff')
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible()
    for (const tab of ['Overview', 'Users', 'Cards', 'Transactions', 'Admin logs']) {
      await openTab(page, tab)
      await expect(page.getByText('You do not have permission to view this section.')).toBeVisible()
    }
  })
})

test('daily statistics update with new payments', async ({ page, request, browser }) => {
  await loginAs(page, 'e2e_admin')
  await page.getByRole('link', { name: 'Admin' }).click()
  await expect(page.getByTestId('stat-total')).toBeVisible()
  const before = {
    total: await tileValue(page, 'stat-total'),
    success: await tileValue(page, 'stat-success'),
    failed: await tileValue(page, 'stat-failed'),
    pending: await tileValue(page, 'stat-pending'),
  }

  await seedCustomer(request, browser)
  await page.reload()

  await expect(page.getByTestId('stat-total')).toHaveText(String(before.total + 3))
  await expect(page.getByTestId('stat-success')).toHaveText(String(before.success + 2))
  await expect(page.getByTestId('stat-failed')).toHaveText(String(before.failed + 1))
  await expect(page.getByTestId('stat-pending')).toHaveText(String(before.pending))
  await expect(page.getByTestId('stat-rate')).toHaveText(/%$/)
  await expect(page.getByTestId('amount-INR')).toHaveText(/^₹[\d,]+\.\d{2}$/)
  await expect(page.getByTestId('last-7-days').getByRole('row')).toHaveCount(8) // header + 7 days
  await page.screenshot({ path: `${SCREENSHOTS}/admin-overview.png`, fullPage: true })

  // Previous day has none of today's payments.
  await page.getByRole('button', { name: '← Previous day' }).click()
  await expect(page.getByTestId('stat-total')).toHaveText('0')
  await expect(page.getByText('No successful payments on this day.')).toBeVisible()
  await page.getByRole('button', { name: 'Today' }).click()
  await expect(page.getByTestId('stat-total')).toHaveText(String(before.total + 3))
})

test('users, cards, transactions and admin logs views', async ({ page, request, browser }) => {
  const { user, payments } = await seedCustomer(request, browser)
  await loginAs(page, 'e2e_admin')
  await page.goto('/admin?tab=users')

  // Users: search, then deactivate with confirmation.
  await search(page, user.email)
  const userRows = page.getByTestId('admin-users-row')
  await expect(userRows).toHaveCount(1)
  await expect(userRows).toContainText(user.username)
  await expect(userRows).toContainText('Customer')
  await expect(userRows).toContainText('Active')
  await page.screenshot({ path: `${SCREENSHOTS}/admin-users.png`, fullPage: true })

  await page.getByRole('button', { name: `Deactivate ${user.username}` }).click()
  const dialog = page.getByRole('dialog', { name: 'Deactivate this account?' })
  await dialog.getByRole('button', { name: 'Deactivate' }).click()
  await expect(page.getByText(`${user.username} was deactivated and signed out.`)).toBeVisible()
  await expect(userRows).toContainText('Inactive')

  // The deactivated user can no longer log in.
  const login = await request.post(`${DJANGO}/api/auth/login/`, { data: { username: user.username, password: PASSWORD } })
  expect(login.status()).toBe(401)

  await page.getByRole('button', { name: `Activate ${user.username}` }).click()
  await page.getByRole('dialog', { name: 'Reactivate this account?' }).getByRole('button', { name: 'Activate' }).click()
  await expect(userRows).toContainText('Active')
  expect((await request.post(`${DJANGO}/api/auth/login/`, { data: { username: user.username, password: PASSWORD } })).status()).toBe(200)

  // Cards: masked only.
  await openTab(page, 'Cards')
  await search(page, user.username)
  await expect(page.getByTestId('admin-cards-row')).toHaveCount(1)
  await expect(page.getByTestId('admin-cards-row')).toContainText('**** **** **** 1111')

  // Transactions: search by reference, filter by status.
  await openTab(page, 'Transactions')
  await search(page, payments[2].reference)
  const txRows = page.getByTestId('admin-transactions-row')
  await expect(txRows).toHaveCount(1)
  await expect(txRows).toContainText('₹15,000.00')
  await expect(txRows).toContainText('Insufficient funds.')
  await search(page, user.username)
  await page.getByLabel('Status').selectOption('SUCCESS')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(txRows).toHaveCount(2)
  await page.screenshot({ path: `${SCREENSHOTS}/admin-transactions.png`, fullPage: true })

  // Admin logs: the deactivation above was recorded, with field names only.
  await openTab(page, 'Admin logs')
  await page.getByLabel('Action').selectOption('user_updated')
  await search(page, user.username)
  const logRows = page.getByTestId('admin-logs-row')
  await expect(logRows).toHaveCount(2) // deactivated + reactivated
  await expect(logRows.first()).toContainText('User updated')
  await expect(logRows.first()).toContainText('e2e_admin')
  await expect(logRows.first()).toContainText('changed_fields')
  await page.screenshot({ path: `${SCREENSHOTS}/admin-logs.png`, fullPage: true })

  // Nothing sensitive anywhere in the dashboard.
  for (const tab of ['Overview', 'Users', 'Cards', 'Transactions', 'Admin logs']) {
    await openTab(page, tab)
    await page.waitForLoadState('networkidle')
    const html = (await page.content()).toLowerCase()
    expect(html).not.toContain('4111111111111111')
    expect(html).not.toContain('pbkdf2')
    expect(html).not.toContain('cvv')
    expect(html).not.toContain(PASSWORD.toLowerCase())
  }
})

test('an admin cannot deactivate themselves', async ({ page }) => {
  await loginAs(page, 'e2e_admin')
  await page.goto('/admin?tab=users')
  await search(page, 'e2e_admin')
  // The previous (unfiltered) page stays visible while the search loads; wait for the result.
  await expect(page.getByTestId('admin-users-row')).toHaveCount(1)
  await expect(page.getByTestId('admin-users-row')).toContainText('You')
  await expect(page.getByRole('button', { name: 'Deactivate e2e_admin' })).toHaveCount(0)
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('dashboard fits a phone screen', async ({ page }) => {
    await loginAs(page, 'e2e_admin')
    await page.goto('/admin')
    await expect(page.getByTestId('stat-total')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
    await page.screenshot({ path: `${SCREENSHOTS}/admin-mobile.png`, fullPage: true })

    await openTab(page, 'Transactions')
    await expect(page.getByTestId('admin-transactions-row').first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  })
})

test('admin search refuses full card numbers', async ({ page }) => {
  await loginAs(page, 'e2e_admin')
  await page.goto('/admin?tab=cards')
  const searched = []
  page.on('request', (r) => r.url().includes('/api/admin/cards/') && searched.push(r.url()))

  await search(page, '4111111111111111')

  await expect(page.getByRole('alert')).toHaveText('Do not search with a full card number. Use the last 4 digits instead.')
  expect(searched.filter((url) => url.includes('4111111111111111'))).toEqual([])

  await search(page, '1111') // last 4 digits are fine
  await expect(page.getByRole('alert')).toHaveCount(0)
})
