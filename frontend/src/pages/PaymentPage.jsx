import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { CardIcon, CheckCircleIcon, LockIcon, PlusIcon, RefreshIcon, SendIcon, ShieldIcon, WalletIcon } from '../components/icons.jsx'
import PageHeader from '../components/layout/PageHeader.jsx'
import CardSelector from '../components/payments/CardSelector.jsx'
import PaymentResult from '../components/payments/PaymentResult.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button, { ButtonLink } from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import TextField from '../components/ui/TextField.jsx'
import useAuth from '../hooks/useAuth.js'
import usePaymentCards from '../hooks/usePaymentCards.js'
import useToast from '../hooks/useToast.js'
import { PATHS } from '../routes/paths.js'
import { paymentService } from '../services/paymentApi.js'
import { isExpired } from '../utils/cards.js'
import { fieldErrors, generalMessage } from '../utils/errors.js'
import { formatAmount } from '../utils/format.js'
import { CURRENCIES, MAX_DESCRIPTION, sanitizeAmountInput, toAmountString, validatePayment } from '../utils/payments.js'

const EMPTY_FORM = { amount: '', currency: 'INR', description: '' }
const QUICK_AMOUNTS = [500, 1000, 2500, 5000]

// Messages for errors where the payment outcome is known or unknown.
function describeFailure(error) {
  if (error.status === 0) {
    // The request may or may not have reached the server - never suggest paying blindly again.
    return {
      variant: 'warning',
      text: 'We could not confirm your payment because of a network problem. Check Transactions before trying again.',
    }
  }
  if (error.status === 404) return { variant: 'error', text: 'That card is no longer available. Choose another card.' }
  if (error.status >= 500) {
    return {
      variant: 'warning',
      text: 'The payment service had a problem. The payment may be pending - check Transactions before trying again.',
    }
  }
  return { variant: 'error', text: generalMessage(error, 'The payment could not be submitted.') }
}

