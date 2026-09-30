import { useState } from 'react'
import { Link } from 'react-router-dom'

import useAuth from '../../hooks/useAuth.js'
import useLogout from '../../hooks/useLogout.js'
import { PATHS } from '../../routes/paths.js'
import { ArrowLeftIcon, LogoutIcon } from '../icons.jsx'
import Avatar from '../ui/Avatar.jsx'
import Logo from '../ui/Logo.jsx'
import Spinner from '../ui/Spinner.jsx'
import MobileDrawer from './MobileDrawer.jsx'
import { ADMIN_NAV, displayName } from './navigation.js'
import TopHeader from './TopHeader.jsx'

// Admin navigation: sections live in ?tab=, so the current one is passed in
// (NavLink cannot tell query strings apart).
function AdminNav({ active, onNavigate, label = 'Admin' }) {
  return (
    <nav aria-label={label} className="space-y-1">
      {ADMIN_NAV.map(({ id, to, label: text, icon: Icon }) => {
        const current = id === active
        return (
          <Link
            key={id}
            to={to}
            onClick={onNavigate}
            aria-current={current ? 'page' : undefined}
            className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
              current ? 'bg-white/10 text-white shadow-inner ring-1 ring-white/10' : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span
              className={`grid h-8 w-8 place-items-center rounded-xl transition ${
                current ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-900/40' : 'bg-white/5 text-slate-400 group-hover:text-white'
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
            </span>
            {text}
          </Link>
        )
      })}
    </nav>
  )
}

function AdminSidebar({ active, onNavigate }) {
  const { user } = useAuth()
  const { busy, handleLogout } = useLogout()
  return (
    <div className="theme-fixed flex h-full flex-col bg-slate-950 text-white">
      <div className="flex h-18 shrink-0 items-center gap-3 px-5">
        <Link to={PATHS.admin} aria-label="Admin console home" onClick={onNavigate}>
          <Logo inverted />
        </Link>
        <span className="rounded-md bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-violet-200 uppercase">Admin</span>
      </div>
      <div className="mx-3 flex items-center gap-3 rounded-2xl bg-white/5 p-2.5 ring-1 ring-white/10">
        <Avatar user={user} className="h-10 w-10 text-sm ring-slate-900" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{displayName(user)}</p>
          <p className="text-xs text-slate-400">Administrator</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Console</p>
        <AdminNav active={active} onNavigate={onNavigate} />
      </div>
      <div className="shrink-0 space-y-1 border-t border-white/10 p-3">
        <Link
          to={PATHS.dashboard}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white"
        >
          <ArrowLeftIcon className="h-5 w-5" />
          Back to CardPay
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          disabled={busy}
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-60"
        >
          {busy ? <Spinner /> : <LogoutIcon className="h-5 w-5" />}
          Log out
        </button>
      </div>
    </div>
  )
}

// Separate layout for the admin console, so customer and admin tools never mix.
export default function AdminShell({ active, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const section = ADMIN_NAV.find((item) => item.id === active)
  const crumbs = [{ label: 'Admin Console', to: PATHS.admin }, { label: section?.label ?? 'Dashboard' }]

  return (
    <div className="min-h-screen bg-slate-100/70 lg:flex">
      <div className="theme-fixed hidden w-64 shrink-0 bg-slate-950 lg:block">
        <aside className="sticky top-0 h-screen">
          <AdminSidebar active={active} />
        </aside>
      </div>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} label="Admin navigation" dark>
        <AdminSidebar active={active} onNavigate={() => setDrawerOpen(false)} />
      </MobileDrawer>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <TopHeader crumbs={crumbs} onOpenMenu={() => setDrawerOpen(true)} homeTo={PATHS.admin} showNotifications={false} accent />
        {/* Phones and tablets: sections as a scrollable row of pills. */}
        <nav aria-label="Admin sections" className="border-b border-slate-200 bg-white/70 lg:hidden">
          <div className="relative flex gap-2 overflow-x-auto px-4 py-2.5 sm:px-6">
            {ADMIN_NAV.map(({ id, to, label, icon: Icon }) => (
              <Link
                key={id}
                to={to}
                aria-current={id === active ? 'page' : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset ${
                  id === active ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-600 ring-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </div>
        </nav>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-10 sm:px-6 lg:px-8 lg:pt-8">
          <div key={active} className="page-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
