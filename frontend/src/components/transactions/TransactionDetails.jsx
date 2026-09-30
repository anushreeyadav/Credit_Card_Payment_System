import { useState } from 'react'

import { BRANDS } from '../../utils/cards.js'
import { formatAmount } from '../../utils/format.js'
import { ArrowLeftIcon, CheckCircleIcon, ClockIcon, CopyIcon, XCircleIcon } from '../icons.jsx'
import StatusBadge from '../payments/StatusBadge.jsx'
import Button from '../ui/Button.jsx'
import Modal from '../ui/Modal.jsx'
import Skeleton from '../ui/Skeleton.jsx'

const HEADLINE = {
  SUCCESS: { icon: CheckCircleIcon, tone: 'bg-emerald-50 text-emerald-600', text: 'This payment was successful.' },
  FAILED: { icon: XCircleIcon, tone: 'bg-red-50 text-red-600', text: 'This payment failed. No money was taken.' },
  PENDING: { icon: ClockIcon, tone: 'bg-amber-50 text-amber-600', text: 'This payment is still being processed.' },
}

const dateOnly = (iso) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
const timeOnly = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' })

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium break-words text-slate-900">{children}</dd>
    </div>
  )
}

// Drawer with one transaction's safe details (the same fields the API returns:
// masked card only - never a full number, security code or token).
// `transaction` null + `loading` shows a skeleton; `error` a message.
export default function TransactionDetails({ open, transaction, loading, error, onClose, showUser = false }) {
  const [copied, setCopied] = useState(false)
  const t = transaction
  const head = t ? HEADLINE[t.status] ?? HEADLINE.PENDING : null

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(t.reference)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="drawer"
      size="sm:max-w-md"
      title="Transaction details"
      description={t ? t.reference : 'Loading…'}
      footer={
        <Button variant="secondary" icon={ArrowLeftIcon} onClick={onClose} className="w-full">
          Back to transactions
        </Button>
      }
    >
      {error ? (
        <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : loading || !t ? (
        <div className="space-y-4" role="status" aria-label="Loading transaction">
          <Skeleton className="h-28 w-full rounded-3xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <div data-testid="transaction-details">
          <div className="rounded-3xl bg-gradient-to-br from-slate-50 to-indigo-50/60 p-5 text-center ring-1 ring-slate-200/70">
            <span className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl ${head.tone}`}>
              <head.icon className="h-6 w-6" />
            </span>
            <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums">{formatAmount(t.amount, t.currency)}</p>
            <p className="mt-1 text-sm text-slate-600">{head.text}</p>
          </div>

          <dl className="mt-4 divide-y divide-slate-100">
            <Row label="Transaction ID">
              <span className="font-mono text-xs">{t.reference}</span>
              <button
                type="button"
                onClick={copyReference}
                className="ml-2 inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 align-middle text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                aria-label="Copy transaction ID"
              >
                <CopyIcon className="h-3.5 w-3.5" />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </Row>
            <Row label="Amount">{formatAmount(t.amount, t.currency)}</Row>
            <Row label="Payment status">
              <StatusBadge status={t.status} />
            </Row>
            {t.status === 'FAILED' && t.failure_reason && (
              <Row label="Reason">
                <span className="text-red-700">{t.failure_reason}</span>
              </Row>
            )}
            <Row label="Masked card">
              <span className="font-mono">{t.masked_card}</span>
            </Row>
            <Row label="Payment method">Card · {BRANDS[t.card_type]?.label ?? t.card_type}</Row>
            <Row label="Date">{dateOnly(t.created_at)}</Row>
            <Row label="Time">{timeOnly(t.created_at)}</Row>
            {t.updated_at && t.updated_at !== t.created_at && <Row label="Last updated">{timeOnly(t.updated_at)}</Row>}
            <Row label="Currency">{t.currency}</Row>
            {t.description && <Row label="Note">{t.description}</Row>}
            {showUser && t.username && <Row label="Customer">{t.username}</Row>}
          </dl>
        </div>
      )}
    </Modal>
  )
}
