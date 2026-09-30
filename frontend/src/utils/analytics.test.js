import { describe, expect, it } from 'vitest'

import {
  amountByCard,
  dailySeries,
  dayKey,
  mainCurrency,
  paidByCurrency,
  periodChange,
  statusCounts,
  successRate,
} from './analytics.js'

const NOW = new Date(2026, 8, 30, 15, 0) // 30 Sep 2026, local time
const at = (daysAgo, hour = 10) => new Date(2026, 8, 30 - daysAgo, hour).toISOString()
const tx = (status, amount, daysAgo, extra = {}) => ({
  status,
  amount: String(amount),
  currency: 'INR',
  created_at: at(daysAgo),
  masked_card: '**** **** **** 1111',
  card_type: 'visa',
  ...extra,
})

const SAMPLE = [
  tx('SUCCESS', 100, 0),
  tx('SUCCESS', 50.5, 0, { masked_card: '**** **** **** 4444', card_type: 'mastercard' }),
  tx('FAILED', 15000, 1),
  tx('PENDING', 20, 2),
  tx('SUCCESS', 10, 9),
  tx('SUCCESS', 7, 3, { currency: 'USD' }),
  tx('REFUNDED', 1, 0), // unknown status: ignored
]

describe('analytics helpers', () => {
  it('dayKey uses the local calendar day', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('counts statuses and ignores unknown ones', () => {
    expect(statusCounts(SAMPLE)).toEqual({ SUCCESS: 4, FAILED: 1, PENDING: 1 })
  })

  it('sums successful amounts per currency only', () => {
    expect(paidByCurrency(SAMPLE)).toEqual({ INR: 160.5, USD: 7 })
  })

  it('picks the most used currency, INR when there is no data', () => {
    expect(mainCurrency(SAMPLE)).toBe('INR')
    expect(mainCurrency([tx('SUCCESS', 1, 0, { currency: 'USD' })])).toBe('USD')
    expect(mainCurrency([])).toBe('INR')
  })

  it('builds a zero-filled daily series ending today', () => {
    const series = dailySeries(SAMPLE, { days: 7, currency: 'INR', now: NOW })
    expect(series).toHaveLength(7)
    expect(series.at(-1)).toMatchObject({ day: '2026-09-30', SUCCESS: 2, FAILED: 0, amount: 150.5 })
    expect(series.at(-2)).toMatchObject({ day: '2026-09-29', FAILED: 1, amount: 0 })
    expect(series.at(-3)).toMatchObject({ PENDING: 1 })
    expect(series.at(-4)).toMatchObject({ SUCCESS: 1, amount: 0 }) // USD not added to INR
    expect(series[0]).toMatchObject({ day: '2026-09-24', SUCCESS: 0 }) // 9 days ago is outside
  })

  it('ranks cards by successful spend', () => {
    expect(amountByCard(SAMPLE, 'INR')).toEqual([
      { card: '**** **** **** 1111', cardType: 'visa', amount: 110, count: 2 },
      { card: '**** **** **** 4444', cardType: 'mastercard', amount: 50.5, count: 1 },
    ])
  })

  it('success rate ignores pending payments', () => {
    expect(successRate({ SUCCESS: 3, FAILED: 1, PENDING: 5 })).toBe(75)
    expect(successRate({ SUCCESS: 0, FAILED: 0, PENDING: 2 })).toBeNull()
  })

  it('compares successful payments with the previous period', () => {
    expect(periodChange(SAMPLE, { days: 7, now: NOW })).toEqual({ current: 3, previous: 1, delta: 2 })
    // Older than both periods, or in the future: not counted.
    const outside = [tx('SUCCESS', 1, 20), tx('SUCCESS', 1, -3)]
    expect(periodChange(outside, { days: 7, now: NOW })).toEqual({ current: 0, previous: 0, delta: 0 })
  })
})
