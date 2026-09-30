// Pure helpers that turn the user's real transactions into chart data.
// Nothing is estimated or invented: empty days are zero, and amounts are only
// summed within one currency.

// Reserved status colours (always shown next to a text label).
export const STATUS_COLORS = { SUCCESS: '#10b981', FAILED: '#ef4444', PENDING: '#f59e0b' }
export const STATUS_LABELS = { SUCCESS: 'Successful', FAILED: 'Failed', PENDING: 'Pending' }
export const STATUSES = ['SUCCESS', 'FAILED', 'PENDING']

// Local calendar day, YYYY-MM-DD.
export function dayKey(date) {
  const d = new Date(date)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export function statusCounts(transactions) {
  const counts = { SUCCESS: 0, FAILED: 0, PENDING: 0 }
  for (const t of transactions) if (t.status in counts) counts[t.status] += 1
  return counts
}

// Successful amount per currency, e.g. { INR: 1250.5 }.
export function paidByCurrency(transactions) {
  const totals = {}
  for (const t of transactions) {
    if (t.status === 'SUCCESS') totals[t.currency] = (totals[t.currency] ?? 0) + Number(t.amount)
  }
  return totals
}

// The currency with the most transactions (the one the amount charts use).
export function mainCurrency(transactions) {
  const counts = {}
  for (const t of transactions) counts[t.currency] = (counts[t.currency] ?? 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'INR'
}

// One entry per day for the last `days` days (oldest first), ending today.
// Each has counts per status and the successful amount in `currency`.
export function dailySeries(transactions, { days, currency, now = new Date() }) {
  const series = []
  const index = new Map()
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const entry = { day: dayKey(date), date, SUCCESS: 0, FAILED: 0, PENDING: 0, amount: 0 }
    index.set(entry.day, entry)
    series.push(entry)
  }
  for (const t of transactions) {
    const entry = index.get(dayKey(t.created_at))
    if (!entry || !(t.status in entry)) continue
    entry[t.status] += 1
    if (t.status === 'SUCCESS' && t.currency === currency) entry.amount += Number(t.amount)
  }
  return series
}

// Successful spend per saved card (by masked number), largest first.
export function amountByCard(transactions, currency) {
  const cards = new Map()
  for (const t of transactions) {
    if (t.status !== 'SUCCESS' || t.currency !== currency) continue
    const row = cards.get(t.masked_card) ?? { card: t.masked_card, cardType: t.card_type, amount: 0, count: 0 }
    row.amount += Number(t.amount)
    row.count += 1
    cards.set(t.masked_card, row)
  }
  return [...cards.values()].sort((a, b) => b.amount - a.amount)
}

// Success rate over finished payments (pending ones are still open), or null.
export function successRate(counts) {
  const finished = counts.SUCCESS + counts.FAILED
  return finished ? Math.round((counts.SUCCESS / finished) * 100) : null
}

// Compare the last `days` days with the `days` before them (count of successful payments).
export function periodChange(transactions, { days, now = new Date() }) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
  const span = days * 86_400_000
  let current = 0
  let previous = 0
  for (const t of transactions) {
    if (t.status !== 'SUCCESS') continue
    const at = new Date(t.created_at).getTime()
    if (at >= end - span && at < end) current += 1
    else if (at >= end - 2 * span && at < end - span) previous += 1
  }
  return { current, previous, delta: current - previous }
}
