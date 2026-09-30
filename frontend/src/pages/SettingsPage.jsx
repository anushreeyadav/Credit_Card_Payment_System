import { Link } from 'react-router-dom'

import { UserIcon } from '../components/icons.jsx'
import { displayName, roleLabel } from '../components/layout/navigation.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import { PreferenceSettings, SecuritySettings, SettingsCard } from '../components/settings/SettingsPanels.jsx'
import { ButtonLink } from '../components/ui/Button.jsx'
import useAuth from '../hooks/useAuth.js'
import { PATHS } from '../routes/paths.js'

const SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'security', label: 'Security' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'appearance', label: 'Appearance' },
]

export default function SettingsPage() {
  const { user } = useAuth()

  return (
    <section>
      <PageHeader eyebrow="Account" title="Settings" description="Preferences are saved in this browser. Account details come from your profile." />

      <div className="mt-6 grid gap-6 lg:grid-cols-4">
        <nav aria-label="Settings sections" className="h-fit min-w-0 lg:sticky lg:top-24">
          <ul className="relative flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block rounded-2xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-slate-600 transition hover:bg-white hover:text-slate-900 hover:shadow-sm"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6 lg:col-span-3">
          <SettingsCard id="account" icon={UserIcon} title="Account settings" description="Read-only: there is no API to change these yet.">
            <dl className="py-2">
              {[
                ['Name', displayName(user)],
                ['Username', user.username],
                ['Email', user.email],
                ['Role', roleLabel(user)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-slate-100 py-3 text-sm last:border-0">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="truncate font-medium text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="py-4">
              <ButtonLink to={PATHS.profile} variant="secondary" size="sm" icon={UserIcon}>
                View profile
              </ButtonLink>
            </div>
          </SettingsCard>
          <SecuritySettings />
          <PreferenceSettings />
          <p className="text-center text-xs text-slate-500">
            Need help? Visit{' '}
            <Link to={PATHS.help} className="font-semibold text-indigo-600 hover:underline">
              the help centre
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  )
}
