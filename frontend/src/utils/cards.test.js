import { describe, expect, it } from 'vitest'

import {
  detectBrand,
  digitsOnly,
  formatCardExpiry,
  formatCardNumber,
  formatExpiry,
  isExpired,
  parseExpiry,
  passesLuhn,
  validateCardForm,
} from './cards.js'

const TODAY = new Date(2026, 8, 29) // 29 Sep 2026

describe('detectBrand', () => {
  it.each([
    ['4111111111111111', 'visa'],
    ['4', 'visa'],
    ['5555555555554444', 'mastercard'],
    ['2223003122003222', 'mastercard'],
    ['378282246310005', 'amex'],
    ['341111111111111', 'amex'],
    ['6011111111111117', 'discover'],
    ['6511111111111111', 'discover'],
    ['6441111111111111', 'discover'],
    ['6080000000000000', 'rupay'],
    ['8100000000000000', 'rupay'],
    ['5081111111111111', 'rupay'],
  ])('%s -> %s', (number, brand) => expect(detectBrand(number)).toBe(brand))

  it('returns null for unknown or too-short prefixes', () => {
    expect(detectBrand('9111111111111111')).toBeNull()
    expect(detectBrand('1')).toBeNull()
    expect(detectBrand('')).toBeNull()
  })
})

describe('passesLuhn', () => {
  it('accepts valid numbers', () => {
    for (const n of ['4111111111111111', '5555555555554444', '378282246310005']) expect(passesLuhn(n)).toBe(true)
  })
  it('rejects invalid numbers and empty input', () => {
    expect(passesLuhn('4111111111111112')).toBe(false)
    expect(passesLuhn('')).toBe(false)
  })
})

describe('formatting', () => {
  it('groups numbers in fours, Amex as 4-6-5, and caps at 19 digits', () => {
    expect(formatCardNumber('4111111111111111')).toBe('4111 1111 1111 1111')
    expect(formatCardNumber('4111-1111 11')).toBe('4111 1111 11')
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005')
    expect(formatCardNumber('41111111111111111111111')).toBe('4111 1111 1111 1111 111')
    expect(formatCardNumber('')).toBe('')
  })

  it('formats expiry as MM/YY while typing', () => {
    expect(formatExpiry('1')).toBe('1')
    expect(formatExpiry('5')).toBe('05/')
    expect(formatExpiry('12')).toBe('12/')
    expect(formatExpiry('12/2', '12/')).toBe('12/2')
    expect(formatExpiry('1228')).toBe('12/28')
    expect(formatExpiry('12', '12/')).toBe('12') // deleting the slash
  })

  it('strips non-digits', () => expect(digitsOnly('41-11 aa 11')).toBe('411111'))

  it('parses MM/YY', () => {
    expect(parseExpiry('08/28')).toEqual({ month: 8, year: 2028 })
    expect(parseExpiry(' 12/30 ')).toEqual({ month: 12, year: 2030 })
    expect(parseExpiry('8/28')).toBeNull()
    expect(parseExpiry('garbage')).toBeNull()
  })

  it('formats a saved card expiry', () => {
    expect(formatCardExpiry({ expiry_month: 3, expiry_year: 2028 })).toBe('03/28')
  })
})

describe('validateCardForm', () => {
  const valid = { number: '4111 1111 1111 1111', name: 'Priya Sharma', expiry: '12/28' }
  const errorsFor = (overrides) => validateCardForm({ ...valid, ...overrides }, TODAY)

  it('accepts a valid card', () => expect(errorsFor({})).toEqual({}))

  it.each([
    [{ number: '' }, 'card_number', 'Enter the card number.'],
    [{ number: '411111' }, 'card_number', 'Card number must be 13 to 19 digits.'],
    [{ number: '9111111111111115' }, 'card_number', 'This card type is not supported.'],
    [{ number: '37828224631000' }, 'card_number', 'American Express numbers have 15 digits.'],
    [{ number: '4111111111111112' }, 'card_number', 'This card number is not valid. Check for typos.'],
    [{ name: '   ' }, 'cardholder_name', 'Enter the name on the card.'],
    [{ name: 'Priya <b>' }, 'cardholder_name', 'Use letters, spaces, dots, apostrophes and hyphens only.'],
    [{ expiry: '' }, 'expiry', 'Enter the expiry date.'],
    [{ expiry: '13/28' }, 'expiry', 'Use MM/YY, e.g. 08/28.'],
    [{ expiry: '1/28' }, 'expiry', 'Use MM/YY, e.g. 08/28.'],
    [{ expiry: '08/26' }, 'expiry', 'This card has expired.'],
    [{ expiry: '12/25' }, 'expiry', 'This card has expired.'],
    [{ expiry: '12/99' }, 'expiry', 'Expiry year is too far in the future.'],
  ])('%j -> %s error', (overrides, field, message) => {
    expect(errorsFor(overrides)[field]).toBe(message)
  })

  it('accepts a card expiring this month', () => expect(errorsFor({ expiry: '09/26' })).toEqual({}))

  it('lists brand lengths with "or" when several are allowed', () => {
    expect(errorsFor({ number: '41111111111111' }).card_number).toBe('Visa numbers have 13 or 16 or 19 digits.')
  })
})

describe('isExpired', () => {
  it('is false through the end of the expiry month', () => {
    expect(isExpired({ expiry_month: 9, expiry_year: 2026 }, TODAY)).toBe(false)
    expect(isExpired({ expiry_month: 8, expiry_year: 2026 }, TODAY)).toBe(true)
    expect(isExpired({ expiry_month: 1, expiry_year: 2027 }, TODAY)).toBe(false)
    expect(isExpired({ expiry_month: 12, expiry_year: 2025 }, TODAY)).toBe(true)
  })
})
