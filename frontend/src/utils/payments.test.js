import { describe, expect, it } from 'vitest'

import { looksLikeCardNumber, sanitizeAmountInput, toAmountString, validatePayment } from './payments.js'

describe('sanitizeAmountInput', () => {
  it.each([
    ['250', '250'],
    ['250.5', '250.5'],
    ['250.555', '250.55'],
    ['-12abc.345', '12.34'],
    ['1.2.3', '1.23'],
    ['₹1,200', '1200'],
    ['.', '.'],
    ['', ''],
  ])('%s -> %s', (input, expected) => expect(sanitizeAmountInput(input)).toBe(expected))
})

describe('validatePayment', () => {
  const ok = { cardId: 3, amount: '250.00', description: '' }
  const errorsFor = (overrides) => validatePayment({ ...ok, ...overrides })

  it('accepts a valid payment', () => expect(errorsFor({})).toEqual({}))

  it.each([
    [{ cardId: null }, 'card_id', 'Choose a card to pay with.'],
    [{ amount: '' }, 'amount', 'Enter an amount.'],
    [{ amount: '  ' }, 'amount', 'Enter an amount.'],
    [{ amount: '.' }, 'amount', 'Enter a valid amount, e.g. 250 or 250.50.'],
    [{ amount: '1.234' }, 'amount', 'Enter a valid amount, e.g. 250 or 250.50.'],
    [{ amount: '0' }, 'amount', 'Amount must be greater than 0.'],
    [{ amount: '0.00' }, 'amount', 'Amount must be greater than 0.'],
    [{ amount: '1000000.01' }, 'amount', 'Amount cannot exceed 10,00,000.'],
    [{ description: 'x'.repeat(256) }, 'description', 'Keep the note under 255 characters.'],
    [{ description: 'card 4111 1111 1111 1111' }, 'description', 'Do not put card numbers in the note.'],
  ])('%j -> %s error', (overrides, field, message) => expect(errorsFor(overrides)[field]).toBe(message))

  it('allows the maximum and ordinary notes with numbers', () => {
    expect(errorsFor({ amount: '1000000' })).toEqual({})
    expect(errorsFor({ description: 'Order #1001, ref 12345678' })).toEqual({})
  })
})

describe('looksLikeCardNumber', () => {
  it('spots 13-19 digit runs, with or without separators', () => {
    expect(looksLikeCardNumber('4111111111111111')).toBe(true)
    expect(looksLikeCardNumber('pay 5555-5555-5555-4444 now')).toBe(true)
    expect(looksLikeCardNumber('3782 822463 10005')).toBe(true)
  })
  it('ignores shorter numbers, dates and last-4 searches', () => {
    expect(looksLikeCardNumber('1111')).toBe(false)
    expect(looksLikeCardNumber('Order 12345678')).toBe(false)
    expect(looksLikeCardNumber('2026-09-29')).toBe(false)
    expect(looksLikeCardNumber('')).toBe(false)
  })
})

describe('toAmountString', () => {
  it('always sends two decimals', () => {
    expect(toAmountString('250')).toBe('250.00')
    expect(toAmountString('250.5')).toBe('250.50')
  })
})
