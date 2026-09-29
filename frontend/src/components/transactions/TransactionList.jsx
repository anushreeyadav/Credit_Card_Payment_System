import { BRANDS } from '../../utils/cards.js'
import { formatAmount, formatDateTime } from '../../utils/format.js'
import StatusBadge from '../payments/StatusBadge.jsx'

const brandLabel = (type) => BRANDS[type]?.label ?? type

// Table on medium screens and up, stacked cards on phones.
// Rows show masked card data only - exactly what the API returns.
export default function TransactionList({ transactions }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full text-left text-sm" data-testid="transactions-table">
          <thead className="bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">Transaction ID</th>
              <th scope="col" className="px-4 py-3">Date &amp; time</th>
              <th scope="col" className="px-4 py-3">Card</th>
              <th scope="col" className="px-4 py-3 text-right">Amount</th>
              <th scope="col" className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.map((t) => (
              <tr key={t.reference} className="hover:bg-slate-50/60" data-testid="transaction-row">
                <td className="px-4 py-3.5">
                  <span className="font-mono text-xs text-slate-900" data-testid="tx-reference">{t.reference}</span>
                  {t.description && <p className="mt-0.5 max-w-56 truncate text-xs text-slate-500">{t.description}</p>}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">{formatDateTime(t.created_at)}</td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <span className="font-mono text-slate-900" data-testid="tx-card">{t.masked_card}</span>
                  <p className="text-xs text-slate-500">{brandLabel(t.card_type)}</p>
                </td>
                <td className="px-4 py-3.5 text-right font-semibold whitespace-nowrap text-slate-900 tabular-nums" data-testid="tx-amount">
                  {formatAmount(t.amount, t.currency)}
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={t.status} />
                  {t.status === 'FAILED' && t.failure_reason && (
                    <p className="mt-1 text-xs text-red-600">{t.failure_reason}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden" data-testid="transactions-cards">
        {transactions.map((t) => (
          <li key={t.reference} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-slate-900 tabular-nums">{formatAmount(t.amount, t.currency)}</p>
                <p className="text-xs text-slate-500">{formatDateTime(t.created_at)}</p>
              </div>
              <StatusBadge status={t.status} />
            </div>
            {t.status === 'FAILED' && t.failure_reason && <p className="mt-2 text-xs text-red-600">{t.failure_reason}</p>}
            <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Card</dt>
                <dd className="font-mono text-slate-900">{t.masked_card}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-500">Transaction ID</dt>
                <dd className="font-mono break-all text-slate-900">{t.reference}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}

export function TransactionListSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Loading transactions" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-4 py-2">
          <div className="h-3 w-40 rounded bg-slate-200" />
          <div className="hidden h-3 w-28 rounded bg-slate-100 sm:block" />
          <div className="ml-auto h-3 w-20 rounded bg-slate-200" />
          <div className="h-5 w-16 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  )
}
