import { expect, test } from '@playwright/test'

import { ACCESS_TOKEN_SECONDS } from '../playwright.config.js'
import {
  fillRegister,
  guardConsoleForTokens,
  newUser,
  PASSWORD,
  registerAndLogin,
  registerUser,
  SCREENSHOTS,
} from './helpers.js'

guardConsoleForTokens()

test.describe('protected routes', () => {
  for (const route of ['/dashboard', '/cards', '/payment', '/transactions', '/admin']) {
    test(`${route} redirects to /login when signed out`, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveURL(/\/login$/)
      await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    })
  }
})

test.describe('registration', () => {
  test('successful registration goes to login with username prefilled', async ({ page }) => {
    const user = newUser()
    await page.goto('/register')
    await page.screenshot({ path: `${SCREENSHOTS}/auth-register.png`, fullPage: true })

    await fillRegister(page, user)

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText('Account created. Log in to continue.')).toBeVisible()
    await expect(page.getByLabel('Username or email')).toHaveValue(user.username)
  })

  test('client-side validation errors', async ({ page }) => {
    await page.goto('/register')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByText('Username is required.')).toBeVisible()
    await expect(page.getByText('Email is required.')).toBeVisible()
    await expect(page.getByText('Password is required.')).toBeVisible()

    await page.getByLabel('Email').fill('not-an-email')
    await page.getByLabel('Password', { exact: true }).fill('Short1!')
    await page.getByLabel('Confirm password').fill('Different1!')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Enter a valid email address.')).toBeVisible()
    await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible()
    await expect(page.getByText('Passwords do not match.')).toBeVisible()
    await expect(page).toHaveURL(/\/register$/)
  })

  test('server-side password rules are shown', async ({ page }) => {
    await fillRegister(page, newUser(), { password: 'password123' })

    await expect(page.getByText('Please fix the highlighted fields.')).toBeVisible()
    await expect(page.getByText('This password is too common.')).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
  })

  test('duplicate username and email are rejected', async ({ page }) => {
    const user = newUser()
    await fillRegister(page, user)
    await expect(page).toHaveURL(/\/login$/)

    await fillRegister(page, { ...user, username: user.username.toUpperCase() })
    await expect(page.getByText('A user with that username already exists.')).toBeVisible()
    await expect(page.getByText('An account with this email already exists.')).toBeVisible()
    await page.screenshot({ path: `${SCREENSHOTS}/auth-register-errors.png`, fullPage: true })
  })
})

test.describe('login', () => {
  test('invalid credentials show an error', async ({ page }) => {
    await registerUser(page)
    await page.getByLabel('Password', { exact: true }).fill('Wrong-Password-1')
    await page.getByRole('button', { name: 'Log in' }).click()

    await expect(page.getByRole('alert')).toHaveText('Invalid username or password.')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
  })

  test('empty login form shows validation errors', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByText('Enter your username or email.')).toBeVisible()
    await expect(page.getByText('Enter your password.')).toBeVisible()
  })

  test('successful login goes to dashboard; tokens are stored safely', async ({ page, context }) => {
    await page.goto('/login')
    await page.screenshot({ path: `${SCREENSHOTS}/auth-login.png`, fullPage: true })

    const user = await registerAndLogin(page)

    await expect(page.getByTestId('greeting')).toContainText(user.first)
    await expect(page.getByTestId('nav-user')).toHaveText(`${user.first} ${user.last}`)
    await expect(page.getByTestId('stat-cards')).toHaveText('0')
    await expect(page.getByTestId('stat-transactions')).toHaveText('0')
    await page.screenshot({ path: `${SCREENSHOTS}/dashboard.png`, fullPage: true })

    // No token in web storage; the refresh token is an httpOnly cookie.
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
    expect(storage).not.toMatch(/eyJ/)
    const documentCookie = await page.evaluate(() => document.cookie)
    expect(documentCookie).not.toContain('ccps_refresh')
    const refresh = (await context.cookies()).find((c) => c.name === 'ccps_refresh')
    expect(refresh).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/auth/' })
  })

  test('login with email address', async ({ page }) => {
    const user = await registerUser(page)
    await page.getByLabel('Username or email').fill(user.email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('returns to the originally requested page after login', async ({ page }) => {
    const user = await registerUser(page)
    await page.goto('/transactions')
    await expect(page).toHaveURL(/\/login$/)

    await page.getByLabel('Username or email').fill(user.username)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Log in' }).click()

    await expect(page).toHaveURL(/\/transactions$/)
  })

  test('session survives a page reload and signed-in users skip /login', async ({ page }) => {
    await registerAndLogin(page)
    await page.reload()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByTestId('greeting')).toBeVisible()

    await page.goto('/login')
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})

test.describe('logout and session expiry', () => {
  test('logout ends the session', async ({ page, context }) => {
    await registerAndLogin(page)

    await page.getByRole('button', { name: 'Log out' }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText('You have been logged out.')).toBeVisible()
    expect((await context.cookies()).find((c) => c.name === 'ccps_refresh')).toBeUndefined()
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('expired access token is refreshed silently', async ({ page }) => {
    await registerAndLogin(page)
    await page.waitForTimeout((ACCESS_TOKEN_SECONDS + 2) * 1000)

    const refreshed = page.waitForResponse((r) => r.url().endsWith('/api/auth/refresh/') && r.status() === 200)
    await page.getByRole('link', { name: 'Cards', exact: true }).click()
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
    await refreshed

    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByTestId('stat-cards')).toHaveText('0')
  })

  test('expired session sends the user to login', async ({ page, context }) => {
    await registerAndLogin(page)
    await context.clearCookies() // refresh cookie gone -> session cannot be renewed
    await page.waitForTimeout((ACCESS_TOKEN_SECONDS + 2) * 1000)

    // The Cards page loads cards on open; the expired session is detected there.
    await page.getByRole('link', { name: 'Cards', exact: true }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByText('Your session has expired. Please log in again.')).toBeVisible()
  })
})

test.describe('authorisation', () => {
  test('non-staff users are refused the admin page', async ({ page }) => {
    await registerAndLogin(page)
    await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0)
    await page.goto('/admin')
    await expect(page.getByText('Admin access required.', { exact: false })).toBeVisible()
  })

  test('staff users see the admin link', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Username or email').fill('e2e_staff')
    await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_STAFF_PASSWORD)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.getByRole('link', { name: 'Admin' }).click()
    await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible()
  })
})

test.describe('responsive', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('mobile login and dashboard', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
    await page.screenshot({ path: `${SCREENSHOTS}/auth-login-mobile.png`, fullPage: true })

    await registerAndLogin(page)
    const dashOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(dashOverflow).toBe(false)
    await page.screenshot({ path: `${SCREENSHOTS}/dashboard-mobile.png`, fullPage: true })
  })
})
