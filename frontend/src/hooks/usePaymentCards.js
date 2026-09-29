import { useCallback, useEffect, useState } from 'react'

import { paymentService } from '../services/paymentApi.js'
import { generalMessage } from '../utils/errors.js'
import useAuth from './useAuth.js'

// The current user's saved cards, as seen by the FastAPI payment service (masked only).
export default function usePaymentCards() {
  const { authRequest } = useAuth()
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    authRequest((token) => paymentService.savedCards(token, { signal: controller.signal }))
      .then((data) => {
        setCards(data)
        setError(null)
      })
      .catch((err) => {
        if (err.name !== 'AbortError' && err.status !== 401) setError(generalMessage(err, 'Could not load your cards.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [authRequest, reloadKey])

  const reload = useCallback(() => {
    setLoading(true)
    setReloadKey((k) => k + 1)
  }, [])

  return { cards, loading, error, reload }
}
