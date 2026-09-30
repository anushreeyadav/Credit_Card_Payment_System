import { expect, test } from '@playwright/test'

import { guardConsoleForTokens, registerAndLogin, SCREENSHOTS } from './helpers.js'

guardConsoleForTokens()

// Public test card numbers - never real cards.
const VISA = '4111111111111111'
const MASTERCARD = '5555555555554444'
const AMEX = '378282246310005'
const YY = String((new Date().getFullYear() + 2) % 100).padStart(2, '0')

async function openCards(page) {
  await registerAndLogin(page)
  await page.getByRole('link', { name: 'My Cards', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Saved cards' })).toBeVisible()
}

async function fillCard(page, { number = VISA, name = 'Priya Sharma', expiry = `12${YY}` } = {}) {
  await page.getByLabel('Card number').fill(number)
  await page.getByLabel('Name on card').fill(name)
  await page.getByLabel('Expiry date').fill(expiry)
}

async function addCard(page, card) {
  await expect(page.getByLabel('Loading cards')).toHaveCount(0)
  const addButton = page.getByRole('button', { name: 'Add card', exact: true })
  if (await addButton.isVisible()) await addButton.click()
  await fillCard(page, card)
  await page.getByRole('button', { name: 'Save card' }).click()
}

const tiles = (page) => page.getByTestId('card-tile')

// Full number must never be rendered, stored in the browser, or left in the form.
async function expectNoFullNumber(page, number) {
  const spaced = number.replace(/(\d{4})(?=\d)/g, '$1 ')
  const html = await page.content()
  expect(html).not.toContain(number)
  expect(html).not.toContain(spaced)
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
  expect(storage).not.toContain(number)
}

test('add, refresh, delete: the full card lifecycle', async ({ page }) => {
  await openCards(page)

  // Empty state shows the form straight away.
  await expect(page.getByText('You have no saved cards yet.')).toBeVisible()

  // 1. Add card - number is formatted and brand detected while typing.
  // The screenshot is taken with a partial number: full card numbers must
  // never appear in screenshots, even public test numbers.
  await fillCard(page, { number: '411111' })
  await expect(page.getByTestId('detected-brand')).toHaveText('Visa')
  await page.screenshot({ path: `${SCREENSHOTS}/cards-add-form.png`, fullPage: true })
  await page.getByLabel('Card number').fill(VISA)
  await expect(page.getByLabel('Card number')).toHaveValue('4111 1111 1111 1111')
  await expect(page.getByLabel('Expiry date')).toHaveValue(`12/${YY}`)
  await page.getByRole('button', { name: 'Save card' }).click()

  await expect(page.getByRole('status').filter({ hasText: 'Visa ending in 1111 was added.' })).toBeVisible()
  await expect(tiles(page)).toHaveCount(1)
  await expect(page.getByTestId('card-masked-number')).toHaveText('**** **** **** 1111')
  await expect(tiles(page).first()).toContainText('Priya Sharma')
  await expect(tiles(page).first()).toContainText(`12/${YY}`)
  await expect(page.getByLabel('Card number')).toHaveCount(0) // form closed and cleared
  await expectNoFullNumber(page, VISA)

  // A second card, via the "Add card" button.
  await addCard(page, { number: MASTERCARD, name: 'Priya S Sharma', expiry: `03${YY}` })
  await expect(tiles(page)).toHaveCount(2)
  await page.screenshot({ path: `${SCREENSHOTS}/cards-saved.png`, fullPage: true })

  // 2-3. Refresh: saved cards remain.
  await page.reload()
  await expect(tiles(page)).toHaveCount(2)
  await expect(page.getByTestId('card-masked-number')).toHaveText(['**** **** **** 4444', '**** **** **** 1111'])
  await expectNoFullNumber(page, VISA)
  await expectNoFullNumber(page, MASTERCARD)

  // Delete confirmation: cancelling keeps the card.
  await page.getByRole('button', { name: 'Delete Visa ending in 1111' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this card?' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Visa **** **** **** 1111')
  await page.screenshot({ path: `${SCREENSHOTS}/cards-delete-confirm.png` })
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(tiles(page)).toHaveCount(2)

  // Escape also cancels.
  await page.getByRole('button', { name: 'Delete Visa ending in 1111' }).click()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // 4. Delete card.
  await page.getByRole('button', { name: 'Delete Visa ending in 1111' }).click()
  await dialog.getByRole('button', { name: 'Delete card' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Visa ending in 1111 was deleted.' })).toBeVisible()

  // 5. It disappears - and stays gone after a refresh.
  await expect(tiles(page)).toHaveCount(1)
  await expect(page.getByTestId('card-masked-number')).toHaveText('**** **** **** 4444')
  await page.reload()
  await expect(tiles(page)).toHaveCount(1)
  await expect(page.getByText('ending in 1111')).toHaveCount(0)
})

test('Amex numbers are grouped 4-6-5', async ({ page }) => {
  await openCards(page)
  await page.getByLabel('Card number').fill(AMEX)
  await expect(page.getByLabel('Card number')).toHaveValue('3782 822463 10005')
  await expect(page.getByTestId('detected-brand')).toHaveText('American Express')
})

test('validation messages', async ({ page }) => {
  await openCards(page)

  await page.getByRole('button', { name: 'Save card' }).click()
  await expect(page.getByText('Enter the card number.')).toBeVisible()
  await expect(page.getByText('Enter the name on the card.')).toBeVisible()
  await expect(page.getByText('Enter the expiry date.')).toBeVisible()

  const cases = [
    [{ number: '4111111111111112' }, 'This card number is not valid. Check for typos.'],
    [{ number: '9111111111111115' }, 'This card type is not supported.'],
    [{ number: '411111' }, 'Card number must be 13 to 19 digits.'],
    [{ expiry: '0120' }, 'This card has expired.'],
    [{ expiry: '13' }, 'Use MM/YY, e.g. 08/28.'],
    [{ name: 'Priya <b>' }, 'Use letters, spaces, dots, apostrophes and hyphens only.'],
  ]
  for (const [card, message] of cases) {
    await fillCard(page, card)
    await page.getByRole('button', { name: 'Save card' }).click()
    await expect(page.getByText(message)).toBeVisible()
  }
  await expect(tiles(page)).toHaveCount(0)
})

test('loading state, load error and retry', async ({ page }) => {
  await registerAndLogin(page)

  // Every load fails until the API "recovers". (Failing only the first request
  // would be flaky: React StrictMode starts and cancels an extra request in dev.)
  let apiDown = true
  await page.route('**/api/cards/', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await new Promise((resolve) => setTimeout(resolve, 800)) // slow API
    if (apiDown) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"boom"}' })
    return route.continue()
  })

  await page.getByRole('link', { name: 'My Cards', exact: true }).click()
  await expect(page.getByLabel('Loading cards')).toBeVisible()
  await expect(page.getByText('The server had a problem. Please try again shortly.')).toBeVisible()

  apiDown = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByLabel('Loading cards')).toBeVisible()
  await expect(page.getByText('You have no saved cards yet.')).toBeVisible()
})

test('API errors when adding a card are shown', async ({ page }) => {
  await openCards(page)

  // Server-side field error.
  await page.route('**/api/cards/', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 400, contentType: 'application/json', body: '{"card_number":["Card number is invalid."]}' })
      : route.continue(),
  )
  await fillCard(page)
  await page.getByRole('button', { name: 'Save card' }).click()
  await expect(page.getByText('Please check the card details.')).toBeVisible()
  await expect(page.getByText('Card number is invalid.')).toBeVisible()

  // Server down.
  await page.unrouteAll()
  await page.route('**/api/cards/', (route) =>
    route.request().method() === 'POST' ? route.abort('connectionrefused') : route.continue(),
  )
  await page.getByRole('button', { name: 'Save card' }).click()
  await expect(page.getByText('Cannot reach the server. Check that the backend is running.')).toBeVisible()
  await expect(tiles(page)).toHaveCount(0)
})

test('a failed delete keeps the card and shows the error', async ({ page }) => {
  await openCards(page)
  await addCard(page)
  await expect(tiles(page)).toHaveCount(1)

  await page.route('**/api/cards/*/', (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
      : route.continue(),
  )
  await page.getByRole('button', { name: 'Delete Visa ending in 1111' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this card?' })
  await dialog.getByRole('button', { name: 'Delete card' }).click()

  await expect(dialog.getByRole('alert')).toHaveText('The server had a problem. Please try again shortly.')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(tiles(page)).toHaveCount(1)
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('cards page fits a phone screen', async ({ page }) => {
    await openCards(page)
    await addCard(page)
    await expect(tiles(page)).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
    await page.screenshot({ path: `${SCREENSHOTS}/cards-mobile.png`, fullPage: true })
  })
})
