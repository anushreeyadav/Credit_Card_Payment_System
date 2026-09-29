import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import Alert from '../components/ui/Alert.jsx'
import Button from '../components/ui/Button.jsx'
import TextField from '../components/ui/TextField.jsx'
import useAuth from '../hooks/useAuth.js'
import { PATHS } from '../routes/paths.js'
import { fieldErrors, generalMessage } from '../utils/errors.js'
import { validateLogin } from '../utils/validation.js'

const NOTICES = {
  expired: { variant: 'warning', text: 'Your session has expired. Please log in again.' },
  logged_out: { variant: 'info', text: 'You have been logged out.' },
}

export default function LoginPage() {
  const { login, signOutReason } = useAuth()
  const location = useLocation()
  const registered = location.state?.registered

  const [values, setValues] = useState({ username: registered || '', password: '' })
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
    const clientErrors = validateLogin(values)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length) return

    setSubmitting(true)
    try {
      // On success the session starts and PublicOnlyRoute redirects to
      // the page the user was trying to open, or /dashboard.
      await login(values.username.trim(), values.password)
    } catch (error) {
      setErrors(fieldErrors(error))
      setFormError(
        error.status === 401 ? 'Invalid username or password.' : generalMessage(error, 'Could not log you in.'),
      )
      setValues((v) => ({ ...v, password: '' }))
      setSubmitting(false)
    }
  }

  const notice = registered
    ? { variant: 'success', text: 'Account created. Log in to continue.' }
    : NOTICES[signOutReason]

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
      <p className="mt-1.5 text-sm text-slate-600">Log in to manage your cards and payments.</p>

      <div className="mt-6 space-y-3">
        {notice && !formError && <Alert variant={notice.variant}>{notice.text}</Alert>}
        {formError && <Alert variant="error">{formError}</Alert>}
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
        <TextField
          label="Username or email"
          name="username"
          autoComplete="username"
          autoFocus={!registered}
          value={values.username}
          onChange={update('username')}
          error={errors.username}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus={Boolean(registered)}
          value={values.password}
          onChange={update('password')}
          error={errors.password}
        />
        <Button type="submit" className="w-full" loading={submitting} loadingText="Logging in…">
          Log in
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-slate-600">
        New here?{' '}
        <Link to={PATHS.register} className="font-semibold text-indigo-600 hover:text-indigo-500">
          Create an account
        </Link>
      </p>
    </div>
  )
}
