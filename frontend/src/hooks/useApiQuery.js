import { useCallback, useEffect, useState } from 'react'

import useAuth from './useAuth.js'

// Runs an authenticated GET whenever `params` change and keeps the last result.
// `fetcher(token, params, { signal })` must return a promise.
// `loading` is derived: true while the stored result belongs to other params.
export default function useApiQuery(fetcher, params) {
  const { authRequest } = useAuth()
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState({ key: null, data: null, error: null })

  const serialized = JSON.stringify(params ?? {})
  const key = `${serialized}#${reloadKey}`

  useEffect(() => {
    const controller = new AbortController()
    authRequest((token) => fetcher(token, JSON.parse(serialized), { signal: controller.signal }))
      .then((data) => setResult({ key, data, error: null }))
      .catch((error) => {
        if (error.name === 'AbortError' || error.status === 401) return
        setResult((previous) => ({ key, data: previous.data, error }))
      })
    return () => controller.abort()
  }, [authRequest, fetcher, serialized, key])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  const current = result.key === key

  return { data: result.data, loading: !current, error: current ? result.error : null, reload }
}
