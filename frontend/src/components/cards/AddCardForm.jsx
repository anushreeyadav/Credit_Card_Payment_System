import { useEffect, useRef, useState } from 'react'

import {
  BRANDS,
  detectBrand,
  digitsOnly,
  formatCardNumber,
  formatExpiry,
  parseExpiry,
  validateCardForm,
} from '../../utils/cards.js'
import { fieldErrors, generalMessage } from '../../utils/errors.js'
import { LockIcon } from '../icons.jsx'
import Alert from '../ui/Alert.jsx'
import Button from '../ui/Button.jsx'
import TextField from '../ui/TextField.jsx'

const EMPTY = { number: '', name: '', expiry: '' }

// The full card number exists only in this component's state while typing.
// It is sent once to POST /api/cards/ and cleared immediately after.
// No CVV is collected: it is not needed to save a card.
export default function AddCardForm({ onAdd, onCancel }) {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const mounted = useRef(true)

  // Clear the number from memory if the form is closed mid-entry.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const brand = detectBrand(digitsOnly(values.number))

  function update(field, value) {
    setValues((v) => ({ ...v, [field]: value }))
    setErrors((e) => ({ ...e, [field === 'number' ? 'card_number' : field === 'name' ? 'cardholder_name' : 'expiry']: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)
    const clientErrors = validateCardForm(values)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length) return

    const expiry = parseExpiry(values.expiry)
    setSubmitting(true)
    try {
      await onAdd({
        card_number: digitsOnly(values.number),
        cardholder_name: values.name.trim().replace(/\s+/g, ' '),
        expiry_month: expiry.month,
        expiry_year: expiry.year,
      })
      if (mounted.current) setValues(EMPTY)
    } catch (error) {
      if (!mounted.current) return
      const server = fieldErrors(error)
      // Map the API's expiry fields onto the single MM/YY input.
      const expiryMessage = server.expiry_month || server.expiry_year
      setErrors({
        card_number: server.card_number,
        cardholder_name: server.cardholder_name,
        expiry: expiryMessage,
      })
      setFormError(
        Object.keys(server).length ? 'Please check the card details.' : generalMessage(error, 'Could not save the card.'),
      )
    } finally {
      if (mounted.current) setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5" aria-label="Add card">
      {formError && <Alert variant="error">{formError}</Alert>}

      <div className="relative">
        <TextField
          label="Card number"
          name="card_number"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="1234 5678 9012 3456"
          value={values.number}
          onChange={(e) => update('number', formatCardNumber(e.target.value))}
          error={errors.card_number}
          maxLength={23}
          autoFocus
        />
        {brand && (
          <span
            className="absolute top-0 right-0 text-xs font-semibold text-indigo-600"
            data-testid="detected-brand"
          >
            {BRANDS[brand].label}
          </span>
        )}
      </div>

      <TextField
        label="Name on card"
        name="cardholder_name"
        autoComplete="cc-name"
        placeholder="As printed on the card"
        value={values.name}
        onChange={(e) => update('name', e.target.value)}
        error={errors.cardholder_name}
        maxLength={100}
      />

      <TextField
        label="Expiry date"
        name="expiry"
        inputMode="numeric"
        autoComplete="cc-exp"
        placeholder="MM/YY"
        value={values.expiry}
        onChange={(e) => update('expiry', formatExpiry(e.target.value, values.expiry))}
        error={errors.expiry}
        maxLength={5}
        className="max-w-40"
      />

      <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
        <LockIcon className="mt-px h-4 w-4 shrink-0 text-slate-400" />
        We store only the last 4 digits and a masked number. Your full card number and CVV are never saved.
      </p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submitting} loadingText="Saving card…">
          Save card
        </Button>
      </div>
    </form>
  )
}
