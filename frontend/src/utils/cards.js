// Card number helpers for the Add Card form. They mirror the Django rules
// (cards/validators.py) for instant feedback; the server re-validates.
// Nothing here logs or stores the number.

export const BRANDS = {
  visa: { label: 'Visa', lengths: [13, 16, 19], gradient: 'from-indigo-600 to-blue-800' },
  mastercard: { label: 'Mastercard', lengths: [16], gradient: 'from-slate-800 to-slate-950' },
  amex: { label: 'American Express', lengths: [15], gradient: 'from-teal-600 to-cyan-800' },
  discover: { label: 'Discover', lengths: [16, 17, 18, 19], gradient: 'from-orange-500 to-amber-700' },
  rupay: { label: 'RuPay', lengths: [16], gradient: 'from-emerald-600 to-teal-800' },
}

const RULES = [
  ['amex', (n) => ['34', '37'].includes(n.slice(0, 2))],
  ['visa', (n) => n[0] === '4'],
  ['mastercard', (n) => (+n.slice(0, 2) >= 51 && +n.slice(0, 2) <= 55) || (+n.slice(0, 4) >= 2221 && +n.slice(0, 4) <= 2720)],
  ['discover', (n) => n.startsWith('6011') || n.startsWith('65') || (+n.slice(0, 3) >= 644 && +n.slice(0, 3) <= 649)],
  ['rupay', (n) => ['60', '81', '82'].includes(n.slice(0, 2)) || n.startsWith('508')],
]

export const digitsOnly = (value) => value.replace(/\D/g, '')

export function detectBrand(digits) {
  if (digits.length < 2) return digits[0] === '4' ? 'visa' : null
  const match = RULES.find(([, test]) => test(digits))
  return match ? match[0] : null
}

export function passesLuhn(digits) {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return digits.length > 0 && sum % 10 === 0
}

// "4111111111111111" -> "4111 1111 1111 1111"; Amex uses 4-6-5 grouping.
export function formatCardNumber(value) {
  const digits = digitsOnly(value).slice(0, 19)
  const groups = detectBrand(digits) === 'amex' ? [4, 6, 5] : [4, 4, 4, 4, 3]
  const parts = []
  let i = 0
  for (const size of groups) {
    if (i >= digits.length) break
    parts.push(digits.slice(i, i + size))
    i += size
  }
  return parts.join(' ')
}

// "0528" / "05/28" -> "05/28" as the user types.
export function formatExpiry(value, previous = '') {
  const digits = digitsOnly(value).slice(0, 4)
  const deleting = value.length < previous.length
  if (digits.length === 1 && Number(digits) > 1) return `0${digits}/`
  if (digits.length === 2 && !deleting) return `${digits}/`
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return digits
}

export function parseExpiry(value) {
  const match = /^(\d{2})\/(\d{2})$/.exec(value.trim())
  if (!match) return null
  return { month: Number(match[1]), year: 2000 + Number(match[2]) }
}

export function validateCardForm({ number, name, expiry }, today = new Date()) {
  const errors = {}
  const digits = digitsOnly(number)
  const brand = detectBrand(digits)

  if (!digits) errors.card_number = 'Enter the card number.'
  else if (digits.length < 13 || digits.length > 19) errors.card_number = 'Card number must be 13 to 19 digits.'
  else if (!brand) errors.card_number = 'This card type is not supported.'
  else if (!BRANDS[brand].lengths.includes(digits.length)) errors.card_number = `${BRANDS[brand].label} numbers have ${BRANDS[brand].lengths.join(' or ')} digits.`
  else if (!passesLuhn(digits)) errors.card_number = 'This card number is not valid. Check for typos.'

  const cleanName = name.trim().replace(/\s+/g, ' ')
  if (!cleanName) errors.cardholder_name = 'Enter the name on the card.'
  else if (!/^[A-Za-z][A-Za-z .'-]{1,99}$/.test(cleanName)) {
    errors.cardholder_name = "Use letters, spaces, dots, apostrophes and hyphens only."
  }

  const exp = parseExpiry(expiry)
  if (!expiry.trim()) errors.expiry = 'Enter the expiry date.'
  else if (!exp || exp.month < 1 || exp.month > 12) errors.expiry = 'Use MM/YY, e.g. 08/28.'
  else {
    const thisYear = today.getFullYear()
    const thisMonth = today.getMonth() + 1
    if (exp.year < thisYear || (exp.year === thisYear && exp.month < thisMonth)) errors.expiry = 'This card has expired.'
    else if (exp.year > thisYear + 20) errors.expiry = 'Expiry year is too far in the future.'
  }
  return errors
}

export function isExpired(card, today = new Date()) {
  const year = today.getFullYear()
  const month = today.getMonth() + 1
  return card.expiry_year < year || (card.expiry_year === year && card.expiry_month < month)
}

export const formatCardExpiry = (card) =>
  `${String(card.expiry_month).padStart(2, '0')}/${String(card.expiry_year).slice(-2)}`
