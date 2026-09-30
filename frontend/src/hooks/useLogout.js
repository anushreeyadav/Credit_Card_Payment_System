import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { PATHS } from '../routes/paths.js'
import useAuth from './useAuth.js'

// Logs out on the server (revokes the refresh cookie) and goes to /login.
export default function useLogout() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  async function handleLogout() {
    setBusy(true)
    await logout()
    navigate(PATHS.login, { replace: true })
  }
  return { busy, handleLogout }
}
