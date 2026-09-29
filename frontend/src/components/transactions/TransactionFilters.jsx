import { useState } from 'react'

import { sanitizeAmountInput } from '../../utils/payments.js'
import { EMPTY_FILTERS, STATUS_OPTIONS, validateFilters } from '../../utils/transactions.js'
import Button from '../ui/Button.jsx'

const inputClass = (error) =>
  `mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:ring-2 focus:outline-none ${
    error ? 'border-red-400 focus:ring-red-500/20' : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/20'
  }`

function Field({ label, htmlFor, error, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-xs font-medium text-slate-600">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

// Draft filters are edited locally and only applied on submit.
// The parent re-mounts this component (via key) when the URL changes.
export default function TransactionFilters({ initial, serverErrors = {}, onApply, onReset, canReset }) {
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState({})
  const shown = { ...serverErrors, ...errors }

  const update = (field, value) => {
    setDraft((d) => ({ ...d, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const found = validateFilters(draft)
    setErrors(found)
    if (!Object.keys(found).length) onApply(draft)
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Filter transactions"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <div className="col-span-2 md:col-span-1">
          <Field label="Status" htmlFor="filter-status" error={shown.status}>
            <select
              id="filter-status"
              value={draft.status}
              onChange={(e) => update('status', e.target.value)}
              className={inputClass(shown.status)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Min amount" htmlFor="filter-min" error={shown.min_amount}>
          <input
            id="filter-min"
            inputMode="decimal"
            placeholder="0.00"
            value={draft.min_amount}
            onChange={(e) => update('min_amount', sanitizeAmountInput(e.target.value))}
            className={inputClass(shown.min_amount)}
          />
        </Field>
        <Field label="Max amount" htmlFor="filter-max" error={shown.max_amount}>
          <input
            id="filter-max"
            inputMode="decimal"
            placeholder="Any"
            value={draft.max_amount}
            onChange={(e) => update('max_amount', sanitizeAmountInput(e.target.value))}
            className={inputClass(shown.max_amount)}
          />
        </Field>
        <Field label="From date" htmlFor="filter-from" error={shown.date_from}>
          <input
            id="filter-from"
            type="date"
            value={draft.date_from}
            max={draft.date_to || undefined}
            onChange={(e) => update('date_from', e.target.value)}
            className={inputClass(shown.date_from)}
          />
        </Field>
        <Field label="To date" htmlFor="filter-to" error={shown.date_to}>
          <input
            id="filter-to"
            type="date"
            value={draft.date_to}
            min={draft.date_from || undefined}
            onChange={(e) => update('date_to', e.target.value)}
            className={inputClass(shown.date_to)}
          />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Dates are calendar days in UTC.</p>
        <div className="flex gap-2">
          {canReset && (
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(EMPTY_FILTERS)
                setErrors({})
                onReset()
              }}
            >
              Clear filters
            </Button>
          )}
          <Button type="submit">Apply filters</Button>
        </div>
      </div>
    </form>
  )
}
