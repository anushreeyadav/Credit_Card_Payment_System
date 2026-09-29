import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'

import useAuth from '../../hooks/useAuth.js'
import { PATHS } from '../../routes/paths.js'
import { CardIcon, ChartIcon, HomeIcon, LogoutIcon, ReceiptIcon, SendIcon } from '../icons.jsx'
import { ButtonLink } from '../ui/Button.jsx'
import Logo from '../ui/Logo.jsx'
import Spinner from '../ui/Spinner.jsx'

const NAV = [
  { to: PATHS.dashboard, label: 'Dashboard', icon: HomeIcon },
  { to: PATHS.cards, label: 'Cards', icon: CardIcon },
  { to: PATHS.payment, label: 'Pay', icon: SendIcon },
  { to: PATHS.transactions, label: 'Transactions', icon: ReceiptIcon },
]
const ADMIN_NAV = { to: PATHS.admin, label: 'Admin', icon: ChartIcon }

function navItems(user) {
  return user?.is_staff ? [...NAV, ADMIN_NAV] : NAV
}

function initials(user) {
  const fromName = `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`
  return (fromName || user.username.slice(0, 2)).toUpperCase()
}

function Avatar({ user, className = 'h-9 w-9 text-sm' }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 font-semibold text-white shadow-sm ${className}`}
      aria-hidden="true"
    >
      {initials(user)}
    </span>
  )
}

function useLogout() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  async function handleLogout() {
    setBusy(true)
    await logout()
    navigate(PATHS.login, { replace: true })
  }
  return { busy, handleLogout }
}

// --- Desktop sidebar -----------------------------------------------------------------------

function Sidebar() {
  const { user } = useAuth()
  const { busy, handleLogout } = useLogout()
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username

  return (
    // The outer column stretches with the page; the inner panel stays in view while scrolling.
    <div className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
      <aside className="sticky top-0 z-20 flex h-screen flex-col">
        <div className="flex h-16 items-center px-6">
          <Link to={PATHS.dashboard} aria-label="CardPay home">
            <Logo />
          </Link>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main">
          <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Menu</p>
          {navItems(user).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 shadow-[inset_3px_0_0_0] shadow-indigo-600'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon className="h-5 w-5 shrink-0 opacity-80 group-hover:opacity-100" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 pb-4">
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 p-4 text-white shadow-lg shadow-indigo-600/20">
            <p className="text-sm font-semibold">Pay in seconds</p>
            <p className="mt-1 text-xs text-indigo-100">Pick a saved card and pay in a few taps.</p>
            <ButtonLink
              to={PATHS.payment}
              variant="secondary"
              size="sm"
              icon={SendIcon}
              className="mt-3 w-full !text-indigo-700 !ring-0"
            >
              New payment
            </ButtonLink>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-slate-200 px-4 py-4">
          <Avatar user={user} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900" data-testid="nav-user">
              {displayName}
            </p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={busy}
            title="Log out"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
          >
            {busy ? <Spinner /> : <LogoutIcon className="h-4.5 w-4.5" />}
            <span>Log out</span>
          </button>
        </div>
      </aside>
    </div>
  )
}

// --- Mobile: top bar + bottom tabs ------------------------------------------------------------

function MobileHeader() {
  const { user } = useAuth()
  const { busy, handleLogout } = useLogout()
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
      <Link to={PATHS.dashboard} aria-label="CardPay home">
        <Logo />
      </Link>
      <div className="flex items-center gap-2">
        <Avatar user={user} className="h-8 w-8 text-xs" />
        <button
          type="button"
          onClick={handleLogout}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
        >
          {busy ? <Spinner /> : <LogoutIcon className="h-4.5 w-4.5" />}
          <span>Log out</span>
        </button>
      </div>
    </header>
  )
}

function BottomNav() {
  const { user } = useAuth()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-md justify-around">
        {navItems(user).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 pt-2 pb-2 text-[11px] font-medium ${
                isActive ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${isActive ? 'bg-indigo-100' : ''}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export default function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <Sidebar />
      <MobileHeader />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pt-10 lg:pb-10">
          {children}
        </main>
        <footer className="hidden border-t border-slate-200 py-4 text-center text-xs text-slate-400 lg:block">
          CardPay · Demo environment · Payments are simulated
        </footer>
      </div>
      <BottomNav />
    </div>
  )
}
