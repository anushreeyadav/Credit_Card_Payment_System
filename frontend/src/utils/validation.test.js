import { describe, expect, it } from 'vitest'

import { validateLogin, validateRegistration } from './validation.js'

describe('validateRegistration', () => {
  const ok = { username: 'priya', email: 'priya@example.com', password: 'Str0ng-Pass!', password_confirm: 'Str0ng-Pass!' }
  const errorsFor = (overrides) => validateRegistration({ ...ok, ...overrides })

  it('accepts valid input', () => expect(errorsFor({})).toEqual({}))

  it.each([
    [{ username: ' ' }, 'username', 'Username is required.'],
    [{ username: 'a'.repeat(151) }, 'username', 'Username must be 150 characters or fewer.'],
    [{ username: 'bad name!' }, 'username', 'Use only letters, numbers and @ . + - _'],
    [{ email: '' }, 'email', 'Email is required.'],
    [{ email: 'not-an-email' }, 'email', 'Enter a valid email address.'],
    [{ password: '', password_confirm: '' }, 'password', 'Password is required.'],
    [{ password: 'Ab1!', password_confirm: 'Ab1!' }, 'password', 'Password must be at least 8 characters.'],
    [{ password: '12345678', password_confirm: '12345678' }, 'password', 'Password cannot be entirely numeric.'],
    [{ password_confirm: '' }, 'password_confirm', 'Please confirm your password.'],
    [{ password_confirm: 'Different-1' }, 'password_confirm', 'Passwords do not match.'],
  ])('%j -> %s error', (overrides, field, message) => expect(errorsFor(overrides)[field]).toBe(message))

  it('allows Django username characters', () => expect(errorsFor({ username: 'a.b+c-d_e@f' })).toEqual({}))
})

describe('validateLogin', () => {
  it('requires both fields', () => {
    expect(validateLogin({ username: ' ', password: '' })).toEqual({
      username: 'Enter your username or email.',
      password: 'Enter your password.',
    })
    expect(validateLogin({ username: 'priya', password: 'x' })).toEqual({})
  })
})
