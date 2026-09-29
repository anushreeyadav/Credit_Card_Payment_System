import { useCallback, useEffect, useState } from 'react'

import { pingDjango } from '../services/djangoApi.js'
import { pingFastApi } from '../services/paymentApi.js'

const CHECKING = 'checking'

// Checks whether the Django and FastAPI backends are reachable.
// Each status is 'checking', 'online' or 'offline'.
export default function useApiStatus() {
  const [status, setStatus] = useState({ django: CHECKING, fastapi: CHECKING })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const check = async (key, ping) => {
      try {
        const online = await ping({ signal: controller.signal })
        setStatus((s) => ({ ...s, [key]: online ? 'online' : 'offline' }))
      } catch {
        // Aborted on unmount or re-check; nothing to update.
      }
    }
    check('django', pingDjango)
    check('fastapi', pingFastApi)
    return () => controller.abort()
  }, [attempt])

  const recheck = useCallback(() => {
    setStatus({ django: CHECKING, fastapi: CHECKING })
    setAttempt((n) => n + 1)
  }, [])

  return { ...status, recheck }
}
