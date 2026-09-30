import { useCallback, useSyncExternalStore } from 'react'

// Display preferences that only affect this browser (there is no settings API).
// Stored in localStorage; every read/write is guarded because storage can be
// unavailable (private windows, blocked site data). Never stores tokens or card data.
const KEY = 'ccps.preferences'

export const DEFAULT_PREFERENCES = {
  hideAmounts: false, // blur money values on the dashboard
  activityBadge: true, // unread count on the notifications bell
  toasts: true, // pop-up confirmations after actions
  reduceMotion: false, // turn off transitions and animations
  theme: 'light', // 'light' | 'dark' | 'system'
}

export const THEMES = ['light', 'dark', 'system']
const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)')

const listeners = new Set()
let cache = null

function read() {
  if (cache) return cache
  let stored
  try {
    stored = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') ?? {}
  } catch {
    stored = {}
  }
  cache = { ...DEFAULT_PREFERENCES }
  for (const key of Object.keys(DEFAULT_PREFERENCES)) {
    if (typeof stored[key] === typeof DEFAULT_PREFERENCES[key]) cache[key] = stored[key]
  }
  if (!THEMES.includes(cache.theme)) cache.theme = DEFAULT_PREFERENCES.theme
  return cache
}

function write(next) {
  cache = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable: keep the preference for this visit only.
  }
  applyToDocument(next)
  listeners.forEach((listener) => listener())
}

export function isDark(prefs = read()) {
  return prefs.theme === 'dark' || (prefs.theme === 'system' && Boolean(darkQuery()?.matches))
}

export function applyToDocument(prefs = read()) {
  document.documentElement.classList.toggle('reduce-motion', prefs.reduceMotion)
  document.documentElement.classList.toggle('dark', isDark(prefs))
}

// "Match system" follows the operating system setting while the page is open.
export function watchSystemTheme() {
  darkQuery()?.addEventListener?.('change', () => applyToDocument())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export default function usePreferences() {
  const preferences = useSyncExternalStore(subscribe, read, () => DEFAULT_PREFERENCES)
  const setPreference = useCallback((key, value) => write({ ...read(), [key]: value }), [])
  const resetPreferences = useCallback(() => write({ ...DEFAULT_PREFERENCES }), [])
  return { preferences, setPreference, resetPreferences }
}
