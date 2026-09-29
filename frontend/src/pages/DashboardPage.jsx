import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import ApiStatus from '../components/ApiStatus.jsx'
import {
  ArrowRightIcon,
  CardIcon,
  CheckCircleIcon,
  PlusIcon,
  ReceiptIcon,
  SendIcon,
  WalletIcon,
} from '../components/icons.jsx'
import StatusBadge from '../components/payments/StatusBadge.jsx'
import Alert from '../components/ui/Alert.jsx'
import { ButtonLink } from '../components/ui/Button.jsx'
import useAuth from '../hooks/useAuth.js'
import { PATHS } from '../routes/paths.js'
import { cardService, transactionService } from '../services/djangoApi.js'
import { BRANDS } from '../utils/cards.js'
import { generalMessage } from '../utils/errors.js'
import { formatAmount, formatDateTime } from '../utils/format.js'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const TONES = {
  indigo: 'bg-indigo-50 text-indigo-600',
  sky: 'bg-sky-50 text-sky-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
}

function StatCard({ icon: Icon, label, value, hint, to, tone, testId }) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${TONES[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 tabular-nums" data-testid={testId}>
        {value ?? <span className="inline-block h-8 w-12 animate-pulse rounded-lg bg-slate-100" />}
      </p>
      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-500 group-hover:text-indigo-600">
        {hint} <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </p>
    </Link>
  )
}

function Panel({ title, action, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function PanelLink({ to, children }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-500">
      {children} <ArrowRightIcon className="h-4 w-4" />
    </Link>
  )
}

// Successful payments: count and total per currency (all pages, newest first).
async function successTotals(authRequest, signal) {
  const totals = {}
  for (let page = 1; ; page += 1) {
    const data = await authRequest((token) =>
      transactionService.list(token, { status: 'SUCCESS', page, page_size: 100 }, { signal }),
    )
    for (const t of data.results) totals[t.currency] = (totals[t.currency] ?? 0) + Number(t.amount)
    if (!data.next || page >= 20) return { count: data.count, totals }
  }
}

export default function DashboardPage() {
  const { user, authRequest } = useAuth()
  const [cards, setCards] = useState(null)
  const [recent, setRecent] = useState(null)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal
    const fail = (err) => {
      // 401s are handled by authRequest (refresh, or sign-out on expiry).
      if (err.name !== 'AbortError' && err.status !== 401) setError(generalMessage(err))
    }
    authRequest((token) => cardService.list(token, { signal })).then(setCards).catch(fail)
    authRequest((token) => transactionService.list(token, { page_size: 5 }, { signal })).then(setRecent).catch(fail)
    successTotals(authRequest, signal).then(setSuccess).catch(fail)
    return () => controller.abort()
  }, [authRequest])

  const inr = success ? formatAmount(success.totals.INR ?? 0, 'INR') : null

  return (
    <div className="space-y-8">
      {/* Welcome banner with the most common actions */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-6 text-white shadow-xl shadow-indigo-600/20 sm:p-8">
        <div className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-indigo-200">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl" data-testid="greeting">
              {greeting()}, {user.first_name || user.username}
            </h1>
            <p className="mt-2 max-w-md text-indigo-100">Everything you need is one click away: pay, manage cards or check your history.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to={PATHS.payment} variant="secondary" icon={SendIcon} className="!text-indigo-700 !ring-0">
              Make a payment
            </ButtonLink>
            <ButtonLink to={PATHS.cards} icon={PlusIcon} className="!from-white/15 !to-white/10 !shadow-none !ring-white/25 hover:!from-white/25 hover:!to-white/20">
              Add a card
            </ButtonLink>
            <ButtonLink to={PATHS.transactions} icon={ReceiptIcon} className="!from-white/15 !to-white/10 !shadow-none !ring-white/25 hover:!from-white/25 hover:!to-white/20">
              View history
            </ButtonLink>
          </div>
        </div>
      </section>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CardIcon} tone="indigo" label="Saved cards" value={cards?.length} hint="Manage cards" to={PATHS.cards} testId="stat-cards" />
        <StatCard icon={ReceiptIcon} tone="sky" label="Transactions" value={recent?.count} hint="View history" to={PATHS.transactions} testId="stat-transactions" />
        <StatCard icon={CheckCircleIcon} tone="emerald" label="Successful payments" value={success?.count} hint="See payments" to={`${PATHS.transactions}?status=SUCCESS`} testId="stat-success" />
        <StatCard icon={WalletIcon} tone="violet" label="Total paid" value={inr} hint="Successful, all time" to={`${PATHS.transactions}?status=SUCCESS`} testId="stat-total-paid" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Recent transactions" action={<PanelLink to={PATHS.transactions}>View all</PanelLink>}>
            {!recent ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
              </div>
            ) : recent.results.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-slate-500">No payments yet.</p>
                <ButtonLink to={PATHS.payment} size="sm" icon={SendIcon} className="mt-3">
                  Make your first payment
                </ButtonLink>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100" data-testid="recent-transactions">
                {recent.results.map((t) => (
                  <li key={t.reference} className="flex items-center gap-4 px-5 py-3.5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                      <ReceiptIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{t.description || 'Payment'}</p>
                      <p className="truncate text-xs text-slate-500">
                        {formatDateTime(t.created_at)} · {t.masked_card.slice(-9)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatAmount(t.amount, t.currency)}</p>
                      <StatusBadge status={t.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Your cards" action={<PanelLink to={PATHS.cards}>Manage</PanelLink>}>
            {!cards ? (
              <div className="h-24 animate-pulse" />
            ) : cards.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-slate-500">No saved cards yet.</p>
                <ButtonLink to={PATHS.cards} size="sm" variant="soft" icon={PlusIcon} className="mt-3">
                  Save a card
                </ButtonLink>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cards.slice(0, 4).map((c) => {
                  const brand = BRANDS[c.card_type] ?? { label: c.card_type, gradient: 'from-slate-600 to-slate-800' }
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                      <span className={`h-8 w-12 shrink-0 rounded-md bg-gradient-to-br ${brand.gradient}`} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{brand.label}</p>
                        <p className="font-mono text-xs text-slate-500">•••• {c.last4}</p>
                      </div>
                      <Link
                        to={`${PATHS.payment}?card=${c.id}`}
                        className="rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                        aria-label={`Pay with ${brand.label} ending in ${c.last4}`}
                      >
                        Pay
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
          <ApiStatus />
        </div>
      </div>
    </div>
  )
}
