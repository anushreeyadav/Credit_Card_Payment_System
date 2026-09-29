import { useState } from 'react'

import useApiQuery from '../../hooks/useApiQuery.js'
import { adminService } from '../../services/djangoApi.js'
import { generalMessage } from '../../utils/errors.js'
import { formatAmount } from '../../utils/format.js'
import Alert from '../ui/Alert.jsx'
import Spinner from '../ui/Spinner.jsx'
import { NoPermission } from './AdminListSection.jsx'

// Status colours are reserved for state and always paired with a text label.
const STATUS_DOT = { success: 'bg-emerald-500', failed: 'bg-red-500', pending: 'bg-amber-500' }

const isoDay = (date) => date.toISOString().slice(0, 10)
const shiftDay = (iso, days) => isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000))
const longDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

function StatTile({ label, value, status, testId }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
        {status && <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />}
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums" data-testid={testId}>
        {value}
      </p>
    </div>
  )
}

export default function OverviewSection() {
  const today = isoDay(new Date()) // the API's days are UTC
  const [day, setDay] = useState(today)
  const { data, loading, error, reload } = useApiQuery(adminService.summary, day)

  if (error?.status === 403) return <NoPermission />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Daily payment summary</h2>
          <p className="text-sm text-slate-500" data-testid="summary-date">
            {longDate(day)} · UTC
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {loading && data && <Spinner className="h-4 w-4 text-slate-400" />}
          <button
            type="button"
            onClick={() => setDay(shiftDay(day, -1))}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 ring-inset hover:bg-slate-50"
          >
            ← Previous day
          </button>
          <input
            type="date"
            aria-label="Summary date"
            value={day}
            max={today}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setDay(shiftDay(day, 1))}
            disabled={day >= today}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 ring-inset hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next day →
          </button>
          {day !== today && (
            <button type="button" onClick={() => setDay(today)} className="px-2 text-sm font-semibold text-indigo-600">
              Today
            </button>
          )}
        </div>
      </div>

      {error ? (
        <Alert variant="error">
          <p>{generalMessage(error, 'Could not load the summary.')}</p>
          <button type="button" onClick={reload} className="mt-1 font-semibold underline">
            Try again
          </button>
        </Alert>
      ) : !data ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500" role="status">
          <Spinner className="h-5 w-5 text-indigo-600" /> Loading summary…
        </div>
      ) : (
        <div className={loading ? 'space-y-6 opacity-60' : 'space-y-6'} aria-busy={loading}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatTile label="Total payments" value={data.total} testId="stat-total" />
            <StatTile label="Successful" value={data.success} status="success" testId="stat-success" />
            <StatTile label="Failed" value={data.failed} status="failed" testId="stat-failed" />
            <StatTile label="Pending" value={data.pending} status="pending" testId="stat-pending" />
            <StatTile
              label="Success rate"
              value={data.success_rate === null ? '–' : `${data.success_rate}%`}
              testId="stat-rate"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Total successful payment amount</h3>
            {data.successful_amounts.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No successful payments on this day.</p>
            ) : (
              <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {data.successful_amounts.map((row) => (
                  <li key={row.currency}>
                    <p className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums" data-testid={`amount-${row.currency}`}>
                      {formatAmount(row.total_amount, row.currency)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {row.count} payment{row.count === 1 ? '' : 's'} · avg {formatAmount(row.average_amount, row.currency)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Totals are per currency and never added together. Success rate excludes pending payments.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[520px] text-sm" data-testid="last-7-days">
              <caption className="px-4 pt-4 pb-2 text-left text-sm font-semibold text-slate-900">Last 7 days</caption>
              <thead className="bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left">Day</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Total</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Successful</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Failed</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {data.last_7_days.map((row) => (
                  <tr key={row.date} className={row.date === day ? 'bg-indigo-50/50' : ''}>
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => setDay(row.date)} className="font-medium text-indigo-600 hover:underline">
                        {shortDate(row.date)}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-900">{row.total}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{row.success}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{row.failed}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{row.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
