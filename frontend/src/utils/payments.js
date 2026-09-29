// Payment form rules. They match the FastAPI PaymentCreate schema; the server re-validates.

export const CURRENCIES = [
  { code: 'INR', symbol: '₹' },
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
]

export const MAX_AMOUNT = 1_000_000
export const MAX_DESCRIPTION = 255

// Keeps only digits and a single dot with at most 2 decimals, as the user types.
export function sanitizeAmountInput(value) {
  let cleaned = value.replace(/[^\d.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 2)
  }
  return cleaned
}

export function validatePayment({ cardId, amount, description }) {
  const errors = {}
  if (!cardId) errors.card_id = 'Choose a card to pay with.'

  const text = amount.trim()
  if (!text) errors.amount = 'Enter an amount.'
  else if (!/^\d+(\.\d{1,2})?$/.test(text)) errors.amount = 'Enter a valid amount, e.g. 250 or 250.50.'
  else if (Number(text) <= 0) errors.amount = 'Amount must be greater than 0.'
  else if (Number(text) > MAX_AMOUNT) errors.amount = `Amount cannot exceed ${MAX_AMOUNT.toLocaleString('en-IN')}.`

  if (description.length > MAX_DESCRIPTION) errors.description = `Keep the note under ${MAX_DESCRIPTION} characters.`
  else if (looksLikeCardNumber(description)) errors.description = 'Do not put card numbers in the note.'
  return errors
}

// 13-19 digits, optionally separated by spaces or dashes (same rule as the servers).
export const looksLikeCardNumber = (text) => /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/.test(text)

// "250" -> "250.00" so the API always gets a fixed-point string (never a float).
export const toAmountString = (value) => Number(value).toFixed(2)
