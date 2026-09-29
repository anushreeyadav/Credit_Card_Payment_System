const currencyFormatters = new Map()

// Amounts arrive from the APIs as strings like "250.00" to avoid float rounding.
export function formatAmount(amount, currency = 'INR') {
  if (!currencyFormatters.has(currency)) {
    currencyFormatters.set(currency, new Intl.NumberFormat('en-IN', { style: 'currency', currency }))
  }
  return currencyFormatters.get(currency).format(Number(amount))
}

export function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}
