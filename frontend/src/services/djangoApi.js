import { createApiClient } from './apiClient.js'
import { DJANGO_API_URL } from './config.js'

const django = createApiClient(DJANGO_API_URL)

// Saved cards (Module 2). The full card number and CVV are sent only when
// adding a card; the API returns masked data only.
export const cardService = {
  list: (token, options) => django.get('/api/cards/', { ...options, token }),
  add: (card, token) => django.post('/api/cards/', card, { token }),
  remove: (id, token) => django.delete(`/api/cards/${id}/`, { token }),
}

// Transaction history (Module 4).
// filters: { status, min_amount, max_amount, date_from, date_to, page, page_size }
export const transactionService = {
  list: (token, filters, options) => django.get('/api/transactions/', { ...options, token, params: filters }),
}

// Admin dashboard (staff only; each section needs the matching Django permission).
export const adminService = {
  summary: (token, date, options) => django.get('/api/admin/summary/', { ...options, token, params: { date } }),
  users: (token, params, options) => django.get('/api/admin/users/', { ...options, token, params }),
  setUserActive: (token, id, isActive) => django.patch(`/api/admin/users/${id}/`, { is_active: isActive }, { token }),
  cards: (token, params, options) => django.get('/api/admin/cards/', { ...options, token, params }),
  transactions: (token, params, options) => django.get('/api/admin/transactions/', { ...options, token, params }),
  logs: (token, params, options) => django.get('/api/admin/logs/', { ...options, token, params }),
  logActions: (token, options) => django.get('/api/admin/logs/actions/', { ...options, token }),
}

// Authentication. The refresh token is an httpOnly cookie set by Django, so
// login/refresh/logout must send cookies; the access token comes back in the
// body and is kept in memory by AuthProvider.
export const authService = {
  register: (data) => django.post('/api/auth/register/', data),
  login: (username, password) => django.post('/api/auth/login/', { username, password }, { withCredentials: true }),
  refresh: () => django.post('/api/auth/refresh/', undefined, { withCredentials: true }),
  logout: () => django.post('/api/auth/logout/', undefined, { withCredentials: true }),
  me: (token) => django.get('/api/auth/me/', { token }),
}

// Reachability check: the cards endpoint answers 401 without a token, which
// is enough to show the server is up.
export async function pingDjango(options) {
  try {
    await django.get('/api/cards/', options)
    return true
  } catch (error) {
    if (error.name === 'AbortError') throw error
    return error.status === 401
  }
}
