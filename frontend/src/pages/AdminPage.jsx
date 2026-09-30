import { useSearchParams } from 'react-router-dom'

import AdminDashboard from '../components/admin/AdminDashboard.jsx'
import { AdminSettingsSection, ExportSection } from '../components/admin/AdminExtraSections.jsx'
import { CardsSection, LogsSection, TransactionsSection, UsersSection } from '../components/admin/AdminSections.jsx'
import OverviewSection from '../components/admin/OverviewSection.jsx'
import { LockIcon } from '../components/icons.jsx'
import AdminShell from '../components/layout/AdminShell.jsx'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/layout/PageHeader.jsx'
import { ButtonLink } from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import useAuth from '../hooks/useAuth.js'
import { PATHS } from '../routes/paths.js'

const SECTIONS = {
  dashboard: {
    title: 'Admin dashboard',
    description: 'Users, cards and payments across the system. Card data is always masked.',
    Component: AdminDashboard,
  },
  users: { title: 'Users', description: 'Search accounts, view details and activate or deactivate them.', Component: UsersSection },
  cards: { title: 'Cards', description: 'All saved cards. Only masked numbers are stored or shown.', Component: CardsSection },
  transactions: { title: 'Transactions', description: 'Every payment, with filters and details.', Component: TransactionsSection },
  summary: { title: 'Payment summary', description: 'Daily totals, success rate and the last 7 days (UTC).', Component: OverviewSection },
  logs: { title: 'Admin logs', description: 'Audit trail of admin activity. Sensitive values are never recorded.', Component: LogsSection },
  export: { title: 'Export data', description: 'Download transactions as CSV from the Django admin.', Component: ExportSection },
  settings: { title: 'Settings', description: 'Admin permissions, security and your display preferences.', Component: AdminSettingsSection },
}

// Staff-only. The backend enforces this independently: every /api/admin/
// endpoint rejects non-staff users and checks per-section permissions.
export default function AdminPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()

  if (!user.is_staff) {
    return (
      <AppShell>
        <section>
          <h1 className="sr-only">Admin</h1>
          <EmptyState
            icon={LockIcon}
            tone="slate"
            title="Admin access required."
            action={
              <ButtonLink to={PATHS.dashboard} variant="secondary">
                Back to dashboard
              </ButtonLink>
            }
          >
            Your account does not have permission to view this page.
          </EmptyState>
        </section>
      </AppShell>
    )
  }

  const id = SECTIONS[searchParams.get('tab')] ? searchParams.get('tab') : 'dashboard'
  const { title, description, Component } = SECTIONS[id]

  return (
    <AdminShell active={id}>
      <PageHeader eyebrow="Admin console" title={title} description={description} />
      <div className="mt-6">
        <Component key={id} />
      </div>
    </AdminShell>
  )
}
