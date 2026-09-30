import { useCallback, useMemo, useRef, useState } from 'react'

import { CheckCircleIcon, InfoIcon, AlertIcon, XIcon } from '../components/icons.jsx'
import usePreferences from '../hooks/usePreferences.js'
import { ToastContext } from './ToastContext.js'

const DURATION_MS = 5000
const STYLES = {
  success: { icon: CheckCircleIcon, tone: 'text-emerald-600 bg-emerald-50' },
  info: { icon: InfoIcon, tone: 'text-sky-600 bg-sky-50' },
  warning: { icon: AlertIcon, tone: 'text-amber-600 bg-amber-50' },
}

// Short confirmations after an action ("Card added", "Filters cleared").
// Messages are announced politely to screen readers and disappear on their own.
export default function ToastProvider({ children }) {
  const { preferences } = usePreferences()
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const notify = useCallback(
    (message, { variant = 'success', force = false } = {}) => {
      if (!force && !preferences.toasts) return
      nextId.current += 1
      const id = nextId.current
      setToasts((list) => [...list.slice(-2), { id, message, variant }])
      window.setTimeout(() => dismiss(id), DURATION_MS)
    },
    [dismiss, preferences.toasts],
  )

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:items-end"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const { icon: Icon, tone } = STYLES[toast.variant] ?? STYLES.info
          return (
            <div
              key={toast.id}
              role="status"
              className="toast-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 pr-2 shadow-xl shadow-slate-900/10 backdrop-blur"
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <p className="flex-1 text-sm font-medium text-slate-800">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Dismiss notification"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
