import { useCallback, useState } from 'react'

import { transactionService } from '../services/djangoApi.js'
import useApiQuery from './useApiQuery.js'
import useAuth from './useAuth.js'

// The notification centre shows the user's latest payment results (real data
// from /api/transactions/). There is no notifications API, so "new" means
// "created after you last opened notifications on this device"; that time is
// kept in localStorage per user. Nothing is marked as read on the server.
const LIMIT = 8
const QUERY = { page_size: LIMIT }
const storageKey = (userId) => `ccps.activitySeenAt.${userId}`

// Returns the saved "seen up to" time; on first use starts counting from now,
// so older payments are not all flagged as new.
function loadSeen(userId) {
  try {
    const saved = window.localStorage.getItem(storageKey(userId))
    if (saved && !Number.isNaN(Date.parse(saved))) return saved
    const now = new Date().toISOString()
    window.localStorage.setItem(storageKey(userId), now)
    return now
  } catch {
    return new Date().toISOString() // storage unavailable: count from this visit
  }
}

function saveSeen(userId, value) {
  try {
    window.localStorage.setItem(storageKey(userId), value)
  } catch {
    // Storage unavailable: the marker resets on reload.
  }
}

export default function useActivity() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useApiQuery(transactionService.list, QUERY)
  const [seenAt, setSeenAt] = useState(() => loadSeen(user.id))
  const items = data?.results ?? []
  const newest = items[0]?.created_at ?? null

  const isNew = useCallback((item) => Date.parse(item.created_at) > Date.parse(seenAt), [seenAt])
  const unread = items.filter(isNew).length

  const markSeen = useCallback(() => {
    if (!newest || Date.parse(newest) <= Date.parse(seenAt)) return
    saveSeen(user.id, newest)
    setSeenAt(newest)
  }, [newest, seenAt, user.id])

  return { items, total: data?.count ?? 0, loading: loading && !data, error, reload, unread, isNew, markSeen }
}
