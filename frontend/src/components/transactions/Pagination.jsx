import { PAGE_SIZES } from '../../utils/transactions.js'

const buttonClass =
  'rounded-lg px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 ring-inset hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

export default function Pagination({ page, pageSize, count, onPageChange, onPageSizeChange }) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const first = count === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, count)

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-sm text-slate-600" data-testid="pagination-summary">
        Showing <span className="font-medium text-slate-900">{first}</span>–
        <span className="font-medium text-slate-900">{last}</span> of{' '}
        <span className="font-medium text-slate-900">{count}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Per page
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={buttonClass} onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Previous
        </button>
        <span className="px-1 text-sm text-slate-600" aria-current="page">
          Page {page} of {totalPages}
        </span>
        <button type="button" className={buttonClass} onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          Next
        </button>
      </div>
    </nav>
  )
}