// Progress: 1 choose a card, 2 enter an amount, 3 review and pay.
function Steps({ cardDone, amountDone }) {
  const steps = [
    { label: 'Select card', done: cardDone },
    { label: 'Enter amount', done: amountDone },
    { label: 'Review & pay', done: false },
  ]
  const current = steps.findIndex((s) => !s.done)
  const progress = Math.round((steps.filter((s) => s.done).length / steps.length) * 100)
  return (
    <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <ol className="grid grid-cols-3 gap-2" aria-label="Payment progress">
        {steps.map((step, i) => (
          <li key={step.label} className="flex items-center gap-2.5" aria-current={i === current ? 'step' : undefined}>
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold transition ${
                step.done
                  ? 'bg-emerald-500 text-white'
                  : i === current
                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {step.done ? <CheckCircleIcon className="h-5 w-5" /> : i + 1}
            </span>
            <span className={`hidden text-sm font-medium sm:block ${i === current ? 'text-slate-900' : 'text-slate-500'}`}>
              {step.label}
              {step.done && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300" style={{ width: `${Math.max(progress, 8)}%` }} />
      </div>
    </div>
  )
}

function SectionTitle({ number, children, hint }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-700">{number}</span>
      <div>
        <h2 className="font-semibold text-slate-900">{children}</h2>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  )
}

export default function PaymentPage() {
  const { authRequest } = useAuth()
  const { notify } = useToast()
  const navigate = useNavigate()
  const { cards, loading, error: loadError, reload } = usePaymentCards()

  const [searchParams] = useSearchParams()
  const [cardId, setCardId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [payment, setPayment] = useState(null)
  const [checking, setChecking] = useState(false)

  const usableCards = cards.filter((card) => !isExpired(card))
  // A "Pay" button elsewhere can preselect a card with ?card=<id>; otherwise the
  // first usable card, until the user picks one.
  const requested = usableCards.find((card) => String(card.id) === searchParams.get('card'))
  const selectedId = cardId ?? requested?.id ?? usableCards[0]?.id ?? null
  const selectedCard = cards.find((card) => card.id === selectedId)
  const currency = CURRENCIES.find((c) => c.code === form.currency)
  const amountValid = Number(form.amount) > 0 && !validatePayment({ cardId: selectedId, ...form }).amount

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setErrors({})
    setNotice(null)
    setCardId(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return
    setNotice(null)
    const clientErrors = validatePayment({ cardId: selectedId, ...form })
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length) return

    setSubmitting(true)
    try {
      const result = await authRequest((token) =>
        paymentService.create(
          {
            card_id: selectedId,
            amount: toAmountString(form.amount),
            currency: form.currency,
            description: form.description.trim(),
          },
          token,
        ),
      )
      setPayment(result)
      if (result.status === 'SUCCESS') notify('Payment submitted successfully.')
    } catch (error) {
      if (error.status === 401) return // session expired: the route guard sends the user to /login
      const server = fieldErrors(error)
      if (error.status === 422 && Object.keys(server).length) {
        setErrors(server)
        setNotice({ variant: 'error', text: 'Please check the payment details.' })
      } else {
        setNotice(describeFailure(error))
        if (error.status === 404) {
          setCardId(null)
          reload()
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function checkStatus() {
    setChecking(true)
    try {
      setPayment(await authRequest((token) => paymentService.get(payment.reference, token)))
    } catch (error) {
      if (error.status !== 401) setNotice(describeFailure(error))
    } finally {
      setChecking(false)
    }
  }

  function startOver({ keepForm }) {
    setPayment(null)
    setNotice(null)
    if (!keepForm) setForm(EMPTY_FORM)
  }

  if (payment) {
    return (
      <section>
        <h1 className="sr-only">Payment result</h1>
        {notice && (
          <Alert variant={notice.variant} className="mx-auto mb-4 max-w-lg">
            {notice.text}
          </Alert>
        )}
        <PaymentResult
          payment={payment}
          checking={checking}
          onCheckStatus={checkStatus}
          onNewPayment={() => startOver({ keepForm: false })}
          onRetry={() => startOver({ keepForm: true })}
        />
      </section>
    )
  }

  return (
    <section>
      <PageHeader
        eyebrow="Payments"
        title="Make a payment"
        description="Pay securely with one of your saved cards."
        actions={
          <ButtonLink to={PATHS.cards} variant="secondary" icon={CardIcon}>
            Manage cards
          </ButtonLink>
        }
      />

      {loading ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-5" role="status" aria-label="Loading your cards">
          <Skeleton className="h-96 w-full rounded-3xl lg:col-span-3" />
          <Skeleton className="h-72 w-full rounded-3xl lg:col-span-2" />
        </div>
      ) : loadError ? (
        <ErrorState className="mt-6" message={loadError} onRetry={reload} />
      ) : cards.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={CardIcon}
          title="No saved cards"
          testId="no-cards"
          action={
            <ButtonLink to={`${PATHS.cards}?add=1`} icon={PlusIcon}>
              Add a card
            </ButtonLink>
          }
        >
          Add a card before making a payment.
        </EmptyState>
      ) : (
        <>
          <Steps cardDone={Boolean(selectedCard) && usableCards.length > 0} amountDone={amountValid} />

          <form onSubmit={handleSubmit} noValidate className="mt-6 grid gap-6 lg:grid-cols-5" aria-label="Payment">
            <div className="min-w-0 space-y-6 lg:col-span-3">
              {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
              {usableCards.length === 0 && (
                <Alert variant="warning">
                  All your saved cards have expired.{' '}
                  <Link to={`${PATHS.cards}?add=1`} className="font-semibold underline">
                    Add a new card
                  </Link>{' '}
                  to pay.
                </Alert>
              )}

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <SectionTitle number="1" hint="Expired cards cannot be used">
                  Select card
                </SectionTitle>
                <div className="mt-4">
                  <CardSelector cards={cards} value={selectedId} onChange={setCardId} error={errors.card_id} />
                </div>
              </div>

              <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <SectionTitle number="2" hint="Up to 2 decimal places">
                  Payment amount
                </SectionTitle>
                <div>
                  <label htmlFor="payment-amount" className="text-sm font-medium text-slate-700">
                    Amount
                  </label>
                  <div className="mt-1.5 flex rounded-2xl shadow-sm">
                    <select
                      aria-label="Currency"
                      value={form.currency}
                      onChange={(e) => update('currency', e.target.value)}
                      className="rounded-l-2xl border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-lg font-semibold text-slate-400">
                        {currency.symbol}
                      </span>
                      <input
                        id="payment-amount"
                        name="amount"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        value={form.amount}
                        onChange={(e) => update('amount', sanitizeAmountInput(e.target.value))}
                        aria-invalid={errors.amount ? true : undefined}
                        aria-describedby={errors.amount ? 'payment-amount-error' : undefined}
                        className={`block w-full rounded-r-2xl border py-3 pr-4 pl-9 text-2xl font-bold text-slate-900 tabular-nums placeholder:text-slate-300 focus:ring-4 focus:outline-none ${
                          errors.amount
                            ? 'border-red-400 focus:ring-red-500/15'
                            : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15'
                        }`}
                      />
                    </div>
                  </div>
                  {errors.amount && (
                    <p id="payment-amount-error" className="mt-1.5 text-sm text-red-600">
                      {errors.amount}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Preset values">
                    {QUICK_AMOUNTS.map((value) => {
                      const active = Number(form.amount) === value
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => update('amount', String(value))}
                          aria-pressed={active}
                          className={`rounded-full px-4 py-1.5 text-sm font-semibold tabular-nums ring-1 transition ring-inset ${
                            active
                              ? 'bg-indigo-600 text-white ring-indigo-600'
                              : 'bg-white text-slate-700 ring-slate-300 hover:bg-indigo-50 hover:text-indigo-700 hover:ring-indigo-300'
                          }`}
                        >
                          {formatAmount(value, form.currency).replace(/\.00$/, '')}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <TextField
                  label="Note"
                  optional
                  name="description"
                  placeholder="e.g. Order #1001"
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  error={errors.description}
                  maxLength={MAX_DESCRIPTION}
                />
              </div>
            </div>

            <aside className="h-fit min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-24 lg:col-span-2">
              <div className="theme-fixed bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-950 p-5 text-white sm:p-6">
                <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-indigo-200 uppercase">
                  <WalletIcon className="h-4 w-4" /> 3 · Payment summary
                </p>
                <p className="mt-3 text-sm text-slate-300">You will pay</p>
                <p className="text-3xl font-bold tracking-tight tabular-nums" data-testid="summary-total">
                  {formatAmount(Number(form.amount) > 0 ? form.amount : 0, form.currency)}
                </p>
              </div>
              <div className="p-5 sm:p-6">
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Card</dt>
                    <dd className="font-mono text-slate-900" data-testid="summary-card">
                      {selectedCard ? selectedCard.masked_number : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Amount</dt>
                    <dd className="font-medium text-slate-900 tabular-nums">
                      {formatAmount(Number(form.amount) > 0 ? form.amount : 0, form.currency)}
                    </dd>
                  </div>
                  {form.description.trim() && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Note</dt>
                      <dd className="max-w-48 truncate text-slate-900">{form.description.trim()}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 border-t border-slate-100 pt-3">
                    <dt className="font-semibold text-slate-800">Total</dt>
                    <dd className="text-lg font-bold text-slate-900 tabular-nums">
                      {formatAmount(Number(form.amount) > 0 ? form.amount : 0, form.currency)}
                    </dd>
                  </div>
                </dl>
                <Button
                  type="submit"
                  size="lg"
                  icon={LockIcon}
                  className="mt-6 w-full"
                  loading={submitting}
                  loadingText="Processing payment…"
                  disabled={usableCards.length === 0}
                >
                  Pay {Number(form.amount) > 0 ? formatAmount(form.amount, form.currency) : 'now'}
                </Button>
                {submitting && (
                  <p className="mt-3 flex items-center justify-center gap-2 text-xs font-medium text-amber-700" data-testid="pending-indicator">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" /> PENDING · Do not close this page
                  </p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="secondary" icon={RefreshIcon} onClick={resetForm} disabled={submitting}>
                    Reset
                  </Button>
                  <Button variant="ghost" onClick={() => navigate(PATHS.dashboard)} disabled={submitting}>
                    Cancel
                  </Button>
                </div>
                <p className="mt-5 flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
                  <ShieldIcon className="h-4 w-4 shrink-0 text-emerald-600" />
                  Payments are simulated. Only your saved card's reference is sent, never the card number.
                </p>
                <p className="mt-2 flex items-center gap-2 px-3 text-xs text-slate-400">
                  <SendIcon className="h-3.5 w-3.5 shrink-0" /> Demo rule: amounts above 10,000 are declined as insufficient funds.
                </p>
              </div>
            </aside>
          </form>
        </>
      )}
    </section>
  )
}
