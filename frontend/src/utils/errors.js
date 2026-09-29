// Turn API errors into messages for forms. Never includes submitted values.

// Returns { field: "message" } from either API's validation errors:
//   Django (DRF): { field: ["message", ...] }
//   FastAPI:      { detail: [{ loc: ["body", "field"], msg: "message" }, ...] }
export function fieldErrors(error) {
  const data = error?.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
  const result = {}
  if (Array.isArray(data.detail)) {
    for (const item of data.detail) {
      const field = item?.loc?.[item.loc.length - 1]
      if (field && !result[field]) result[field] = item.msg
    }
    return result
  }
  for (const [field, messages] of Object.entries(data)) {
    if (field === 'detail' || field === 'code') continue
    const list = Array.isArray(messages) ? messages : [messages]
    if (list.length) result[field] = list.join(' ')
  }
  return result
}

export function generalMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return null
  if (error.status === 0) return 'Cannot reach the server. Check that the backend is running.'
  if (error.status === 429) return 'Too many attempts. Please wait a minute and try again.'
  if (error.status >= 500) return 'The server had a problem. Please try again shortly.'
  const nonField = error.data?.non_field_errors
  if (Array.isArray(nonField) && nonField.length) return nonField.join(' ')
  if (typeof error.data?.detail === 'string') return error.data.detail
  return fallback
}
