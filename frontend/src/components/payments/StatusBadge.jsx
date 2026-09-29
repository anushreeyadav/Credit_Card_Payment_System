const STYLES = {
  SUCCESS: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  FAILED: 'bg-red-50 text-red-700 ring-red-600/20',
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-600/20',
}

const LABELS = { SUCCESS: 'Success', FAILED: 'Failed', PENDING: 'Pending' }

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STYLES[status] ?? 'bg-slate-100 text-slate-700 ring-slate-500/20'}`}
      data-testid="payment-status"
      data-status={status}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {LABELS[status] ?? status}
    </span>
  )
}
