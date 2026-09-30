import { PATHS } from '../../routes/paths.js'
import { BRANDS } from '../../utils/cards.js'
import { formatAmount, formatDateTime } from '../../utils/format.js'
import { AlertIcon, CheckCircleIcon, ReceiptIcon, RefreshIcon, SendIcon } from '../icons.jsx'
import Button, { ButtonLink } from '../ui/Button.jsx'
import Spinner from '../ui/Spinner.jsx'
import StatusBadge from './StatusBadge.jsx'

const VIEW = {
  SUCCESS: {
    title: 'Payment successful',
    message: 'Your payment went through. A record has been added to your transactions.',
    band: 'from-emerald-500 to-teal-600',
    ring: 'ring-emerald-200',
    icon: <CheckCircleIcon className="h-10 w-10" />,
  },
  FAILED: {
    title: 'Payment failed',
    message: 'No money was taken. You can try again with a different amount or card.',
    band: 'from-rose-500 to-red-600',
    ring: 'ring-red-200',
    icon: <AlertIcon className="h-10 w-10" />,
  },
  PENDING: {
    title: 'Payment pending',
    message: 'The payment is still being processed. Check again in a moment. Do not pay again.',
    band: 'from-amber-400 to-orange-500',
    ring: 'ring-amber-200',
    icon: <Spinner className="h-10 w-10" />,
  },
}

function Row({ label, children, testId }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900" data-testid={testId}>
        {children}
      </dd>
    </div>
  )
}

// Final (or still-pending) payment as returned by FastAPI.
export default function PaymentResult({ payment, onNewPayment, onRetry, onCheckStatus, checking }) {
  const view = VIEW[payment.status] ?? VIEW.PENDING
  const detailsLink = `${PATHS.transactions}?ref=${encodeURIComponent(payment.reference)}`

  return (
    <div className="modal-in mx-auto max-w-lg overflow-hidden rounded-[2rem] border border-slate-200 bg-white text-center shadow-xl shadow-slate-900/5" data-testid="payment-result">
      <div className={`relative bg-gradient-to-br px-6 pt-8 pb-14 text-white ${view.band}`}>
        <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/15" />
        <span className={`relative mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/20 ring-8 ring-white/10 backdrop-blur`}>
          {view.icon}
        </span>
        <h2 className="relative mt-4 text-2xl font-bold">{view.title}</h2>
        <p className="relative mx-auto mt-1 max-w-sm text-sm text-white/85">{view.message}</p>
      </div>

      <div className="relative -mt-8 px-6 pb-6 sm:px-8 sm:pb-8">
        <div className={`rounded-3xl bg-white p-5 shadow-lg ring-1 ${view.ring}`}>
          <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Amount</p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900 tabular-nums" data-testid="payment-amount">
            {formatAmount(payment.amount, payment.currency)}
          </p>
          {payment.status === 'FAILED' && payment.failure_reason && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700" data-testid="failure-reason">
              {payment.failure_reason}
            </p>
          )}
        </div>

        <dl className="mt-5 divide-y divide-slate-100 text-left">
          <Row label="Status">
            <StatusBadge status={payment.status} />
          </Row>
          <Row label="Transaction ID" testId="payment-reference">
            <span className="font-mono text-xs break-all">{payment.reference}</span>
          </Row>
          <Row label="Card">
            <span className="font-mono">{payment.masked_card}</span>
            {BRANDS[payment.card_type] && <span className="block text-xs font-normal text-slate-500">{BRANDS[payment.card_type].label}</span>}
          </Row>
          {payment.description && <Row label="Note">{payment.description}</Row>}
          <Row label="Date & time">{formatDateTime(payment.updated_at)}</Row>
        </dl>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {payment.status === 'PENDING' && (
            <Button onClick={onCheckStatus} loading={checking} loadingText="Checking…" icon={RefreshIcon}>
              Check status
            </Button>
          )}
          {payment.status === 'FAILED' && (
            <Button onClick={onRetry} icon={SendIcon}>
              Try again
            </Button>
          )}
          {payment.status === 'SUCCESS' && (
            <Button onClick={onNewPayment} icon={SendIcon}>
              Make another payment
            </Button>
          )}
          <ButtonLink to={PATHS.transactions} variant="secondary" icon={ReceiptIcon}>
            View transactions
          </ButtonLink>
        </div>
        <ButtonLink to={detailsLink} variant="ghost" size="sm" className="mt-3">
          Open this transaction's details
        </ButtonLink>
      </div>
    </div>
  )
}
