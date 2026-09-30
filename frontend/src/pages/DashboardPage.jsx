import { Link } from 'react-router-dom'

import ApiStatus from '../components/ApiStatus.jsx'
import DonutChart from '../components/charts/DonutChart.jsx'
import CardsWidget from '../components/dashboard/CardsWidget.jsx'
import StatCard from '../components/dashboard/StatCard.jsx'
import {
  ArrowRightIcon,
  CardIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeOffIcon,
  HelpIcon,
  PieIcon,
  PlusIcon,
  ReceiptIcon,
  SendIcon,
  UserIcon,
  WalletIcon,
  XCircleIcon,
} from '../components/icons.jsx'
import StatusBadge from '../components/payments/StatusBadge.jsx'
import { ButtonLink } from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import useAuth from '../hooks/useAuth.js'
import useCards from '../hooks/useCards.js'
import usePreferences from '../hooks/usePreferences.js'
import useTransactionHistory from '../hooks/useTransactionHistory.js'
import { PATHS } from '../routes/paths.js'
import { periodChange, STATUS_COLORS, STATUS_LABELS, STATUSES, statusCounts, paidByCurrency } from '../utils/analytics.js'
import { generalMessage } from '../utils/errors.js'
import { formatAmount, formatDateTime } from '../utils/format.js'

