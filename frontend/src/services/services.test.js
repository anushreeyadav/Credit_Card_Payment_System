import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DJANGO_ADMIN_URL, DJANGO_API_URL, FASTAPI_URL } from './config.js'
import { adminService, authService, cardService, pingDjango, transactionService } from './djangoApi.js'
import { paymentService, pingFastApi } from './paymentApi.js'

// Every service call is checked for: URL, method, token handling, cookies and body.
let calls
beforeEach(() => {
  calls = []
  vi.stubGlobal('fetch', vi.fn((url, init) => {
    calls.push({ url: url.toString(), ...init })
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"status":"ok"}') })
  }))
})
afterEach(() => vi.unstubAllGlobals())

const last = () => calls.at(-1)
const D = DJANGO_API_URL
const F = FASTAPI_URL

describe('config', () => {
  it('reads API URLs from the environment (no trailing slash)', () => {
    expect(D).toBe('http://127.0.0.1:8000')
    expect(F).toBe('http://127.0.0.1:8001')
    expect(DJANGO_ADMIN_URL).toBe('http://127.0.0.1:8000/admin/')
  })

  it('fails loudly when a URL is missing', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_FASTAPI_URL', '')
    await expect(import('./config.js')).rejects.toThrow('Missing VITE_FASTAPI_URL')
    vi.unstubAllEnvs()
  })
})

describe('auth service (Django)', () => {
  it('login/refresh/logout send cookies; register does not', async () => {
    await authService.login('priya', 'secret')
    expect(last()).toMatchObject({ url: `${D}/api/auth/login/`, method: 'POST', credentials: 'include', body: '{"username":"priya","password":"secret"}' })
    await authService.refresh()
    expect(last()).toMatchObject({ url: `${D}/api/auth/refresh/`, method: 'POST', credentials: 'include' })
    await authService.logout()
    expect(last()).toMatchObject({ url: `${D}/api/auth/logout/`, method: 'POST', credentials: 'include' })
    await authService.register({ username: 'priya' })
    expect(last()).toMatchObject({ url: `${D}/api/auth/register/`, method: 'POST', credentials: 'omit' })
    await authService.me('T')
    expect(last()).toMatchObject({ url: `${D}/api/auth/me/`, method: 'GET' })
    expect(last().headers.Authorization).toBe('Bearer T')
  })
})

describe('card and transaction services (Django)', () => {
  it('cards', async () => {
    await cardService.list('T')
    expect(last()).toMatchObject({ url: `${D}/api/cards/`, method: 'GET' })
    await cardService.add({ card_number: '4111111111111111' }, 'T')
    expect(last()).toMatchObject({ url: `${D}/api/cards/`, method: 'POST', credentials: 'omit' })
    await cardService.remove(7, 'T')
    expect(last()).toMatchObject({ url: `${D}/api/cards/7/`, method: 'DELETE' })
  })

  it('transactions with filters', async () => {
    await transactionService.list('T', { status: 'FAILED', page: 2, min_amount: '' })
    expect(last().url).toBe(`${D}/api/transactions/?status=FAILED&page=2`)
  })
})

describe('admin service (Django)', () => {
  it('hits every admin endpoint with the admin token', async () => {
    await adminService.summary('A', '2026-09-29')
    expect(last().url).toBe(`${D}/api/admin/summary/?date=2026-09-29`)
    await adminService.users('A', { search: 'priya' })
    expect(last().url).toBe(`${D}/api/admin/users/?search=priya`)
    await adminService.setUserActive('A', 5, false)
    expect(last()).toMatchObject({ url: `${D}/api/admin/users/5/`, method: 'PATCH', body: '{"is_active":false}' })
    await adminService.cards('A', { card_type: 'visa' })
    expect(last().url).toBe(`${D}/api/admin/cards/?card_type=visa`)
    await adminService.transactions('A', { search: 'PAY-1' })
    expect(last().url).toBe(`${D}/api/admin/transactions/?search=PAY-1`)
    await adminService.logs('A', { action: 'login' })
    expect(last().url).toBe(`${D}/api/admin/logs/?action=login`)
    await adminService.logActions('A')
    expect(last().url).toBe(`${D}/api/admin/logs/actions/`)
    expect(calls.every((c) => c.headers.Authorization === 'Bearer A')).toBe(true)
  })
})

describe('payment service (FastAPI)', () => {
  it('only sends card_id, amount, currency and description', async () => {
    await paymentService.create({ card_id: 3, amount: '250.00', currency: 'INR', description: '', card_number: 'x', cvv: '1' }, 'T')
    expect(last()).toMatchObject({ url: `${F}/api/payments/`, method: 'POST' })
    expect(JSON.parse(last().body)).toEqual({ card_id: 3, amount: '250.00', currency: 'INR', description: '' })
  })

  it('saved cards and payment lookup (reference is URL-encoded)', async () => {
    await paymentService.savedCards('T')
    expect(last().url).toBe(`${F}/api/payments/cards`)
    await paymentService.get('PAY-A/B', 'T')
    expect(last().url).toBe(`${F}/api/payments/PAY-A%2FB`)
  })
})

describe('reachability checks', () => {
  const respondWith = (response) => fetch.mockImplementationOnce(() => response)

  it('Django counts a 401 as "up" and anything else as "down"', async () => {
    respondWith(Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve('{}') }))
    expect(await pingDjango()).toBe(true)
    respondWith(Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('[]') }))
    expect(await pingDjango()).toBe(true)
    respondWith(Promise.reject(new TypeError('Failed to fetch')))
    expect(await pingDjango()).toBe(false)
  })

  it('FastAPI is up only when /health says ok', async () => {
    expect(await pingFastApi()).toBe(true)
    respondWith(Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('{}') }))
    expect(await pingFastApi()).toBe(false)
  })

  it('aborts propagate so callers can ignore them', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    respondWith(Promise.reject(abort))
    await expect(pingDjango()).rejects.toBe(abort)
    respondWith(Promise.reject(abort))
    await expect(pingFastApi()).rejects.toBe(abort)
  })
})

describe('same-origin deployment (VITE_*_URL = "/")', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('uses relative URLs resolved against the page origin', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_DJANGO_API_URL', '/')
    vi.stubEnv('VITE_FASTAPI_URL', '/')
    vi.stubGlobal('location', { origin: 'http://localhost:8080' })

    const config = await import('./config.js')
    const { cardService } = await import('./djangoApi.js')
    const { paymentService } = await import('./paymentApi.js')

    expect(config.DJANGO_API_URL).toBe('')
    expect(config.DJANGO_ADMIN_URL).toBe('/admin/')
    await cardService.list('T')
    expect(last().url).toBe('http://localhost:8080/api/cards/')
    await paymentService.savedCards('T')
    expect(last().url).toBe('http://localhost:8080/api/payments/cards')
  })
})
