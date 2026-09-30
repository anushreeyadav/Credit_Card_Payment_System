import { useContext, useState } from 'react'

import { BellIcon, CheckCircleIcon, InfoIcon, ReceiptIcon, RefreshIcon, SendIcon } from '../components/icons.jsx'
import ActivityItem from '../components/layout/ActivityItem.jsx'
import PageHeader from '../components/layout/PageHeader.jsx'
import Button, { ButtonLink } from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import { ActivityContext } from '../context/ActivityContext.js'
import { PATHS } from '../routes/paths.js'
import { generalMessage } from '../utils/errors.js'

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'SUCCESS', label: 'Successful' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'PENDING', label: 'Pending' },
]

// Notification centre: the latest payment results (real data). There is no
// notifications API, so read state is only a "new since last visit" marker
// kept on this device - nothing is marked read on the server.
export default function NotificationsPage() {
  const activity = useContext(ActivityContext)
  const [filter, setFilter] = useState('')
  const items = filter ? activity.items.filter((i) => i.status === filter) : activity.items

  return (
    <section>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Your latest payment results. New items are marked until you clear them."
        actions={
          <>
            <Button variant="secondary" icon={RefreshIcon} onClick={activity.reload}>
              Refresh
            </Button>
            <Button variant="soft" icon={CheckCircleIcon} onClick={activity.markSeen} disabled={activity.unread === 0}>
              Clear new badges
            </Button>
          </>
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button
                key={f.label}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition ring-inset ${
                  filter === f.value ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
            {activity.loading ? (
              <div className="space-y-3 p-3" role="status" aria-label="Loading notifications">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : activity.error ? (
              <ErrorState className="m-2" message={generalMessage(activity.error, 'Could not load notifications.')} onRetry={activity.reload} />
            ) : items.length === 0 ? (
              <EmptyState
                className="m-2 border-none"
                icon={BellIcon}
                title={filter ? 'Nothing in this view' : "You're all caught up"}
                action={
                  !filter && (
                    <ButtonLink to={PATHS.payment} icon={SendIcon} size="sm">
                      Make a payment
                    </ButtonLink>
                  )
                }
              >
                {filter ? 'No recent payments with this status.' : 'Payment results will appear here.'}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => (
                  <li key={item.reference}>
                    <ActivityItem item={item} isNew={activity.isNew(item)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          {activity.total > activity.items.length && (
            <div className="mt-4 text-center">
              <ButtonLink to={PATHS.transactions} variant="secondary" icon={ReceiptIcon}>
                See all {activity.total} transactions
              </ButtonLink>
            </div>
          )}
        </div>

        <aside className="h-fit space-y-4 rounded-3xl border border-sky-200 bg-sky-50/70 p-5 text-sm text-sky-900">
          <p className="flex items-center gap-2 font-semibold">
            <InfoIcon className="h-5 w-5" /> About notifications
          </p>
          <p>Every payment you make creates a notification here and in the bell at the top of the page.</p>
          <p>
            <span className="font-semibold">New</span> means it arrived since you last opened the bell or cleared the badges on this device.
          </p>
          <div className="rounded-2xl bg-white/80 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Not available yet</p>
            <p className="mt-1">
              Marking single items as read and syncing read state across devices need a notifications API, which this system does not have.
            </p>
            <Button variant="secondary" size="sm" className="mt-3" disabled title="Needs a notifications API">
              Mark as read (not available)
            </Button>
          </div>
        </aside>
      </div>
    </section>
  )
}
