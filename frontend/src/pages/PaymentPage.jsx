import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import PageHeader from '../components/layout/PageHeader.jsx'
import CardSelector from '../components/payments/CardSelector.jsx'
import PaymentResult from '../components/payments/PaymentResult.jsx'
import { CardIcon, LockIcon, PlusIcon } from '../components/icons.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button, { ButtonLink } from '../components/ui/Button.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import TextField from '../components/ui/TextField.jsx'
import useAuth from '../hooks/useAuth.js'
import usePaymentCards from '../hooks/usePaymentCards.js'
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

function EmptyCards() {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center" data-testid="no-cards">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-indigo-50 text-indigo-600">
        <CardIcon className="h-6 w-6" />
      </span>
      <h2 className="mt-3 font-semibold text-slate-900">No saved cards</h2>
      <p className="mt-1 text-sm text-slate-600">Add a card before making a payment.</p>
      <ButtonLink to={PATHS.cards} icon={PlusIcon} className="mt-4">
        Add a card
      </ButtonLink>
    </div>
  )
}

export default function PaymentPage() {
  const { authRequest } = useAuth()
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

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
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
        {notice && <Alert variant={notice.variant} className="mx-auto mb-4 max-w-lg">{notice.text}</Alert>}
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
        title="Make a payment"
        description="Pay with one of your saved cards. No CVV needed."
        actions={
          <ButtonLink to={PATHS.cards} variant="secondary" icon={CardIcon}>
            Manage cards
          </ButtonLink>
        }
      />

      {loading ? (
        <div className="mt-8 flex items-center gap-3 text-sm text-slate-500" role="status">
          <Spinner className="h-5 w-5 text-indigo-600" /> Loading your cards…
        </div>
      ) : loadError ? (
        <Alert variant="error" className="mt-6">
          <p>{loadError}</p>
          <button type="button" onClick={reload} className="mt-1 font-semibold underline">
            Try again
          </button>
        </Alert>
      ) : cards.length === 0 ? (
        <EmptyCards />
      ) : (
        <form onSubmit={handleSubmit} noValidate className="mt-6 grid gap-6 lg:grid-cols-5" aria-label="Payment">
          <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-3">
            {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
            {usableCards.length === 0 && (
              <Alert variant="warning">
                All your saved cards have expired. <Link to={PATHS.cards} className="font-semibold underline">Add a new card</Link> to pay.
              </Alert>
            )}

            <CardSelector cards={cards} value={selectedId} onChange={setCardId} error={errors.card_id} />

            <div>
              <label htmlFor="payment-amount" className="text-sm font-medium text-slate-700">
                Amount
              </label>
              <div className="mt-1.5 flex rounded-lg shadow-sm">
                <select
                  aria-label="Currency"
                  value={form.currency}
                  onChange={(e) => update('currency', e.target.value)}
                  className="rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">
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
                    className={`block w-full rounded-r-lg border py-2.5 pr-3.5 pl-8 text-lg font-semibold text-slate-900 tabular-nums placeholder:text-slate-300 focus:ring-2 focus:outline-none ${
                      errors.amount
                        ? 'border-red-400 focus:ring-red-500/20'
                        : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/20'
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
                      className={`rounded-full px-3.5 py-1.5 text-sm font-semibold tabular-nums ring-1 transition ring-inset ${
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

          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-24 lg:col-span-2">
            <h2 className="font-semibold text-slate-900">Summary</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Card</dt>
                <dd className="font-mono text-slate-900" data-testid="summary-card">
                  {selectedCard ? selectedCard.masked_number : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-slate-100 pt-3">
                <dt className="font-medium text-slate-700">Total</dt>
                <dd className="text-lg font-semibold text-slate-900 tabular-nums" data-testid="summary-total">
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
              Pay {Number(form.amount) > 0 ? formatAmount(form.amount, form.currency) : ''}
            </Button>
            {submitting && (
              <p className="mt-3 flex items-center justify-center gap-2 text-xs font-medium text-amber-700" data-testid="pending-indicator">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" /> PENDING · Do not close this page
              </p>
            )}
            <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
              <LockIcon className="mt-px h-4 w-4 shrink-0" />
              Payments are simulated. Only your card's reference is sent — never the card number or CVV.
            </p>
          </aside>
        </form>
      )}
    </section>
  )
}
