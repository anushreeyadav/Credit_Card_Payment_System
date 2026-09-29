import { useState } from 'react'

import { looksLikeCardNumber, sanitizeAmountInput } from '../../utils/payments.js'
import Button from '../ui/Button.jsx'

const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none'

// fields: [{ name, label, type: 'search' | 'select' | 'date' | 'amount', options?, placeholder? }]
// Values are applied together on submit (or Enter), never on every keystroke.
export default function FilterBar({ fields, initial, onApply, onReset }) {
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState(null)
  const active = Object.values(initial).some(Boolean)

  const set = (name, value) => {
    setDraft((d) => ({ ...d, [name]: value }))
    setError(null)
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        // Search terms travel in the URL and end up in server access logs,
        // so a full card number must never be sent.
        const searched = fields.filter((f) => f.type === 'search').map((f) => draft[f.name])
        if (searched.some(looksLikeCardNumber)) {
          setError('Do not search with a full card number. Use the last 4 digits instead.')
          return
        }
        onApply(draft)
      }}
      className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      aria-label="Filters"
    >
      {fields.map((field) => (
        <label
          key={field.name}
          className={`text-xs font-medium text-slate-600 ${field.type === 'search' ? 'min-w-56 flex-[2]' : 'min-w-36 flex-1'}`}
        >
          {field.label}
          {field.type === 'select' ? (
            <select value={draft[field.name]} onChange={(e) => set(field.name, e.target.value)} className={inputClass}>
              {field.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.type === 'date' ? 'date' : field.type === 'search' ? 'search' : 'text'}
              inputMode={field.type === 'amount' ? 'decimal' : undefined}
              placeholder={field.placeholder}
              value={draft[field.name]}
              onChange={(e) =>
                set(field.name, field.type === 'amount' ? sanitizeAmountInput(e.target.value) : e.target.value)
              }
              className={inputClass}
            />
          )}
        </label>
      ))}
      {error && (
        <p className="w-full text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {active && (
          <Button variant="secondary" onClick={onReset}>
            Clear
          </Button>
        )}
        <Button type="submit">Apply</Button>
      </div>
    </form>
  )
}
