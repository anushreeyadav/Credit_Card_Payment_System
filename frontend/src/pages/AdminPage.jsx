import { useSearchParams } from 'react-router-dom'

import { CardsSection, LogsSection, TransactionsSection, UsersSection } from '../components/admin/AdminSections.jsx'
import OverviewSection from '../components/admin/OverviewSection.jsx'
import { CardIcon, ChartIcon, ReceiptIcon, SettingsIcon, ShieldIcon, UsersIcon } from '../components/icons.jsx'
import PageHeader from '../components/layout/PageHeader.jsx'
import Alert from '../components/ui/Alert.jsx'
import { buttonClasses } from '../components/ui/buttonStyles.js'
import useAuth from '../hooks/useAuth.js'
import { DJANGO_ADMIN_URL } from '../services/config.js'

const TABS = [
  { id: 'overview', label: 'Overview', icon: ChartIcon, Component: OverviewSection },
  { id: 'users', label: 'Users', icon: UsersIcon, Component: UsersSection },
  { id: 'cards', label: 'Cards', icon: CardIcon, Component: CardsSection },
  { id: 'transactions', label: 'Transactions', icon: ReceiptIcon, Component: TransactionsSection },
  { id: 'logs', label: 'Admin logs', icon: ShieldIcon, Component: LogsSection },
]

// Staff-only. The backend enforces this independently: every /api/admin/
// endpoint rejects non-staff users and checks per-section permissions.
export default function AdminPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  if (!user.is_staff) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Admin</h1>
        <Alert variant="warning" className="mt-4">
          Admin access required. Your account does not have permission to view this page.
        </Alert>
      </section>
    )
  }

  const active = TABS.find((t) => t.id === searchParams.get('tab')) ?? TABS[0]
  const { Component } = active

  return (
    <section>
      <PageHeader
        eyebrow="Administration"
        title="Admin dashboard"
        description="Users, cards, payments and audit activity. Card data is always masked."
        actions={
          <a
            href={DJANGO_ADMIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: 'secondary' })}
          >
            <SettingsIcon className="h-4.5 w-4.5" />
            Django admin (CSV export) ↗
          </a>
        }
      />

      <div className="mt-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Admin sections"
          className="inline-flex min-w-max gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
        >
          {TABS.map((tab) => {
            const selected = tab.id === active.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`admin-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls="admin-panel"
                onClick={() => setSearchParams(tab.id === 'overview' ? {} : { tab: tab.id })}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold whitespace-nowrap transition ${
                  selected
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <tab.icon className="h-4.5 w-4.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div role="tabpanel" id="admin-panel" aria-labelledby={`admin-tab-${active.id}`} className="mt-6">
        <Component key={active.id} />
      </div>
    </section>
  )
}
