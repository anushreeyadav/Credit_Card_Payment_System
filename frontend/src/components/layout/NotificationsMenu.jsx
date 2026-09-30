import { useCallback, useContext, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { ActivityContext } from '../../context/ActivityContext.js'
import useDismiss from '../../hooks/useDismiss.js'
import usePreferences from '../../hooks/usePreferences.js'
import { PATHS } from '../../routes/paths.js'
import { ArrowRightIcon, BellIcon, RefreshIcon } from '../icons.jsx'
import Skeleton from '../ui/Skeleton.jsx'
import ActivityItem from './ActivityItem.jsx'

// Bell + dropdown with the latest payment results. Opening it clears the
// "new" badge on this device (there is no server-side read state).
export default function NotificationsMenu() {
  const activity = useContext(ActivityContext)
  const { preferences } = usePreferences()
  const [open, setOpen] = useState(false)
  const wrapper = useRef(null)
  const button = useRef(null)

  const { markSeen } = activity
  // Items stay marked "New" while the panel is open; closing it clears them.
  const close = useCallback(
    (options) => {
      setOpen(false)
      markSeen()
      if (options?.restoreFocus) button.current?.focus()
    },
    [markSeen],
  )
  useDismiss(wrapper, open, close)

  const showBadge = preferences.activityBadge && activity.unread > 0

  function toggle() {
    if (open) return close()
    activity.reload()
    setOpen(true)
  }

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={showBadge ? `Notifications, ${activity.unread} new` : 'Notifications'}
        title="Notifications"
        className="relative grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
      >
        <BellIcon className="h-5 w-5" />
        {showBadge && (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
            {activity.unread > 9 ? '9+' : activity.unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Notifications panel"
          className="pop-in fixed inset-x-3 top-18 z-40 rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              <p className="text-xs text-slate-500">Your latest payment results</p>
            </div>
            <button
              type="button"
              onClick={activity.reload}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Refresh notifications"
              title="Refresh"
            >
              <RefreshIcon className="h-4.5 w-4.5" />
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {activity.loading ? (
              <div className="space-y-3 p-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : activity.error ? (
              <p className="p-4 text-sm text-red-700">Could not load notifications. Try the refresh button.</p>
            ) : activity.items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-900">You're all caught up</p>
                <p className="mt-1 text-xs text-slate-500">Payment results will appear here.</p>
              </div>
            ) : (
              activity.items.slice(0, 5).map((item) => (
                <ActivityItem key={item.reference} item={item} isNew={activity.isNew(item)} onOpen={() => close()} compact />
              ))
            )}
          </div>
          <div className="border-t border-slate-100 p-2">
            <Link
              to={PATHS.notifications}
              onClick={() => close()}
              className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
            >
              View all notifications <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
