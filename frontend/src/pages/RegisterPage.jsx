import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import Alert from '../components/ui/Alert.jsx'
import Button from '../components/ui/Button.jsx'
import TextField from '../components/ui/TextField.jsx'
import useAuth from '../hooks/useAuth.js'
import { PATHS } from '../routes/paths.js'
import { fieldErrors, generalMessage } from '../utils/errors.js'
import { validateRegistration } from '../utils/validation.js'

const EMPTY = { first_name: '', last_name: '', username: '', email: '', password: '', password_confirm: '' }

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const update = (field) => (event) => {
    setValues((v) => ({ ...v, [field]: event.target.value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)
    const clientErrors = validateRegistration(values)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length) return

    setSubmitting(true)
    try {
      const user = await register({
        ...values,
        username: values.username.trim(),
        email: values.email.trim(),
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
      })
      navigate(PATHS.login, { replace: true, state: { registered: user.username } })
    } catch (error) {
      const serverErrors = fieldErrors(error)
      setErrors(serverErrors)
      setFormError(
        Object.keys(serverErrors).length
          ? 'Please fix the highlighted fields.'
          : generalMessage(error, 'Could not create your account.'),
      )
      setValues((v) => ({ ...v, password: '', password_confirm: '' }))
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Create your account</h1>
      <p className="mt-1.5 text-sm text-slate-600">Start saving cards and making payments in minutes.</p>

      {formError && (
        <Alert variant="error" className="mt-6">
          {formError}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="First name"
            name="first_name"
            autoComplete="given-name"
            optional
            value={values.first_name}
            onChange={update('first_name')}
            error={errors.first_name}
          />
          <TextField
            label="Last name"
            name="last_name"
            autoComplete="family-name"
            optional
            value={values.last_name}
            onChange={update('last_name')}
            error={errors.last_name}
          />
        </div>
        <TextField
          label="Username"
          name="username"
          autoComplete="username"
          value={values.username}
          onChange={update('username')}
          error={errors.username}
          hint="Letters, numbers and @ . + - _ only."
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={update('email')}
          error={errors.email}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={update('password')}
          error={errors.password}
          hint="At least 8 characters. Avoid common passwords and your name."
        />
        <TextField
          label="Confirm password"
          name="password_confirm"
          type="password"
          autoComplete="new-password"
          value={values.password_confirm}
          onChange={update('password_confirm')}
          error={errors.password_confirm}
        />
        <Button type="submit" className="w-full" loading={submitting} loadingText="Creating account…">
          Create account
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to={PATHS.login} className="font-semibold text-indigo-600 hover:text-indigo-500">
          Log in
        </Link>
      </p>
    </div>
  )
}
