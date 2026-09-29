import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, createApiClient } from './apiClient.js'

const api = createApiClient('http://api.test')

function respond(status, body) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)
  return Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(text) })
}

let fetchMock
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)
  return { url: url.toString(), init }
}

describe('requests', () => {
  it('GET with query params (empty values skipped) and bearer token', async () => {
    fetchMock.mockReturnValue(respond(200, { ok: 1 }))

    const data = await api.get('/api/transactions/', { token: 'T', params: { status: 'SUCCESS', page: 2, min_amount: '', date: null } })

    expect(data).toEqual({ ok: 1 })
    const { url, init } = lastCall()
    expect(url).toBe('http://api.test/api/transactions/?status=SUCCESS&page=2')
    expect(init.method).toBe('GET')
    expect(init.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer T' })
    expect(init.credentials).toBe('omit')
    expect(init.body).toBeUndefined()
  })

  it('POST sends JSON; cookies only when asked', async () => {
    fetchMock.mockReturnValue(respond(201, { id: 1 }))

    await api.post('/api/cards/', { a: 1 }, { withCredentials: true })

    const { init } = lastCall()
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers.Authorization).toBeUndefined()
    expect(init.credentials).toBe('include')
  })

  it('PATCH and DELETE use the right methods; empty bodies become null', async () => {
    fetchMock.mockReturnValue(respond(204))
    expect(await api.delete('/api/cards/1/')).toBeNull()
    expect(lastCall().init.method).toBe('DELETE')

    fetchMock.mockReturnValue(respond(200, { is_active: false }))
    expect(await api.patch('/api/admin/users/1/', { is_active: false })).toEqual({ is_active: false })
    expect(lastCall().init.method).toBe('PATCH')
  })
})

describe('errors', () => {
  it('HTTP errors become ApiError with status, data and the API message', async () => {
    fetchMock.mockReturnValue(respond(404, { detail: 'Card not found.' }))

    const error = await api.get('/x').catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(404)
    expect(error.data).toEqual({ detail: 'Card not found.' })
    expect(error.message).toBe('Card not found.')
  })

  it('non-JSON error bodies are tolerated', async () => {
    fetchMock.mockReturnValue(respond(502, '<html>Bad gateway</html>'))
    const error = await api.get('/x').catch((e) => e)
    expect(error.status).toBe(502)
    expect(error.data).toBeNull()
    expect(error.message).toBe('Request failed (502).')
  })

  it('network failures become status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const error = await api.get('/x').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
    expect(error.message).toBe('Cannot reach the server.')
  })

  it('aborts are passed through unchanged', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    fetchMock.mockRejectedValue(abort)
    await expect(api.get('/x')).rejects.toBe(abort)
  })
})
