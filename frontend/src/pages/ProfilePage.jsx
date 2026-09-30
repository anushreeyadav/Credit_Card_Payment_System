import { CardIcon, KeyIcon, LockIcon, LogoutIcon, MailIcon, ReceiptIcon, SettingsIcon, ShieldIcon, UserIcon } from '../components/icons.jsx'
import { displayName, roleLabel } from '../components/layout/navigation.js'
import PageHeader from '../components/layout/PageHeader.jsx'
import Avatar from '../components/ui/Avatar.jsx'
import Button, { ButtonLink } from '../components/ui/Button.jsx'
import useApiQuery from '../hooks/useApiQuery.js'
import useAuth from '../hooks/useAuth.js'
import useCards from '../hooks/useCards.js'
import useLogout from '../hooks/useLogout.js'
import { PATHS } from '../routes/paths.js'
import { transactionService } from '../services/djangoApi.js'

const COUNT_ONLY = { page_size: 1 }
const longDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

function Card({ title, icon: Icon, children, action }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <Icon className="h-5 w-5 text-indigo-600" /> {title}
        </h2>
        {action}
      </div>
      <div className="px-5 py-2 sm:px-6">{children}</div>
    </section>
  )
}

function Field({ label, children }) {
  return (
    <div className="grid gap-1 border-b border-slate-100 py-3.5 last:border-0 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900 sm:col-span-2">{children || <span className="text-slate-400">Not provided</span>}</dd>
    </div>
  )
}

function Unavailable({ children }) {
  return <p className="mt-2 text-xs text-slate-500">{children}</p>
}

// Everything shown comes from GET /api/auth/me/ (plus card and transaction counts).
// There is no API to edit the profile or change the password, so those buttons are disabled with a reason.
export default function ProfilePage() {
  const { user } = useAuth()
  const { busy, handleLogout } = useLogout()
  const { cards, loading: cardsLoading } = useCards()
  const { data: tx } = useApiQuery(transactionService.list, COUNT_ONLY)

  return (
    <section>
      <PageHeader eyebrow="Account" title="Profile" description="Your personal and account information." />

      <div className="mt-6 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="h-28 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600" />
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 pb-6">
          <div className="-mt-12 flex items-end gap-4">
            <Avatar user={user} className="h-24 w-24 text-3xl ring-4" />
            <div className="pb-1">
              <p className="text-xl font-bold text-slate-900">{displayName(user)}</p>
              <p className="text-sm text-slate-500">@{user.username}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active account
            </span>
            <span className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-600/20">
              {roleLabel(user)}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-slate-100 sm:grid-cols-3">
          <div className="border-r border-slate-100 px-6 py-4">
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <CardIcon className="h-4 w-4" /> Saved cards
            </p>
            <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{cardsLoading ? '…' : cards.length}</p>
          </div>
          <div className="border-slate-100 px-6 py-4 sm:border-r">
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <ReceiptIcon className="h-4 w-4" /> Transactions
            </p>
            <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{tx ? tx.count : '…'}</p>
          </div>
          <div className="col-span-2 border-t border-slate-100 px-6 py-4 sm:col-span-1 sm:border-t-0">
            <p className="text-xs text-slate-500">Member since</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{user.date_joined ? longDate(user.date_joined) : '—'}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card
          title="Personal information"
          icon={UserIcon}
          action={
            <Button variant="secondary" size="sm" disabled title="There is no API for editing your profile yet">
              Edit profile
            </Button>
          }
        >
          <dl>
            <Field label="First name">{user.first_name}</Field>
            <Field label="Last name">{user.last_name}</Field>
            <Field label="Email">
              <span className="inline-flex items-center gap-1.5">
                <MailIcon className="h-4 w-4 text-slate-400" />
                {user.email}
              </span>
            </Field>
          </dl>
          <Unavailable>Editing your details is not available yet: the system has no profile update API.</Unavailable>
        </Card>

        <Card title="Account information" icon={ShieldIcon}>
          <dl>
            <Field label="Username">{user.username}</Field>
            <Field label="Role">{roleLabel(user)}</Field>
            <Field label="Account status">Active (only active accounts can sign in)</Field>
            <Field label="Registered">{user.date_joined ? longDate(user.date_joined) : null}</Field>
          </dl>
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Security" icon={LockIcon}>
          <div className="grid gap-4 py-3 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Password</p>
              <p className="mt-1 text-xs text-slate-500">Changing your password needs an API that does not exist yet.</p>
              <Button variant="secondary" size="sm" icon={KeyIcon} className="mt-3" disabled title="No change-password API">
                Change password
              </Button>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Session</p>
              <p className="mt-1 text-xs text-slate-500">Signed in with a short-lived token kept in memory and a secure cookie.</p>
              <ButtonLink to={`${PATHS.settings}#security`} variant="secondary" size="sm" icon={SettingsIcon} className="mt-3">
                Security settings
              </ButtonLink>
            </div>
            <div className="rounded-2xl bg-red-50/60 p-4">
              <p className="text-sm font-semibold text-slate-900">Sign out</p>
              <p className="mt-1 text-xs text-slate-500">End this session on this browser.</p>
              <Button variant="danger" size="sm" icon={LogoutIcon} className="mt-3" onClick={handleLogout} loading={busy} loadingText="Signing out…">
                Sign out now
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </section>
  )
}
