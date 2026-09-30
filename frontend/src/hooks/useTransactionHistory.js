import { transactionService } from '../services/djangoApi.js'
import useApiQuery from './useApiQuery.js'

// Up to MAX_PAGES x PAGE_SIZE of the user's newest transactions, for the
// dashboard totals and the analytics charts. `count` is always the exact total
// from the API; `truncated` says whether older rows were left out.
const PAGE_SIZE = 100
const MAX_PAGES = 20

async function fetchHistory(token, _params, options) {
  const transactions = []
  let count = 0
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const data = await transactionService.list(token, { page, page_size: PAGE_SIZE }, options)
    count = data.count
    transactions.push(...data.results)
    if (!data.next) break
  }
  return { transactions, count, truncated: transactions.length < count }
}

export default function useTransactionHistory() {
  return useApiQuery(fetchHistory, null)
}

// Totals per status, and successful amounts per currency (never added across currencies).
export function summarize(transactions) {
  const byStatus = { SUCCESS: 0, FAILED: 0, PENDING: 0 }
  const paid = {}
  for (const t of transactions) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1
    if (t.status === 'SUCCESS') paid[t.currency] = (paid[t.currency] ?? 0) + Number(t.amount)
  }
  return { byStatus, paid }
}
