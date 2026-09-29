import { useCallback, useEffect, useState } from 'react'

import { cardService } from '../services/djangoApi.js'
import { generalMessage } from '../utils/errors.js'
import useAuth from './useAuth.js'

// Loads the current user's saved cards and exposes add/remove.
// Cards from the API are already masked; the full number is never returned.
export default function useCards() {
  const { authRequest } = useAuth()
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    authRequest((token) => cardService.list(token, { signal: controller.signal }))
      .then((data) => {
        setCards(data)
        setLoadError(null)
      })
      .catch((error) => {
        if (error.name !== 'AbortError' && error.status !== 401) setLoadError(generalMessage(error, 'Could not load your cards.'))
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

  // Throws ApiError on failure so the form can show field errors.
  const addCard = useCallback(
    async (payload) => {
      const card = await authRequest((token) => cardService.add(payload, token))
      setCards((current) => [card, ...current])
      return card
    },
    [authRequest],
  )

  const removeCard = useCallback(
    async (id) => {
      try {
        await authRequest((token) => cardService.remove(id, token))
      } catch (error) {
        if (error.status !== 404) throw error // already gone: treat as deleted
      }
      setCards((current) => current.filter((card) => card.id !== id))
    },
    [authRequest],
  )

  return { cards, loading, loadError, reload, addCard, removeCard }
}
