import { describe, expect, it } from 'vitest'

import { formatAmount, formatDateTime } from './format.js'

describe('formatAmount', () => {
  it('formats decimal strings from the API in the Indian style', () => {
    expect(formatAmount('250.00')).toBe('₹250.00')
    expect(formatAmount('1500000.5', 'INR')).toBe('₹15,00,000.50')
  })
  it('supports other currencies', () => {
    expect(formatAmount('40', 'USD')).toBe('$40.00')
    expect(formatAmount('10', 'EUR')).toMatch(/€10\.00/)
  })
})

describe('formatDateTime', () => {
  it('produces a readable date and time', () => {
    const text = formatDateTime('2026-09-29T06:06:02Z')
    expect(text).toMatch(/2026/)
    expect(text).toMatch(/Sept?/)
  })
})
