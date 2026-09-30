import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

import useLogout from '../../hooks/useLogout.js'
import usePreferences from '../../hooks/usePreferences.js'
import useToast from '../../hooks/useToast.js'
import { BellIcon, KeyIcon, LogoutIcon, PaletteIcon, RefreshIcon } from '../icons.jsx'
import Button from '../ui/Button.jsx'
import Toggle from '../ui/Toggle.jsx'

export function SettingsCard({ id, icon: Icon, title, description, children }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      <div className="divide-y divide-slate-100 px-5 sm:px-6">{children}</div>
    </section>
  )
}

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', preview: 'bg-white ring-1 ring-slate-200' },
  { value: 'dark', label: 'Dark', preview: 'theme-fixed bg-slate-800' },
  { value: 'system', label: 'Match system', preview: 'theme-fixed bg-gradient-to-r from-slate-100 to-slate-800 ring-1 ring-slate-200' },
]

// Notification and appearance preferences. They are saved in this browser
// only (there is no settings API), and each one changes something real.
export function PreferenceSettings() {
  const { preferences, setPreference, resetPreferences } = usePreferences()
  const { notify } = useToast()

  return (
    <>
      <SettingsCard id="notifications" icon={BellIcon} title="Notification preferences" description="Saved in this browser.">
        <Toggle
          label="Unread badge"
          description="Show the number of new payment results on the bell and in the menu."
          checked={preferences.activityBadge}
          onChange={(v) => setPreference('activityBadge', v)}
        />
        <Toggle
          label="Pop-up confirmations"
          description="Short messages such as “Filters cleared”. Card and payment confirmations are always shown."
          checked={preferences.toasts}
          onChange={(v) => setPreference('toasts', v)}
        />
        <Toggle
          label="Email notifications"
          checked={false}
          onChange={() => {}}
          disabled
          disabledReason="Not available: the system does not send emails."
        />
      </SettingsCard>

      <SettingsCard id="appearance" icon={PaletteIcon} title="Appearance" description="Saved in this browser.">
        <div className="py-4">
          <p className="text-sm font-medium text-slate-900" id="theme-label">
            Theme
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="theme-label">
            {THEME_OPTIONS.map((theme) => {
              const checked = preferences.theme === theme.value
              return (
                <button
                  key={theme.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setPreference('theme', theme.value)}
                  className={`rounded-2xl border p-3 text-left text-sm font-semibold transition ${
                    checked
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-4 ring-indigo-500/10'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className={`mb-2 block h-8 rounded-lg ${theme.preview}`} aria-hidden="true" />
                  {theme.label}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">“Match system” follows your device’s light or dark setting.</p>
        </div>
        <Toggle
          label="Reduce motion"
          description="Turn off animations and transitions."
          checked={preferences.reduceMotion}
          onChange={(v) => setPreference('reduceMotion', v)}
        />
        <Toggle
          label="Hide amounts on the dashboard"
          description="Useful when others can see your screen."
          checked={preferences.hideAmounts}
          onChange={(v) => setPreference('hideAmounts', v)}
        />
        <div className="py-4">
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshIcon}
            onClick={() => {
              resetPreferences()
              notify('Preferences reset to defaults.', { force: true })
            }}
          >
            Reset preferences
          </Button>
        </div>
      </SettingsCard>
    </>
  )
}

// What protects the session, plus the actions that exist (logging out).
export function SecuritySettings() {
  const { busy, handleLogout } = useLogout()
  const { hash } = useLocation()

  useEffect(() => {
    if (hash === '#security') document.getElementById('security')?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <SettingsCard id="security" icon={KeyIcon} title="Security settings" description="How your session is protected.">
      <ul className="space-y-3 py-4 text-sm text-slate-600">
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
          Access tokens last 5 minutes and are kept in memory only, never in browser storage.
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
          Your session is renewed with a secure, httpOnly cookie that scripts cannot read.
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
          Card numbers are masked everywhere; the full number is never stored.
        </li>
      </ul>
      <div className="flex flex-wrap gap-2 py-4">
        <Button variant="danger" icon={LogoutIcon} onClick={handleLogout} loading={busy} loadingText="Signing out…">
          Sign out of this browser
        </Button>
        <Button variant="secondary" disabled title="No API to end other sessions">
          Sign out everywhere
        </Button>
        <Button variant="secondary" icon={KeyIcon} disabled title="No change-password API">
          Change password
        </Button>
      </div>
      <p className="pb-4 text-xs text-slate-500">
        “Sign out everywhere” and “Change password” are not available yet: the system has no API for them.
      </p>
    </SettingsCard>
  )
}
