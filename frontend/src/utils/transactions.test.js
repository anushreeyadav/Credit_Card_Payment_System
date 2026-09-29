import { describe, expect, it } from 'vitest'

import { buildQuery, EMPTY_FILTERS, hasActiveFilters, readQuery, validateFilters } from './transactions.js'

describe('URL <-> filters', () => {
  it('reads defaults from an empty URL', () => {
    expect(readQuery(new URLSearchParams())).toEqual({ filters: EMPTY_FILTERS, page: 1, pageSize: 10 })
  })

  it('reads filters, page and page size', () => {
    const q = readQuery(new URLSearchParams('status=FAILED&min_amount=100&date_to=2026-09-29&page=3&page_size=25'))
    expect(q.filters).toEqual({ ...EMPTY_FILTERS, status: 'FAILED', min_amount: '100', date_to: '2026-09-29' })
    expect(q.page).toBe(3)
    expect(q.pageSize).toBe(25)
  })

  it('falls back on bad page values', () => {
    expect(readQuery(new URLSearchParams('page=abc&page_size=7')).page).toBe(1)
    expect(readQuery(new URLSearchParams('page=-4')).page).toBe(1)
    expect(readQuery(new URLSearchParams('page_size=7')).pageSize).toBe(10)
  })

  it('writes only non-default values and round-trips', () => {
    expect(buildQuery({ filters: EMPTY_FILTERS }).toString()).toBe('')
    const params = buildQuery({ filters: { ...EMPTY_FILTERS, status: 'SUCCESS', max_amount: '50' }, page: 2, pageSize: 50 })
    expect(params.toString()).toBe('status=SUCCESS&max_amount=50&page=2&page_size=50')
    expect(readQuery(params)).toEqual({ filters: { ...EMPTY_FILTERS, status: 'SUCCESS', max_amount: '50' }, page: 2, pageSize: 50 })
  })

  it('detects active filters', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, date_from: '2026-01-01' })).toBe(true)
  })
})

describe('validateFilters', () => {
  const errorsFor = (overrides) => validateFilters({ ...EMPTY_FILTERS, ...overrides })

  it('accepts empty and valid filters', () => {
    expect(errorsFor({})).toEqual({})
    expect(errorsFor({ min_amount: '100', max_amount: '100.50', date_from: '2026-01-01', date_to: '2026-01-01' })).toEqual({})
  })

  it('rejects bad amounts and ranges', () => {
    expect(errorsFor({ min_amount: 'abc' }).min_amount).toBe('Enter a valid amount, e.g. 100 or 99.50.')
    expect(errorsFor({ max_amount: '1.234' }).max_amount).toBe('Enter a valid amount, e.g. 100 or 99.50.')
    expect(errorsFor({ min_amount: '500', max_amount: '100' }).min_amount).toBe('Minimum cannot be more than maximum.')
  })

  it('rejects bad dates and ranges', () => {
    expect(errorsFor({ date_from: '01/02/2026' }).date_from).toBe('Use the date picker (YYYY-MM-DD).')
    expect(errorsFor({ date_from: '2026-05-01', date_to: '2026-01-01' }).date_from).toBe('Start date cannot be after end date.')
  })
})
