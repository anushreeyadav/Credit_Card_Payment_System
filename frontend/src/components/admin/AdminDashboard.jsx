import { Link } from 'react-router-dom'

import useApiQuery from '../../hooks/useApiQuery.js'
import { adminSection } from '../../routes/paths.js'
import { adminService } from '../../services/djangoApi.js'
import { STATUS_COLORS, STATUS_LABELS, STATUSES } from '../../utils/analytics.js'
import { formatAmount } from '../../utils/format.js'
import BarChart from '../charts/BarChart.jsx'
import DonutChart from '../charts/DonutChart.jsx'
import { ArrowRightIcon, CardIcon, CheckCircleIcon, ClockIcon, LockIcon, ReceiptIcon, UsersIcon, WalletIcon, XCircleIcon } from '../icons.jsx'
import Skeleton from '../ui/Skeleton.jsx'
import { NoPermission } from './AdminListSection.jsx'

// Four requests only: every admin list call is written to the audit log, so the
// dashboard asks for counts (page_size=1) and one daily summary - it never pages
// through all data. All-time status totals would need a dedicated stats API.
const COUNT_ONLY = { page_size: 1 }
const today = () => new Date().toISOString().slice(0, 10) // the summary API's days are UTC
const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const longDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

function Tile({ icon: Icon, label, query, value, sub, to, tone, testId }) {
  const denied = query?.error?.status === 403
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-2 text-xl font-bold tracking-tight break-words text-slate-900 tabular-nums sm:text-2xl" data-testid={testId}>
        {denied ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400">
            <LockIcon className="h-4 w-4" /> No access
          </span>
        ) : query?.error ? (
          <span className="text-sm font-semibold text-red-600">Unavailable</span>
        ) : value === undefined || value === null ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          value
        )}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </>
  )
  const className = 'group block min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition sm:p-5'
  return to && !denied ? (
    <Link to={to} className={`${className} hover:-translate-y-0.5 hover:shadow-lg`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  )
}

export default function AdminDashboard() {
  const users = useApiQuery(adminService.users, COUNT_ONLY)
  const cards = useApiQuery(adminService.cards, COUNT_ONLY)
  const transactions = useApiQuery(adminService.transactions, COUNT_ONLY)
  const summary = useApiQuery(adminService.summary, today())

  const all = [users, cards, transactions, summary]
  if (all.every((q) => q.error?.status === 403)) return <NoPermission />

  const s = summary.data
  const week = s
    ? s.last_7_days.reduce(
        (sum, d) => ({ SUCCESS: sum.SUCCESS + d.success, FAILED: sum.FAILED + d.failed, PENDING: sum.PENDING + d.pending }),
        { SUCCESS: 0, FAILED: 0, PENDING: 0 },
      )
    : null
  const weekTotal = week ? week.SUCCESS + week.FAILED + week.PENDING : 0
  const summaryDenied = summary.error?.status === 403

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile icon={UsersIcon} tone="bg-indigo-50 text-indigo-600" label="Total users" query={users} value={users.data?.count} sub="All accounts" to={adminSection('users')} testId="admin-total-users" />
        <Tile icon={CardIcon} tone="bg-violet-50 text-violet-600" label="Total cards" query={cards} value={cards.data?.count} sub="Saved cards (masked)" to={adminSection('cards')} testId="admin-total-cards" />
        <Tile icon={ReceiptIcon} tone="bg-sky-50 text-sky-600" label="Total transactions" query={transactions} value={transactions.data?.count} sub="All time" to={adminSection('transactions')} testId="admin-total-transactions" />
      </div>

      <section aria-labelledby="today-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="today-title" className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
              Today
            </h2>
            {s && <p className="text-xs text-slate-500">{longDate(s.date)} · UTC</p>}
          </div>
          <Link to={adminSection('summary')} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline">
            Payment summary <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Tile icon={CheckCircleIcon} tone="bg-emerald-50 text-emerald-600" label="Successful" query={summary} value={s?.success} testId="admin-today-success" />
          <Tile icon={XCircleIcon} tone="bg-red-50 text-red-600" label="Failed" query={summary} value={s?.failed} testId="admin-today-failed" />
          <Tile icon={ClockIcon} tone="bg-amber-50 text-amber-600" label="Pending" query={summary} value={s?.pending} testId="admin-today-pending" />
          <Tile
            icon={WalletIcon}
            tone="bg-fuchsia-50 text-fuchsia-600"
            label="Successful amount"
            query={summary}
            value={s ? (s.successful_amounts.length ? s.successful_amounts.map((r) => formatAmount(r.total_amount, r.currency)).join(' · ') : formatAmount(0, 'INR')) : null}
            sub={s ? (s.success_rate === null ? 'No finished payments yet' : `${s.success_rate}% success rate`) : null}
            testId="admin-today-amount"
          />
        </div>
      </section>

      {!summaryDenied && (
        <div className="grid gap-6 xl:grid-cols-3">
          <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-2">
            <h2 className="font-semibold text-slate-900">Payments in the last 7 days</h2>
            <p className="mt-0.5 text-xs text-slate-500">Per day (UTC), by status</p>
            <div className="mt-5">
              {!s ? (
                <Skeleton className="h-56 w-full" />
              ) : (
                <BarChart
                  data={[...s.last_7_days].reverse().map((d) => ({
                    key: d.date,
                    label: shortDate(d.date),
                    tooltipLabel: longDate(d.date),
                    values: { SUCCESS: d.success, FAILED: d.failed, PENDING: d.pending },
                  }))}
                  series={STATUSES.map((k) => ({ key: k, label: STATUS_LABELS[k], color: STATUS_COLORS[k] }))}
                  ariaLabel={`Last 7 days: ${week.SUCCESS} successful, ${week.FAILED} failed, ${week.PENDING} pending payments.`}
                />
              )}
            </div>
          </section>
          <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="font-semibold text-slate-900">Status split · 7 days</h2>
            <p className="mt-0.5 text-xs text-slate-500">Successful vs failed vs pending</p>
            <div className="mt-5">
              {!s ? (
                <Skeleton className="h-44 w-full" />
              ) : weekTotal === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">No transaction data available yet.</p>
              ) : (
                <DonutChart
                  size={160}
                  centerValue={weekTotal}
                  centerLabel="Payments"
                  segments={STATUSES.map((k) => ({ key: k, label: STATUS_LABELS[k], value: week[k], color: STATUS_COLORS[k] }))}
                />
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
