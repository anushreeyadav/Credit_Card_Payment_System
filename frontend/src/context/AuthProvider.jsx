import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { authService } from '../services/djangoApi.js'
import { AuthContext } from './AuthContext.js'

// Token storage:
// - access token: in this module's memory only (a ref), never in localStorage,
//   sessionStorage, React state or the console. Lost on reload by design.
// - refresh token: httpOnly cookie set by Django; JavaScript cannot read it.
//   On page load the session is restored by calling /api/auth/refresh/.

// One refresh at a time. Refresh tokens rotate (the old one is blacklisted),
// so two parallel refreshes would make the second fail and log the user out.
let refreshInFlight = null

function refreshOnce() {
  if (!refreshInFlight) {
    refreshInFlight = authService.refresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

export default function AuthProvider({ children }) {
  const accessToken = useRef(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'authenticated' | 'anonymous'
  const [user, setUser] = useState(null)
  // Why the user was signed out: 'expired' | 'logged_out' | null. Shown on the login page.
  const [signOutReason, setSignOutReason] = useState(null)

  const startSession = useCallback((data) => {
    accessToken.current = data.access
    setUser(data.user)
    setSignOutReason(null)
    setStatus('authenticated')
  }, [])

  const endSession = useCallback((reason) => {
    accessToken.current = null
    setUser(null)
    setSignOutReason(reason)
    setStatus('anonymous')
  }, [])

  // Returns a new access token, or null if the session cannot be renewed.
  const renewSession = useCallback(async () => {
    try {
      const data = await refreshOnce()
      startSession(data)
      return data.access
    } catch {
      return null
    }
  }, [startSession])

  // Restore the session from the refresh cookie on first load.
  useEffect(() => {
    let active = true
    refreshOnce()
      .then((data) => active && startSession(data))
      .catch(() => active && endSession(null))
    return () => {
      active = false
    }
  }, [startSession, endSession])

  const login = useCallback(
    async (username, password) => {
      startSession(await authService.login(username, password))
    },
    [startSession],
  )

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } catch {
      // Clear the local session even if the server is unreachable.
    }
    endSession('logged_out')
  }, [endSession])

  // Run an authenticated API call. On 401 (e.g. expired access token) the
  // session is refreshed once and the call retried; if that fails the user
  // is signed out and sent to /login by the route guard.
  const authRequest = useCallback(
    async (call) => {
      try {
        return await call(accessToken.current)
      } catch (error) {
        if (error.status !== 401) throw error
        const renewed = await renewSession()
        if (!renewed) {
          endSession('expired')
          throw error
        }
        return call(renewed)
      }
    },
    [renewSession, endSession],
  )

  const value = useMemo(
    () => ({
      status,
      user,
      isAuthenticated: status === 'authenticated',
      signOutReason,
      login,
      logout,
      register: authService.register,
      authRequest,
    }),
    [status, user, signOutReason, login, logout, authRequest],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
