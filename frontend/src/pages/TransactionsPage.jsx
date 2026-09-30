import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  ReceiptIcon,
  RefreshIcon,
  SearchIcon,
  SendIcon,
  XCircleIcon,
} from '../components/icons.jsx'
import PageHeader from '../components/layout/PageHeader.jsx'
import Pagination from '../components/transactions/Pagination.jsx'
import TransactionDetails from '../components/transactions/TransactionDetails.jsx'
import TransactionFilters from '../components/transactions/TransactionFilters.jsx'
import TransactionList, { TransactionListSkeleton } from '../components/transactions/TransactionList.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button, { ButtonLink } from '../components/ui/Button.jsx'
import { buttonClasses } from '../components/ui/buttonStyles.js'
import EmptyState from '../components/ui/EmptyState.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import useAuth from '../hooks/useAuth.js'
import useToast from '../hooks/useToast.js'
import useTransactions from '../hooks/useTransactions.js'
import { PATHS } from '../routes/paths.js'
import { DJANGO_ADMIN_URL } from '../services/config.js'
import { paymentService } from '../services/paymentApi.js'
import { fieldErrors, generalMessage } from '../utils/errors.js'
import { looksLikeCardNumber } from '../utils/payments.js'
import { buildQuery, EMPTY_FILTERS, hasActiveFilters, readQuery } from '../utils/transactions.js'

const STATUS_CHIPS = [
  { value: '', label: 'All', icon: ReceiptIcon, active: 'bg-indigo-600 text-white ring-indigo-600' },
  { value: 'SUCCESS', label: 'Successful', icon: CheckCircleIcon, active: 'bg-emerald-600 text-white ring-emerald-600' },
  { value: 'FAILED', label: 'Failed', icon: XCircleIcon, active: 'bg-red-600 text-white ring-red-600' },
  { value: 'PENDING', label: 'Pending', icon: ClockIcon, active: 'bg-amber-500 text-white ring-amber-500' },
]

// Client-side "find" over the rows already on screen (there is no search API).
function matches(t, term) {
  const q = term.toLowerCase()
  return [t.reference, t.description, t.masked_card.slice(-4), t.amount, t.status].some((v) =>
    String(v ?? '').toLowerCase().includes(q),
  )
}

// Loads one transaction for ?ref=... when it is not among the rows on screen
// (e.g. opened from a notification), with the existing GET /api/payments/{reference}.
function useReferencedTransaction(reference, rows) {
  const { authRequest } = useAuth()
  const [fetched, setFetched] = useState({ reference: null, data: null, error: null })
  const onScreen = reference && rows ? rows.find((t) => t.reference === reference) : null

  useEffect(() => {
    if (!reference || onScreen || !rows) return undefined
    let active = true
    authRequest((token) => paymentService.get(reference, token))
      .then((data) => active && setFetched({ reference, data, error: null }))
      .catch((error) => {
        if (!active || error.status === 401) return
        const message = error.status === 404 ? 'No transaction with this ID was found in your account.' : generalMessage(error)
        setFetched({ reference, data: null, error: message })
      })
    return () => {
      active = false
    }
  }, [authRequest, reference, onScreen, rows])

  if (!reference) return null
  if (onScreen) return { data: onScreen, error: null, loading: false }
  const current = fetched.reference === reference
  return { data: current ? fetched.data : null, error: current ? fetched.error : null, loading: !current }
}

