import { DJANGO_ADMIN_URL } from '../../services/config.js'
import { DatabaseIcon, DownloadIcon, ExternalIcon, InfoIcon, LockIcon, ShieldIcon } from '../icons.jsx'
import { PreferenceSettings, SecuritySettings, SettingsCard } from '../settings/SettingsPanels.jsx'
import { buttonClasses } from '../ui/buttonStyles.js'

// Columns written by the existing Django admin action (payments/admin.py).
const CSV_COLUMNS = [
  'reference',
  'username',
  'card_type',
  'masked_card',
  'amount',
  'currency',
  'status',
  'failure_reason',
  'description',
  'created_at',
  'updated_at',
]

// The CSV export already exists as a Django admin action, so this page explains
// it and links there; it does not re-implement the export.
export function ExportSection() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
          <DownloadIcon className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">Export transactions to CSV</h2>
        <p className="mt-1 text-sm text-slate-600">
          The export runs in the Django admin, which uses its own sign-in (a separate session from this app).
        </p>
        <ol className="mt-5 space-y-3 text-sm text-slate-700">
          {[
            'Open the Django admin and sign in with your staff account.',
            'Go to Payments → Transactions and filter the list if needed.',
            'Select the rows, choose “Export selected transactions to CSV” and press Go.',
          ].map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-bold text-white">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap gap-2">
          <a href={`${DJANGO_ADMIN_URL}payments/payment/`} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'primary' })}>
            <ExternalIcon className="h-4.5 w-4.5" />
            Open transactions in Django admin
          </a>
          <a href={DJANGO_ADMIN_URL} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'secondary' })}>
            <DatabaseIcon className="h-4.5 w-4.5" />
            Django admin home
          </a>
        </div>
      </section>

      <aside className="h-fit space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <InfoIcon className="h-5 w-5 text-indigo-600" /> Exported columns
          </p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {CSV_COLUMNS.map((c) => (
              <li key={c} className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                {c}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5 text-sm text-emerald-900">
          <p className="flex items-center gap-2 font-semibold">
            <LockIcon className="h-5 w-5" /> Safe by design
          </p>
          <p className="mt-1">Cards are exported masked only. Text cells are protected against spreadsheet formula injection, and each export is written to the admin log.</p>
        </div>
      </aside>
    </div>
  )
}

export function AdminSettingsSection() {
  return (
    <div className="space-y-6">
      <SettingsCard icon={ShieldIcon} title="Administration" description="Permissions are managed in the Django admin.">
        <p className="py-4 text-sm text-slate-600">
          Each admin section needs its own permission (for example “view user” or “view transaction”). A superuser grants them to staff
          accounts in the Django admin under Users.
        </p>
        <div className="py-4">
          <a href={`${DJANGO_ADMIN_URL}auth/user/`} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            <ExternalIcon className="h-3.5 w-3.5" />
            Manage staff permissions
          </a>
        </div>
      </SettingsCard>
      <SecuritySettings />
      <PreferenceSettings />
    </div>
  )
}
