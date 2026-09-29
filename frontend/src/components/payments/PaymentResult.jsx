import { PATHS } from '../../routes/paths.js'
import { formatAmount, formatDateTime } from '../../utils/format.js'
import { AlertIcon, CheckCircleIcon, ReceiptIcon, SendIcon } from '../icons.jsx'
import Button, { ButtonLink } from '../ui/Button.jsx'
import Spinner from '../ui/Spinner.jsx'
import StatusBadge from './StatusBadge.jsx'

const VIEW = {
  SUCCESS: {
    title: 'Payment successful',
    tone: 'bg-emerald-100 text-emerald-600',
    icon: <CheckCircleIcon className="h-8 w-8" />,
  },
  FAILED: {
    title: 'Payment failed',
    tone: 'bg-red-100 text-red-600',
    icon: <AlertIcon className="h-8 w-8" />,
  },
  PENDING: {
    title: 'Payment pending',
    tone: 'bg-amber-100 text-amber-600',
    icon: <Spinner className="h-8 w-8" />,
  },
}

function Row({ label, children, testId }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
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

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8" data-testid="payment-result">
      <span className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${view.tone}`}>{view.icon}</span>
      <h2 className="mt-4 text-xl font-semibold text-slate-900">{view.title}</h2>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums" data-testid="payment-amount">
        {formatAmount(payment.amount, payment.currency)}
      </p>

      {payment.status === 'FAILED' && payment.failure_reason && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="failure-reason">
          {payment.failure_reason}
        </p>
      )}
      {payment.status === 'PENDING' && (
        <p className="mt-3 text-sm text-slate-600">
          The payment is still being processed. Check again in a moment. Do not pay again.
        </p>
      )}

      <dl className="mt-6 divide-y divide-slate-100 border-y border-slate-100 text-left">
        <Row label="Status">
          <StatusBadge status={payment.status} />
        </Row>
        <Row label="Reference ID" testId="payment-reference">
          <span className="font-mono text-xs break-all">{payment.reference}</span>
        </Row>
        <Row label="Card">
          <span className="font-mono">{payment.masked_card}</span>
        </Row>
        {payment.description && <Row label="Note">{payment.description}</Row>}
        <Row label="Date">{formatDateTime(payment.updated_at)}</Row>
      </dl>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {payment.status === 'PENDING' && (
          <Button onClick={onCheckStatus} loading={checking} loadingText="Checking…">
            Check status
          </Button>
        )}
        {payment.status === 'FAILED' && <Button onClick={onRetry} icon={SendIcon}>Try again</Button>}
        {payment.status === 'SUCCESS' && <Button onClick={onNewPayment} icon={SendIcon}>Make another payment</Button>}
        <ButtonLink to={PATHS.transactions} variant="secondary" icon={ReceiptIcon}>
          View transactions
        </ButtonLink>
      </div>
    </div>
  )
}