const QUICK_ACTIONS = [
  { to: `${PATHS.cards}?add=1`, label: 'Add New Card', text: 'Save a card securely', icon: PlusIcon, tone: 'from-indigo-500 to-violet-600' },
  { to: PATHS.payment, label: 'Make Payment', text: 'Pay with a saved card', icon: SendIcon, tone: 'from-emerald-500 to-teal-600' },
  { to: PATHS.transactions, label: 'Transaction History', text: 'Search and filter', icon: ReceiptIcon, tone: 'from-sky-500 to-blue-600' },
  { to: PATHS.analytics, label: 'Payment Analytics', text: 'Charts and trends', icon: PieIcon, tone: 'from-fuchsia-500 to-pink-600' },
  { to: PATHS.profile, label: 'Profile', text: 'Your account details', icon: UserIcon, tone: 'from-amber-500 to-orange-600' },
  { to: PATHS.help, label: 'Support', text: 'FAQs and help', icon: HelpIcon, tone: 'from-slate-600 to-slate-800' },
]

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function Panel({ title, icon: Icon, action, children, className = '' }) {
  return (
    <section className={`rounded-3xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          {Icon && <Icon className="h-5 w-5 text-indigo-600" />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function PanelLink({ to, children }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">
      {children} <ArrowRightIcon className="h-4 w-4" />
    </Link>
  )
}

function Trend({ change }) {
  if (!change || (change.current === 0 && change.previous === 0)) return null
  const up = change.delta >= 0
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-semibold ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
      title="Successful payments in the last 7 days compared with the 7 days before"
    >
      {up ? '▲' : '▼'} {Math.abs(change.delta)} vs last week
    </span>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const cardsState = useCards()
  const history = useTransactionHistory()
  const { preferences, setPreference } = usePreferences()

  const data = history.data
  const transactions = data?.transactions ?? []
  const counts = data ? statusCounts(transactions) : null
  const paid = data ? paidByCurrency(transactions) : null
  const change = data ? periodChange(transactions, { days: 7 }) : null
  const recent = transactions.slice(0, 5)
  const hide = preferences.hideAmounts
  const money = (value) => (hide ? '₹ ••••' : value)
  const name = user.first_name || user.username
  const cardCount = cardsState.loading ? null : cardsState.cards.length

  return (
    <div className="space-y-8">
      {/* Welcome banner */}
      <section className="theme-fixed relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-indigo-600/20 sm:p-8">
        <div className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-indigo-900/30 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-indigo-100">
              {greeting()} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-4xl" data-testid="greeting">
              Welcome back, {name}
            </h1>
            <p className="mt-2 text-indigo-100">
              {data && cardCount !== null
                ? `You have ${cardCount} saved ${cardCount === 1 ? 'card' : 'cards'} and ${data.count} ${data.count === 1 ? 'transaction' : 'transactions'}. Everything is one click away.`
                : 'Your cards, payments and history in one place.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to={PATHS.payment} variant="secondary" icon={SendIcon} className="!text-indigo-700 !ring-0">
              Make a payment
            </ButtonLink>
            <ButtonLink to={`${PATHS.cards}?add=1`} icon={PlusIcon} className="!from-white/15 !to-white/10 !shadow-none !ring-white/25 hover:!from-white/25 hover:!to-white/20">
              Add a card
            </ButtonLink>
            <ButtonLink to={PATHS.transactions} icon={ReceiptIcon} className="!from-white/15 !to-white/10 !shadow-none !ring-white/25 hover:!from-white/25 hover:!to-white/20">
              View transactions
            </ButtonLink>
            <ButtonLink to={PATHS.cards} icon={CardIcon} className="!from-white/15 !to-white/10 !shadow-none !ring-white/25 hover:!from-white/25 hover:!to-white/20">
              View cards
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* Statistics */}
      <section aria-labelledby="stats-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="stats-title" className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
            At a glance
          </h2>
          <button
            type="button"
            onClick={() => setPreference('hideAmounts', !hide)}
            aria-pressed={hide}
            className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white hover:text-slate-900"
          >
            {hide ? <EyeIcon className="h-4 w-4" /> : <EyeOffIcon className="h-4 w-4" />}
            {hide ? 'Show amounts' : 'Hide amounts'}
          </button>
        </div>
        {history.error ? (
          <ErrorState message={generalMessage(history.error, 'Could not load your payment statistics.')} onRetry={history.reload} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6 [&>*]:lg:col-span-2 [&>*:nth-child(n+4)]:lg:col-span-3 [&>*:last-child]:sm:col-span-2">
            <StatCard icon={ReceiptIcon} tone="sky" label="Total transactions" value={data?.count} hint="View history" to={PATHS.transactions} testId="stat-transactions" />
            <StatCard
              icon={CheckCircleIcon}
              tone="emerald"
              label="Successful payments"
              value={counts?.SUCCESS}
              hint="See payments"
              to={`${PATHS.transactions}?status=SUCCESS`}
              testId="stat-success"
              trend={<Trend change={change} />}
            />
            <StatCard icon={XCircleIcon} tone="rose" label="Failed payments" value={counts?.FAILED} hint="See failures" to={`${PATHS.transactions}?status=FAILED`} testId="stat-failed" />
            <StatCard
              icon={WalletIcon}
              tone="violet"
              label="Total paid"
              value={paid ? money(formatAmount(paid.INR ?? 0, 'INR')) : null}
              hint="Successful, all time"
              to={PATHS.analytics}
              testId="stat-total-paid"
            />
            <StatCard icon={CardIcon} tone="indigo" label="Saved cards" value={cardCount} hint="Manage cards" to={PATHS.cards} testId="stat-cards" />
          </div>
        )}
        {data?.truncated && (
          <p className="mt-2 text-xs text-slate-500">Status totals are based on your latest {transactions.length.toLocaleString('en-IN')} transactions.</p>
        )}
      </section>

      {/* Quick actions */}
      <section aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {QUICK_ACTIONS.map(({ to, label, text, icon: Icon, tone }) => (
            <Link
              key={label}
              to={to}
              className="group flex flex-col items-start gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-500/10"
            >
              <span className={`theme-fixed grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-md transition-transform group-hover:scale-105 ${tone}`}>
                <Icon className="h-6 w-6" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">{label}</span>
                <span className="block text-xs text-slate-500">{text}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Panel title="Recent transactions" icon={ReceiptIcon} action={<PanelLink to={PATHS.transactions}>View all</PanelLink>}>
            {!data && !history.error ? (
              <div className="space-y-4 p-5" aria-label="Loading transactions" role="status">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-2xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </div>
            ) : recent.length === 0 ? (
              <EmptyState
                className="m-5"
                icon={ReceiptIcon}
                title="No transactions yet"
                action={
                  <ButtonLink to={PATHS.payment} size="sm" icon={SendIcon}>
                    Make your first payment
                  </ButtonLink>
                }
              >
                Payments you make will appear here.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100" data-testid="recent-transactions">
                {recent.map((t) => (
                  <li key={t.reference}>
                    <Link
                      to={`${PATHS.transactions}?ref=${encodeURIComponent(t.reference)}`}
                      className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50"
                      aria-label={`${t.description || 'Payment'}, ${formatAmount(t.amount, t.currency)}, ${STATUS_LABELS[t.status] ?? t.status}. View details`}
                    >
                      <span
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white"
                        style={{ backgroundColor: STATUS_COLORS[t.status] ?? '#64748b' }}
                        aria-hidden="true"
                      >
                        <ReceiptIcon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{t.description || 'Payment'}</p>
                        <p className="truncate text-xs text-slate-500">
                          {formatDateTime(t.created_at)} · card ending {t.masked_card.slice(-4)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-900 tabular-nums">{money(formatAmount(t.amount, t.currency))}</p>
                        <StatusBadge status={t.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Payment status overview" icon={PieIcon} action={<PanelLink to={PATHS.analytics}>Analytics</PanelLink>}>
            <div className="p-5">
              {!counts ? (
                <Skeleton className="h-44 w-full" />
              ) : data.count === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No transaction data available yet.</p>
              ) : (
                <DonutChart
                  centerValue={transactions.length}
                  centerLabel="Payments"
                  segments={STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s], value: counts[s], color: STATUS_COLORS[s] }))}
                />
              )}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <CardsWidget {...cardsState} />
          <ApiStatus />
        </div>
      </div>
    </div>
  )
}
