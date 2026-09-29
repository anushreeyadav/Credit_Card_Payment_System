// Client-side checks for instant feedback. The server re-validates everything
// (including Django's password strength rules), so these are only a first pass.

const USERNAME = /^[\w.@+-]+$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateRegistration(values) {
  const errors = {}
  const username = values.username.trim()
  if (!username) errors.username = 'Username is required.'
  else if (username.length > 150) errors.username = 'Username must be 150 characters or fewer.'
  else if (!USERNAME.test(username)) errors.username = 'Use only letters, numbers and @ . + - _'

  const email = values.email.trim()
  if (!email) errors.email = 'Email is required.'
  else if (!EMAIL.test(email)) errors.email = 'Enter a valid email address.'

  if (!values.password) errors.password = 'Password is required.'
  else if (values.password.length < 8) errors.password = 'Password must be at least 8 characters.'
  else if (/^\d+$/.test(values.password)) errors.password = 'Password cannot be entirely numeric.'

  if (!values.password_confirm) errors.password_confirm = 'Please confirm your password.'
  else if (values.password && values.password !== values.password_confirm) {
    errors.password_confirm = 'Passwords do not match.'
  }
  return errors
}

export function validateLogin(values) {
  const errors = {}
  if (!values.username.trim()) errors.username = 'Enter your username or email.'
  if (!values.password) errors.password = 'Enter your password.'
  return errors
}
