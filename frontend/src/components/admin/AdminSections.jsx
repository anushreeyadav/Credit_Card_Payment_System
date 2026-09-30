import { useState } from 'react'

import useAuth from '../../hooks/useAuth.js'
import useApiQuery from '../../hooks/useApiQuery.js'
import { adminService } from '../../services/djangoApi.js'
import { BRANDS, formatCardExpiry } from '../../utils/cards.js'
import { generalMessage } from '../../utils/errors.js'
import { formatAmount, formatDateTime } from '../../utils/format.js'
import { EyeIcon } from '../icons.jsx'
import StatusBadge from '../payments/StatusBadge.jsx'
import TransactionDetails from '../transactions/TransactionDetails.jsx'
import Alert from '../ui/Alert.jsx'
import Button from '../ui/Button.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import Modal from '../ui/Modal.jsx'
import AdminListSection from './AdminListSection.jsx'

const brandLabel = (type) => BRANDS[type]?.label ?? type
const mono = 'font-mono text-xs text-slate-900'
const muted = 'text-xs text-slate-500'

function Pill({ tone, children }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    grey: 'bg-slate-100 text-slate-600 ring-slate-500/20',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>
      {children}
    </span>
  )
}

function ViewButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-indigo-700 ring-1 ring-indigo-200 transition ring-inset hover:bg-indigo-50"
    >
      <EyeIcon className="h-4 w-4" />
      View
    </button>
  )
}

