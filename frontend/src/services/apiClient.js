// Small fetch wrapper shared by the Django and FastAPI services.
// It never logs request bodies, so card details and tokens stay out of the console.

export class ApiError extends Error {
  constructor(status, data) {
    super(ApiError.messageFrom(status, data))
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }

  static messageFrom(status, data) {
    if (data && typeof data.detail === 'string') return data.detail
    if (status === 0) return 'Cannot reach the server.'
    return `Request failed (${status}).`
  }
}

export function createApiClient(baseUrl) {
  // withCredentials: send/receive cookies (only the auth endpoints need this,
  // for the httpOnly refresh cookie).
  async function request(path, { method = 'GET', body, token, params, signal, withCredentials = false } = {}) {
    // An empty base (same-origin deployment) resolves against the page's address.
    const url = new URL(`${baseUrl}${path}`, globalThis.location?.origin)
    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
    })

    const headers = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers.Authorization = `Bearer ${token}`

    let response
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        credentials: withCredentials ? 'include' : 'omit',
      })
    } catch (error) {
      if (error.name === 'AbortError') throw error
      throw new ApiError(0, null)
    }

    const text = await response.text()
    const data = text ? safeJson(text) : null
    if (!response.ok) throw new ApiError(response.status, data)
    return data
  }

  return {
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