export default function TransactionsPage() {
  const { user } = useAuth()
  const { notify } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const { filters, page, pageSize } = readQuery(searchParams)
  const reference = searchParams.get('ref')
  const { data, loading, error, reload } = useTransactions({ filters, page, pageSize })
  const [find, setFind] = useState('')

  const navigate = (next) => setSearchParams(buildQuery({ filters, page, pageSize, ...next }))
  const filtered = hasActiveFilters(filters)

  // A stale URL can point past the last page (e.g. after filtering): go back to page 1.
  const pageOutOfRange = error?.status === 404 && page > 1
  useEffect(() => {
    if (pageOutOfRange) setSearchParams(buildQuery({ filters, page: 1, pageSize }), { replace: true })
  }, [pageOutOfRange, filters, pageSize, setSearchParams])

  const invalidFilters = error?.status === 400 ? fieldErrors(error) : {}
  const hardError = error && error.status !== 400 && !pageOutOfRange

  // A full card number is never used as a search term, not even locally.
  const unsafeFind = looksLikeCardNumber(find)
  const findTerm = unsafeFind ? '' : find.trim()
  const visible = useMemo(
    () => (data && findTerm ? data.results.filter((t) => matches(t, findTerm)) : (data?.results ?? [])),
    [data, findTerm],
  )

  const detail = useReferencedTransaction(reference, data?.results)
  const setRef = (value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('ref', value)
    else next.delete('ref')
    setSearchParams(next)
  }

  function clearFilters() {
    setFind('')
    navigate({ filters: EMPTY_FILTERS, page: 1 })
    notify('Filters cleared.', { variant: 'info' })
  }

  return (
    <section>
      <PageHeader
        eyebrow="Activity"
        title="Transactions"
        description="Your payment history. Card numbers are always masked."
        actions={
          <>
            <Button
              variant="secondary"
              icon={RefreshIcon}
              onClick={reload}
              loading={loading && Boolean(data)}
              loadingText="Updating…"
            >
              Refresh
            </Button>
            {user.is_staff && (
              // CSV export exists only in the Django admin, so it is offered to staff only.
              <a
                href={`${DJANGO_ADMIN_URL}payments/payment/`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({ variant: 'secondary' })}
              >
                <DownloadIcon className="h-4.5 w-4.5" />
                Export CSV (admin)
              </a>
            )}
            <ButtonLink to={PATHS.payment} icon={SendIcon}>
              New payment
            </ButtonLink>
          </>
        }
      />

      {/* One-click status filter; the form below has amount and date filters too. */}
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Quick filter">
        {STATUS_CHIPS.map(({ value, label, icon: Icon, active: activeClass }) => {
          const active = filters.status === value
          return (
            <button
              key={label}
              type="button"
              aria-pressed={active}
              onClick={() => navigate({ filters: { ...filters, status: value }, page: 1 })}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition ring-inset ${
                active ? activeClass : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          )
        })}
      </div>

      {/* The form is re-created only when the applied filters change (not on page changes). */}
      <div className="mt-4">
        <TransactionFilters
          key={buildQuery({ filters }).toString()}
          initial={filters}
          serverErrors={invalidFilters}
          canReset={filtered}
          onApply={(next) => navigate({ filters: next, page: 1 })}
          onReset={clearFilters}
        />
      </div>

      <div className="mt-6 space-y-4">
        {Object.keys(invalidFilters).length > 0 && (
          <Alert variant="error">Some filters are invalid. Please correct them and apply again.</Alert>
        )}

        {data && data.count > 0 && !hardError && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
              <label htmlFor="find-on-page" className="sr-only">
                Find on this page
              </label>
              <input
                id="find-on-page"
                type="search"
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Find by ID, note or last 4 digits…"
                autoComplete="off"
                className="h-10 w-full rounded-2xl border border-slate-300 bg-white pr-3 pl-10 text-sm shadow-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none"
              />
            </div>
            <p className="text-xs text-slate-500" aria-live="polite">
              {unsafeFind
                ? 'Use only the last 4 digits of a card.'
                : findTerm
                  ? `${visible.length} of ${data.results.length} rows on this page match.`
                  : 'Find looks through the rows on this page. Use the filters for your full history.'}
            </p>
          </div>
        )}

        {hardError ? (
          <ErrorState message={generalMessage(error, 'Could not load your transactions.')} onRetry={reload} />
        ) : !data || (loading && !data) ? (
          !Object.keys(invalidFilters).length && <TransactionListSkeleton />
        ) : data.count === 0 ? (
          filtered ? (
            <EmptyState
              icon={ReceiptIcon}
              tone="slate"
              title="No transactions match your filters"
              testId="transactions-empty"
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            >
              Try a wider date range or amount, or clear the filters.
            </EmptyState>
          ) : (
            <EmptyState
              icon={ReceiptIcon}
              title="No transactions yet"
              testId="transactions-empty"
              action={
                <ButtonLink to={PATHS.payment} icon={SendIcon}>
                  Make a payment
                </ButtonLink>
              }
            >
              No transactions found. Payments you make will appear here.
            </EmptyState>
          )
        ) : (
          <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={loading}>
            {visible.length === 0 ? (
              <EmptyState
                icon={SearchIcon}
                tone="slate"
                title="No rows on this page match"
                action={
                  <Button variant="secondary" onClick={() => setFind('')}>
                    Clear find
                  </Button>
                }
              >
                Try another reference, note or last 4 digits.
              </EmptyState>
            ) : (
              <TransactionList transactions={visible} onView={(t) => setRef(t.reference)} />
            )}
            <div className="mt-4">
              <Pagination
                page={page}
                pageSize={pageSize}
                count={data.count}
                onPageChange={(next) => navigate({ page: next })}
                onPageSizeChange={(size) => navigate({ pageSize: size, page: 1 })}
              />
            </div>
          </div>
        )}
      </div>

      <TransactionDetails
        open={Boolean(reference)}
        transaction={detail?.data}
        loading={detail?.loading}
        error={detail?.error}
        onClose={() => setRef(null)}
      />
    </section>
  )
}
