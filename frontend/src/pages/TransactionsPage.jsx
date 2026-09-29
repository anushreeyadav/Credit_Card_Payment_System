import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

import { CheckCircleIcon, ClockIcon, ReceiptIcon, SendIcon, XCircleIcon } from '../components/icons.jsx'
import PageHeader from '../components/layout/PageHeader.jsx'
import Pagination from '../components/transactions/Pagination.jsx'
import TransactionFilters from '../components/transactions/TransactionFilters.jsx'
import TransactionList, { TransactionListSkeleton } from '../components/transactions/TransactionList.jsx'
import Alert from '../components/ui/Alert.jsx'
import { ButtonLink } from '../components/ui/Button.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import useTransactions from '../hooks/useTransactions.js'
import { PATHS } from '../routes/paths.js'
import { fieldErrors, generalMessage } from '../utils/errors.js'
import { buildQuery, EMPTY_FILTERS, hasActiveFilters, readQuery } from '../utils/transactions.js'

const STATUS_CHIPS = [
  { value: '', label: 'All', icon: ReceiptIcon, active: 'bg-slate-900 text-white ring-slate-900' },
  { value: 'SUCCESS', label: 'Successful', icon: CheckCircleIcon, active: 'bg-emerald-600 text-white ring-emerald-600' },
  { value: 'FAILED', label: 'Failed', icon: XCircleIcon, active: 'bg-red-600 text-white ring-red-600' },
  { value: 'PENDING', label: 'Pending', icon: ClockIcon, active: 'bg-amber-500 text-white ring-amber-500' },
]

function EmptyState({ filtered, onClear }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center" data-testid="transactions-empty">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-indigo-50 text-indigo-600">
        <ReceiptIcon className="h-6 w-6" />
      </span>
      {filtered ? (
        <>
          <h2 className="mt-3 font-semibold text-slate-900">No transactions match your filters</h2>
          <p className="mt-1 text-sm text-slate-600">Try a wider date range or amount, or clear the filters.</p>
          <button type="button" onClick={onClear} className="mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-500">
            Clear filters
          </button>
        </>
      ) : (
        <>
          <h2 className="mt-3 font-semibold text-slate-900">No transactions yet</h2>
          <p className="mt-1 text-sm text-slate-600">Payments you make will appear here.</p>
          <ButtonLink to={PATHS.payment} icon={SendIcon} className="mt-4">
            Make a payment
          </ButtonLink>
        </>
      )}
    </div>
  )
}

export default function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { filters, page, pageSize } = readQuery(searchParams)
  const { data, loading, error, reload } = useTransactions({ filters, page, pageSize })

  const navigate = (next) => setSearchParams(buildQuery({ filters, page, pageSize, ...next }))
  const filtered = hasActiveFilters(filters)

  // A stale URL can point past the last page (e.g. after filtering): go back to page 1.
  const pageOutOfRange = error?.status === 404 && page > 1
  useEffect(() => {
    if (pageOutOfRange) setSearchParams(buildQuery({ filters, page: 1, pageSize }), { replace: true })
  }, [pageOutOfRange, filters, pageSize, setSearchParams])

  const invalidFilters = error?.status === 400 ? fieldErrors(error) : {}
  const hardError = error && error.status !== 400 && !pageOutOfRange

  return (
    <section>
      <PageHeader
        title="Transactions"
        description="Your payment history. Card numbers are always masked."
        actions={
          <>
            {loading && data && (
              <span className="flex items-center gap-2 text-sm text-slate-500" role="status">
                <Spinner /> Updating…
              </span>
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

      <div className="mt-4">
        <TransactionFilters
          key={searchParams.toString()}
          initial={filters}
          serverErrors={invalidFilters}
          canReset={filtered}
          onApply={(next) => navigate({ filters: next, page: 1 })}
          onReset={() => navigate({ filters: EMPTY_FILTERS, page: 1 })}
        />
      </div>

      <div className="mt-6 space-y-4">
        {Object.keys(invalidFilters).length > 0 && (
          <Alert variant="error">Some filters are invalid. Please correct them and apply again.</Alert>
        )}

        {hardError ? (
          <Alert variant="error">
            <p>{generalMessage(error, 'Could not load your transactions.')}</p>
            <button type="button" onClick={reload} className="mt-1 font-semibold underline">
              Try again
            </button>
          </Alert>
        ) : !data || (loading && !data) ? (
          !Object.keys(invalidFilters).length && <TransactionListSkeleton />
        ) : data.count === 0 ? (
          <EmptyState filtered={filtered} onClear={() => navigate({ filters: EMPTY_FILTERS, page: 1 })} />
        ) : (
          <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={loading}>
            <TransactionList transactions={data.results} />
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
    </section>
  )
}
