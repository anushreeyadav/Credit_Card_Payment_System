import { useState } from 'react'

import BarChart from '../components/charts/BarChart.jsx'
import DonutChart from '../components/charts/DonutChart.jsx'
import { CardIcon, CheckCircleIcon, PieIcon, ReceiptIcon, RefreshIcon, SendIcon, TrendUpIcon, WalletIcon } from '../components/icons.jsx'
import PageHeader from '../components/layout/PageHeader.jsx'
import Button, { ButtonLink } from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import useTransactionHistory from '../hooks/useTransactionHistory.js'
import { PATHS } from '../routes/paths.js'
import {
  amountByCard,
  dailySeries,
  mainCurrency,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUSES,
  statusCounts,
  successRate,
} from '../utils/analytics.js'
import { BRANDS } from '../utils/cards.js'
import { generalMessage } from '../utils/errors.js'
import { formatAmount } from '../utils/format.js'

const RANGES = [
  { days: 7, label: '7 days', every: 1 },
  { days: 30, label: '30 days', every: 5 },
  { days: 90, label: '90 days', every: 15 },
]
const AMOUNT_COLOR = '#6366f1' // indigo-500: one hue for a single magnitude series

const shortDay = (date) => date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const longDay = (date) => date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' })
const compact = (currency) => (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value)

