import { createApiClient } from './apiClient.js'
import { FASTAPI_URL } from './config.js'

const fastapi = createApiClient(FASTAPI_URL)

// Simulated payments (Module 3). Payments reference a saved card by id only -
// never send a card number or CVV here (the API rejects them).
export const paymentService = {
  savedCards: (token, options) => fastapi.get('/api/payments/cards', { ...options, token }),
  create: ({ card_id, amount, currency, description }, token) =>
    fastapi.post('/api/payments/', { card_id, amount, currency, description }, { token }),
  get: (reference, token) => fastapi.get(`/api/payments/${encodeURIComponent(reference)}`, { token }),
}

export async function pingFastApi(options) {
  try {
    const health = await fastapi.get('/health', options)
    return health?.status === 'ok'
  } catch (error) {
    if (error.name === 'AbortError') throw error
    return false
  }
}