function UserDetails({ user }) {
  const rows = [
    ['Username', user.username],
    ['Name', [user.first_name, user.last_name].filter(Boolean).join(' ') || '—'],
    ['Email', user.email || '—'],
    ['Role', user.is_superuser ? 'Superuser' : user.is_staff ? 'Staff' : 'Customer'],
    ['Status', user.is_active ? 'Active' : 'Inactive'],
    ['Saved cards', user.card_count],
    ['Transactions', user.payment_count],
    ['Joined', formatDateTime(user.date_joined)],
    ['Last login', user.last_login ? formatDateTime(user.last_login) : 'Never logged in'],
  ]
  return (
    <dl className="divide-y divide-slate-100">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-6 py-3 text-sm">
          <dt className="text-slate-500">{label}</dt>
          <dd className="text-right font-medium break-words text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// ---------------------------------------------------------------- Users

export function UsersSection() {
  const { user: me, authRequest } = useAuth()
  const [pending, setPending] = useState(null) // { user, reload }
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [viewing, setViewing] = useState(null)

  async function confirmToggle() {
    const { user, reload } = pending
    setBusy(true)
    setDialogError(null)
    try {
      await authRequest((token) => adminService.setUserActive(token, user.id, !user.is_active))
      setNotice(`${user.username} was ${user.is_active ? 'deactivated and signed out' : 'reactivated'}.`)
      setPending(null)
      reload()
    } catch (error) {
      setDialogError(generalMessage(error, 'Could not update the account.'))
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    {
      key: 'user',
      header: 'User',
      render: (u) => (
        <>
          <p className="font-medium text-slate-900">{u.username}</p>
          <p className={muted}>{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</p>
        </>
      ),
    },
    { key: 'email', header: 'Email', render: (u) => <span className="text-slate-700">{u.email || '—'}</span> },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <Pill tone={u.is_staff ? 'indigo' : 'grey'}>
          {u.is_superuser ? 'Superuser' : u.is_staff ? 'Staff' : 'Customer'}
        </Pill>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => <Pill tone={u.is_active ? 'green' : 'grey'}>{u.is_active ? 'Active' : 'Inactive'}</Pill>,
    },
    { key: 'cards', header: 'Cards', align: 'right', render: (u) => u.card_count },
    { key: 'payments', header: 'Transactions', align: 'right', render: (u) => u.payment_count },
    {
      key: 'joined',
      header: 'Joined / last login',
      render: (u) => (
        <>
          <p className="whitespace-nowrap text-slate-700">{formatDateTime(u.date_joined)}</p>
          <p className={muted}>{u.last_login ? formatDateTime(u.last_login) : 'Never logged in'}</p>
        </>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (u, { reload }) => (
        <div className="flex items-center justify-end gap-1.5">
          <ViewButton label={`View ${u.username}`} onClick={() => setViewing(u)} />
          {u.id === me.id ? (
            <span className={`${muted} px-2`}>You</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNotice(null)
                setDialogError(null)
                setPending({ user: u, reload })
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap ring-1 transition ring-inset ${u.is_active ? 'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'}`}
              aria-label={`${u.is_active ? 'Deactivate' : 'Activate'} ${u.username}`}
            >
              {u.is_active ? 'Deactivate' : 'Activate'}
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      {notice && (
        <Alert variant="success" className="mb-4">
          {notice}
        </Alert>
      )}
      <AdminListSection
        fetcher={adminService.users}
        testId="admin-users"
        emptyText="No users yet."
        rowKey={(u) => u.id}
        columns={columns}
        emptyFilters={{ search: '', role: '', status: '' }}
        filterFields={[
          { name: 'search', label: 'Search', type: 'search', placeholder: 'Username, name or email' },
          {
            name: 'role',
            label: 'Role',
            type: 'select',
            options: [
              { value: '', label: 'All roles' },
              { value: 'customer', label: 'Customers' },
              { value: 'staff', label: 'Staff' },
            ],
          },
          {
            name: 'status',
            label: 'Status',
            type: 'select',
            options: [
              { value: '', label: 'Any status' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ],
          },
        ]}
      />
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.user.is_active ? 'Deactivate this account?' : 'Reactivate this account?'}
        confirmLabel={pending?.user.is_active ? 'Deactivate' : 'Activate'}
        busyLabel="Saving…"
        busy={busy}
        error={dialogError}
        onConfirm={confirmToggle}
        onCancel={() => setPending(null)}
      >
        {pending &&
          (pending.user.is_active ? (
            <>
              <span className="font-medium text-slate-900">{pending.user.username}</span> will be signed out everywhere
              and will not be able to log in until reactivated.
            </>
          ) : (
            <>
              <span className="font-medium text-slate-900">{pending.user.username}</span> will be able to log in again.
            </>
          ))}
      </ConfirmDialog>
      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        variant="drawer"
        size="sm:max-w-md"
        title="User details"
        description={viewing?.username}
        footer={
          <Button variant="secondary" onClick={() => setViewing(null)} className="w-full">
            Close
          </Button>
        }
      >
        {viewing && <UserDetails user={viewing} />}
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------- Cards

const CARD_TYPE_OPTIONS = [
  { value: '', label: 'All card types' },
  ...Object.entries(BRANDS).map(([value, b]) => ({ value, label: b.label })),
]

export function CardsSection() {
  return (
    <AdminListSection
      fetcher={adminService.cards}
      testId="admin-cards"
      emptyText="No saved cards yet."
      rowKey={(c) => c.id}
      emptyFilters={{ search: '', card_type: '' }}
      filterFields={[
        { name: 'search', label: 'Search', type: 'search', placeholder: 'Username, cardholder or last 4 digits' },
        { name: 'card_type', label: 'Card type', type: 'select', options: CARD_TYPE_OPTIONS },
      ]}
      columns={[
        {
          key: 'card',
          header: 'Card',
          render: (c) => (
            <>
              <p className={mono}>{c.masked_number}</p>
              <p className={muted}>{brandLabel(c.card_type)}</p>
            </>
          ),
        },
        {
          key: 'user',
          header: 'User',
          render: (c) => <span className="font-medium text-slate-900">{c.username}</span>,
        },
        {
          key: 'holder',
          header: 'Cardholder',
          render: (c) => <span className="text-slate-700">{c.cardholder_name}</span>,
        },
        {
          key: 'expiry',
          header: 'Expires',
          render: (c) => <span className="tabular-nums text-slate-700">{formatCardExpiry(c)}</span>,
        },
        {
          key: 'added',
          header: 'Added',
          render: (c) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(c.created_at)}</span>,
        },
      ]}
    />
  )
}

// ---------------------------------------------------------------- Transactions

export function TransactionsSection() {
  const [viewing, setViewing] = useState(null)
  return (
    <>
      <AdminListSection
        fetcher={adminService.transactions}
        testId="admin-transactions"
        emptyText="No transactions yet."
        rowKey={(t) => t.reference}
        emptyFilters={{ search: '', status: '', min_amount: '', max_amount: '', date_from: '', date_to: '' }}
        filterFields={[
          { name: 'search', label: 'Search', type: 'search', placeholder: 'Reference ID or username' },
          {
            name: 'status',
            label: 'Status',
            type: 'select',
            options: [
              { value: '', label: 'All statuses' },
              { value: 'SUCCESS', label: 'Success' },
              { value: 'FAILED', label: 'Failed' },
              { value: 'PENDING', label: 'Pending' },
            ],
          },
          { name: 'min_amount', label: 'Min amount', type: 'amount', placeholder: '0.00' },
          { name: 'max_amount', label: 'Max amount', type: 'amount', placeholder: 'Any' },
          { name: 'date_from', label: 'From (UTC)', type: 'date' },
          { name: 'date_to', label: 'To (UTC)', type: 'date' },
        ]}
        columns={[
          {
            key: 'ref',
            header: 'Transaction ID',
            render: (t) => (
              <>
                <p className={mono}>{t.reference}</p>
                {t.description && <p className={`${muted} max-w-48 truncate`}>{t.description}</p>}
              </>
            ),
          },
          {
            key: 'user',
            header: 'User',
            render: (t) => <span className="font-medium text-slate-900">{t.username}</span>,
          },
          {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            render: (t) => <span className="font-semibold text-slate-900">{formatAmount(t.amount, t.currency)}</span>,
          },
          {
            key: 'card',
            header: 'Card',
            render: (t) => (
              <>
                <p className={mono}>{t.masked_card}</p>
                <p className={muted}>{brandLabel(t.card_type)}</p>
              </>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (t) => (
              <>
                <StatusBadge status={t.status} />
                {t.failure_reason && <p className="mt-1 text-xs text-red-600">{t.failure_reason}</p>}
              </>
            ),
          },
          {
            key: 'date',
            header: 'Date & time',
            render: (t) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(t.created_at)}</span>,
          },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (t) => <ViewButton label={`View details of ${t.reference}`} onClick={() => setViewing(t)} />,
          },
        ]}
      />
      <TransactionDetails open={Boolean(viewing)} transaction={viewing} onClose={() => setViewing(null)} showUser />
    </>
  )
}

// ---------------------------------------------------------------- Admin logs

function Metadata({ value }) {
  const entries = Object.entries(value ?? {})
  if (!entries.length) return <span className={muted}>—</span>
  const text = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))
  return (
    <dl className="max-w-72 space-y-0.5 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <dt className="shrink-0 text-slate-500">{k}:</dt>
          <dd className="truncate font-mono text-slate-700" title={text(v)}>
            {text(v)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function LogsSection() {
  const { data: actions } = useApiQuery(adminService.logActions, null)
  const options = [{ value: '', label: 'All actions' }, ...(actions ?? [])]

  return (
    <AdminListSection
      key={actions ? 'ready' : 'loading'} // rebuild the filter once action names arrive
      fetcher={adminService.logs}
      testId="admin-logs"
      emptyText="No admin activity recorded yet."
      rowKey={(l) => l.id}
      emptyFilters={{ search: '', action: '' }}
      filterFields={[
        { name: 'search', label: 'Search', type: 'search', placeholder: 'Admin username or object' },
        { name: 'action', label: 'Action', type: 'select', options },
      ]}
      columns={[
        {
          key: 'time',
          header: 'Time',
          render: (l) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(l.created_at)}</span>,
        },
        {
          key: 'admin',
          header: 'Admin',
          render: (l) => <span className="font-medium text-slate-900">{l.username || '—'}</span>,
        },
        { key: 'action', header: 'Action', render: (l) => <span className="text-slate-800">{l.action_label}</span> },
        {
          key: 'object',
          header: 'Object',
          render: (l) => (
            <>
              <p className="text-slate-700">{l.object_repr || '—'}</p>
              {l.object_type && <p className={muted}>{l.object_type}</p>}
            </>
          ),
        },
        { key: 'details', header: 'Details', render: (l) => <Metadata value={l.metadata} /> },
        { key: 'ip', header: 'IP', render: (l) => <span className={mono}>{l.ip_address || '—'}</span> },
      ]}
    />
  )
}