function Kpi({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-2xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <section className={`min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

export default function AnalyticsPage() {
  const { data, loading, error, reload } = useTransactionHistory()
  const [range, setRange] = useState(RANGES[1])
  const [showTable, setShowTable] = useState(false)

  const all = data?.transactions ?? []
  // Same calendar days as the charts: today and the (days - 1) days before it.
  const now = new Date()
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (range.days - 1)).getTime()
  const inRange = all.filter((t) => new Date(t.created_at).getTime() >= since)
  const currency = mainCurrency(all)
  const format = compact(currency)
  const counts = statusCounts(inRange)
  const rate = successRate(counts)
  const series = dailySeries(inRange, { days: range.days, currency })
  const paidInRange = series.reduce((sum, d) => sum + d.amount, 0)
  const cards = amountByCard(inRange, currency)
  const otherCurrency = inRange.filter((t) => t.currency !== currency).length

  const header = (
    <PageHeader
      eyebrow="Insights"
      title="Payment analytics"
      description="Charts built from your real transactions. Nothing is estimated."
      actions={
        <>
          <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                aria-pressed={r.days === range.days}
                onClick={() => setRange(r)}
                className={`rounded-xl px-3.5 py-1.5 text-sm font-semibold transition ${
                  r.days === range.days ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" icon={RefreshIcon} onClick={reload}>
            Refresh
          </Button>
        </>
      }
    />
  )

  if (error) {
    return (
      <section>
        {header}
        <ErrorState className="mt-6" message={generalMessage(error, 'Could not load your transactions.')} onRetry={reload} />
      </section>
    )
  }

  if (loading || !data) {
    return (
      <section>
        {header}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading analytics">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-3xl" />
          ))}
          <Skeleton className="h-80 w-full rounded-3xl sm:col-span-2 xl:col-span-4" />
        </div>
      </section>
    )
  }

  if (all.length === 0) {
    return (
      <section>
        {header}
        <EmptyState
          className="mt-6"
          icon={PieIcon}
          title="No transaction data available yet."
          action={
            <ButtonLink to={PATHS.payment} icon={SendIcon}>
              Make a payment
            </ButtonLink>
          }
        >
          Charts appear here once you have made payments.
        </EmptyState>
      </section>
    )
  }

  const paidCount = cards.reduce((n, c) => n + c.count, 0) // successful payments in `currency`

  return (
    <section>
      {header}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={ReceiptIcon} tone="bg-sky-50 text-sky-600" label="Payments" value={inRange.length} sub={`In the last ${range.label}`} />
        <Kpi
          icon={CheckCircleIcon}
          tone="bg-emerald-50 text-emerald-600"
          label="Success rate"
          value={rate === null ? '—' : `${rate}%`}
          sub={rate === null ? 'No finished payments in this range' : `${counts.SUCCESS} successful, ${counts.FAILED} failed`}
        />
        <Kpi icon={WalletIcon} tone="bg-violet-50 text-violet-600" label="Successfully paid" value={formatAmount(paidInRange, currency)} sub={`${currency} only`} />
        <Kpi
          icon={TrendUpIcon}
          tone="bg-amber-50 text-amber-600"
          label="Average payment"
          value={paidCount ? formatAmount(paidInRange / paidCount, currency) : '—'}
          sub="Successful payments"
        />
      </div>

      {inRange.length === 0 ? (
        <EmptyState className="mt-6" icon={PieIcon} tone="slate" title="No transaction data available yet.">
          You have no payments in the last {range.label}. Try a longer range.
        </EmptyState>
      ) : (
        <>
          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <ChartCard className="xl:col-span-2" title="Payments by date" subtitle={`Number of payments per day, by status · last ${range.label}`}>
              <BarChart
                data={series.map((d) => ({ key: d.day, label: shortDay(d.date), tooltipLabel: longDay(d.date), values: d }))}
                series={STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s], color: STATUS_COLORS[s] }))}
                labelEvery={range.every}
                ariaLabel={`Payments per day for the last ${range.label}: ${counts.SUCCESS} successful, ${counts.FAILED} failed, ${counts.PENDING} pending.`}
              />
            </ChartCard>
            <ChartCard title="Status distribution" subtitle="Successful vs failed vs pending">
              <DonutChart
                size={170}
                centerValue={inRange.length}
                centerLabel="Payments"
                segments={STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s], value: counts[s], color: STATUS_COLORS[s] }))}
              />
            </ChartCard>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <ChartCard className="xl:col-span-2" title="Transaction amount trend" subtitle={`Successful amount per day in ${currency}`}>
              <BarChart
                data={series.map((d) => ({ key: d.day, label: shortDay(d.date), tooltipLabel: longDay(d.date), values: { amount: d.amount } }))}
                series={[{ key: 'amount', label: 'Paid', color: AMOUNT_COLOR }]}
                format={format}
                labelEvery={range.every}
                height={200}
                ariaLabel={`Successful amount per day, total ${formatAmount(paidInRange, currency)} in the last ${range.label}.`}
              />
              {otherCurrency > 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  {otherCurrency} payment{otherCurrency === 1 ? '' : 's'} in other currencies {otherCurrency === 1 ? 'is' : 'are'} counted above but not added to {currency} amounts.
                </p>
              )}
            </ChartCard>
            <ChartCard title="Spending by card" subtitle={`Successful payments in ${currency}`}>
              {cards.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No successful payments in this range.</p>
              ) : (
                <ul className="space-y-4">
                  {cards.slice(0, 5).map((c) => (
                    <li key={c.card}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <CardIcon className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="truncate font-medium text-slate-800">
                            {BRANDS[c.cardType]?.label ?? c.cardType} ·{c.card.slice(-5)}
                          </span>
                        </span>
                        <span className="font-semibold text-slate-900 tabular-nums">{formatAmount(c.amount, currency)}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.round((c.amount / cards[0].amount) * 100)}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {c.count} payment{c.count === 1 ? '' : 's'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-900">Data table</h2>
                <p className="text-xs text-slate-500">The numbers behind the charts, day by day.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setShowTable((s) => !s)} aria-expanded={showTable}>
                {showTable ? 'Hide table' : 'Show table'}
              </Button>
            </div>
            {showTable && (
              <div className="relative overflow-x-auto border-t border-slate-100">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th scope="col" className="px-5 py-3 text-left">Day</th>
                      {STATUSES.map((s) => (
                        <th key={s} scope="col" className="px-5 py-3 text-right">{STATUS_LABELS[s]}</th>
                      ))}
                      <th scope="col" className="px-5 py-3 text-right">Paid ({currency})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...series].reverse().map((d) => (
                      <tr key={d.day}>
                        <th scope="row" className="px-5 py-2.5 text-left font-medium text-slate-700">{longDay(d.date)}</th>
                        {STATUSES.map((s) => (
                          <td key={s} className="px-5 py-2.5 text-right text-slate-700 tabular-nums">{d[s]}</td>
                        ))}
                        <td className="px-5 py-2.5 text-right font-semibold text-slate-900 tabular-nums">{formatAmount(d.amount, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {data.truncated && (
        <p className="mt-4 text-xs text-slate-500">Based on your latest {all.length.toLocaleString('en-IN')} of {data.count.toLocaleString('en-IN')} transactions.</p>
      )}
    </section>
  )
}
