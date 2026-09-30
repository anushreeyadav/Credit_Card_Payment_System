import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import useAuth from '../../hooks/useAuth.js'
import useDismiss from '../../hooks/useDismiss.js'
import useLogout from '../../hooks/useLogout.js'
import { PATHS } from '../../routes/paths.js'
import { ChevronDownIcon, DatabaseIcon, KeyIcon, LogoutIcon, SettingsIcon, UserIcon } from '../icons.jsx'
import Avatar from '../ui/Avatar.jsx'
import Spinner from '../ui/Spinner.jsx'
import { displayName, roleLabel } from './navigation.js'

const itemClass =
  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 outline-none hover:bg-slate-100 hover:text-slate-900 focus-visible:bg-slate-100'

// Account dropdown in the header: a menu with arrow-key navigation.
export default function UserMenu() {
  const { user } = useAuth()
  const { busy, handleLogout } = useLogout()
  const [open, setOpen] = useState(false)
  const wrapper = useRef(null)
  const button = useRef(null)
  const menu = useRef(null)

  const close = useCallback((options) => {
    setOpen(false)
    if (options?.restoreFocus) button.current?.focus()
  }, [])
  useDismiss(wrapper, open, close)

  useEffect(() => {
    if (open) menu.current?.querySelector('[role="menuitem"]')?.focus()
  }, [open])

  function onMenuKey(event) {
    const items = [...menu.current.querySelectorAll('[role="menuitem"]')]
    const index = items.indexOf(document.activeElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      items[(index + 1) % items.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      items[(index - 1 + items.length) % items.length]?.focus()
    } else if (event.key === 'Tab') {
      close()
    }
  }

  const links = [
    { to: PATHS.profile, label: 'Profile', icon: UserIcon },
    { to: PATHS.settings, label: 'Settings', icon: SettingsIcon },
    { to: `${PATHS.settings}#security`, label: 'Security', icon: KeyIcon },
    ...(user.is_staff ? [{ to: PATHS.admin, label: 'Admin Console', icon: DatabaseIcon }] : []),
  ]

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2.5 rounded-2xl border border-transparent p-1 pr-2 transition hover:border-slate-200 hover:bg-white"
      >
        <Avatar user={user} className="h-9 w-9 text-xs" />
        <span className="hidden text-left xl:block">
          <span className="block max-w-36 truncate text-sm font-semibold text-slate-900">{displayName(user)}</span>
          <span className="block text-xs text-slate-500">{roleLabel(user)}</span>
        </span>
        <ChevronDownIcon className={`hidden h-4 w-4 text-slate-400 transition-transform sm:block ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKey}
          className="pop-in absolute top-full right-0 z-40 mt-2 w-64 rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/15"
        >
          <div className="flex items-center gap-3 px-3 pt-2 pb-3" role="presentation">
            <Avatar user={user} className="h-10 w-10 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{displayName(user)}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-2" role="presentation">
            {links.map(({ to, label, icon: Icon }) => (
              <Link key={label} to={to} role="menuitem" tabIndex={-1} onClick={() => close()} className={itemClass}>
                <Icon className="h-4.5 w-4.5 text-slate-400" />
                {label}
              </Link>
            ))}
          </div>
          <div className="mt-2 border-t border-slate-100 pt-2" role="presentation">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={handleLogout}
              disabled={busy}
              className={`${itemClass} text-red-600 hover:bg-red-50 hover:text-red-700`}
            >
              {busy ? <Spinner /> : <LogoutIcon className="h-4.5 w-4.5" />}
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
