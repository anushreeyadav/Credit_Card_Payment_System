import { describe, expect, it } from 'vitest'

import { fieldErrors, generalMessage } from './errors.js'

describe('fieldErrors', () => {
  it('reads Django (DRF) field errors', () => {
    const error = { data: { email: ['Taken.', 'Also bad.'], password: 'Too short.', detail: 'x', code: 'y' } }
    expect(fieldErrors(error)).toEqual({ email: 'Taken. Also bad.', password: 'Too short.' })
  })

  it('reads FastAPI 422 errors (first message per field)', () => {
    const error = {
      data: {
        detail: [
          { loc: ['body', 'amount'], msg: 'Must be > 0' },
          { loc: ['body', 'amount'], msg: 'second' },
          { loc: ['body', 'card_id'], msg: 'Required' },
          { loc: [], msg: 'no field' },
        ],
      },
    }
    expect(fieldErrors(error)).toEqual({ amount: 'Must be > 0', card_id: 'Required' })
  })

  it('returns nothing for non-field errors', () => {
    expect(fieldErrors(null)).toEqual({})
    expect(fieldErrors({ data: null })).toEqual({})
    expect(fieldErrors({ data: ['a'] })).toEqual({})
    expect(fieldErrors({ data: { detail: 'Not found.' } })).toEqual({})
    expect(fieldErrors({ data: { email: [] } })).toEqual({})
  })
})

describe('generalMessage', () => {
  it.each([
    [{ status: 0 }, 'Cannot reach the server. Check that the backend is running.'],
    [{ status: 429 }, 'Too many attempts. Please wait a minute and try again.'],
    [{ status: 500 }, 'The server had a problem. Please try again shortly.'],
    [{ status: 503 }, 'The server had a problem. Please try again shortly.'],
    [{ status: 400, data: { non_field_errors: ['A', 'B'] } }, 'A B'],
    [{ status: 404, data: { detail: 'Card not found.' } }, 'Card not found.'],
    [{ status: 400, data: { email: ['x'] } }, 'Something went wrong. Please try again.'],
  ])('%j', (error, message) => expect(generalMessage(error)).toBe(message))

  it('uses the caller fallback and handles no error', () => {
    expect(generalMessage({ status: 418 }, 'Custom.')).toBe('Custom.')
    expect(generalMessage(null)).toBeNull()
  })
})
