import { Link } from 'react-router-dom'

import { PATHS } from '../../routes/paths.js'
import { formatAmount, formatDateTime } from '../../utils/format.js'
import { CheckCircleIcon, ClockIcon, XCircleIcon } from '../icons.jsx'

const KIND = {
  SUCCESS: { icon: CheckCircleIcon, tone: 'bg-emerald-50 text-emerald-600', type: 'Payment successful', verb: 'was successful' },
  FAILED: { icon: XCircleIcon, tone: 'bg-red-50 text-red-600', type: 'Payment failed', verb: 'failed' },
  PENDING: { icon: ClockIcon, tone: 'bg-amber-50 text-amber-600', type: 'Payment pending', verb: 'is pending' },
}

// One notification: a payment result, linking to its transaction details.
export default function ActivityItem({ item, isNew, onOpen, compact = false }) {
  const kind = KIND[item.status] ?? KIND.PENDING
  const Icon = kind.icon
  return (
    <Link
      to={`${PATHS.transactions}?ref=${encodeURIComponent(item.reference)}`}
      onClick={onOpen}
      className={`group flex gap-3 rounded-2xl transition hover:bg-slate-50 ${compact ? 'p-2.5' : 'p-4'}`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${kind.tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{kind.type}</span>
          {isNew && (
            <span className="rounded-full bg-indigo-600 px-1.5 py-px text-[10px] font-bold tracking-wide text-white uppercase">
              New
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-sm text-slate-800">
          Your payment of <span className="font-semibold tabular-nums">{formatAmount(item.amount, item.currency)}</span> with card ending{' '}
          {item.masked_card.slice(-4)} {kind.verb}
          {item.status === 'FAILED' && item.failure_reason ? `: ${item.failure_reason}` : '.'}
        </span>
        <span className="mt-1 block text-xs text-slate-500">
          <time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time>
          {item.description && ` · ${item.description}`}
        </span>
      </span>
    </Link>
  )
}
