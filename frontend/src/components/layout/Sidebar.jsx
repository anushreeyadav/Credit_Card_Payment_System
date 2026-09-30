import { useContext } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { ActivityContext } from '../../context/ActivityContext.js'
import useAuth from '../../hooks/useAuth.js'
import useLogout from '../../hooks/useLogout.js'
import usePreferences from '../../hooks/usePreferences.js'
import { PATHS } from '../../routes/paths.js'
import { LogoutIcon } from '../icons.jsx'
import Avatar from '../ui/Avatar.jsx'
import Logo from '../ui/Logo.jsx'
import Spinner from '../ui/Spinner.jsx'
import { ACCOUNT_NAV, ADMIN_CONSOLE, displayName, MAIN_NAV, roleLabel } from './navigation.js'

// `rail` (desktop sidebar): icons only on laptop widths (lg), full labels from xl.
// Labels stay in the accessibility tree either way (sr-only), so every link keeps its name.
const railLabel = (rail) => (rail ? 'sr-only xl:not-sr-only' : '')

function NavItem({ item, rail, badge, onNavigate }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
          rail ? 'justify-center xl:justify-start' : ''
        } ${
          isActive
            ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25'
            : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600'}`} />
          <span className={`${railLabel(rail)} flex-1 truncate`}>{item.label}</span>
          {badge > 0 && (
            <span
              className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold ${
                rail ? 'absolute top-1 right-1 xl:static' : ''
              } ${isActive ? 'bg-white text-indigo-700' : 'bg-rose-500 text-white'}`}
            >
              {badge > 9 ? '9+' : badge}
              <span className="sr-only"> new</span>
            </span>
          )}
          {rail && (
            // Visual hint for the icon-only rail; the real name is the sr-only label above.
            <span
              aria-hidden="true"
              className="theme-fixed pointer-events-none absolute top-1/2 left-full z-50 ml-3 hidden -translate-y-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-lg group-hover:block group-focus-visible:block xl:!hidden"
            >
              {item.label}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function Section({ title, rail, children }) {
  return (
    <div className="space-y-1">
      <p className={`px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase ${rail ? 'hidden xl:block' : ''}`}>
        {title}
      </p>
      {rail && <div className="mx-3 my-3 border-t border-slate-200 xl:hidden" aria-hidden="true" />}
      {children}
    </div>
  )
}

// Shared by the desktop sidebar and the mobile drawer.
export default function SidebarContent({ rail = false, onNavigate, testIds = false }) {
  const { user } = useAuth()
  const { busy, handleLogout } = useLogout()
  const activity = useContext(ActivityContext)
  const { preferences } = usePreferences()
  const unread = preferences.activityBadge ? activity?.unread ?? 0 : 0

  return (
    <div className="flex h-full flex-col">
      <div className={`flex h-18 shrink-0 items-center px-5 ${rail ? 'justify-center xl:justify-start' : ''}`}>
        <Link to={PATHS.dashboard} aria-label="CardPay home" onClick={onNavigate}>
          <Logo compact={rail} />
        </Link>
      </div>

      <div className={`mx-3 flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-sm ${rail ? 'justify-center xl:justify-start' : ''}`}>
        <Avatar user={user} className="h-10 w-10 text-sm" />
        <div className={`min-w-0 flex-1 ${rail ? 'hidden xl:block' : ''}`}>
          <p className="truncate text-sm font-semibold text-slate-900" data-testid={testIds ? 'nav-user' : undefined}>
            {displayName(user)}
          </p>
          <span
            className={`mt-0.5 inline-flex rounded-full px-2 py-px text-[11px] font-semibold ${
              user.is_staff ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {roleLabel(user)}
          </span>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
        <Section title="Menu" rail={rail}>
          {MAIN_NAV.map((item) => (
            <NavItem key={item.to} item={item} rail={rail} onNavigate={onNavigate} badge={item.badge ? unread : 0} />
          ))}
        </Section>
        <Section title="Account" rail={rail}>
          {ACCOUNT_NAV.map((item) => (
            <NavItem key={item.to} item={item} rail={rail} onNavigate={onNavigate} />
          ))}
        </Section>
        {user.is_staff && (
          <Section title="Administration" rail={rail}>
            <NavItem item={ADMIN_CONSOLE} rail={rail} onNavigate={onNavigate} />
          </Section>
        )}
      </nav>

      <div className="shrink-0 border-t border-slate-200 p-3">
        <button
          type="button"
          onClick={handleLogout}
          disabled={busy}
          title="Log out of CardPay"
          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60 ${
            rail ? 'justify-center xl:justify-start' : ''
          }`}
        >
          {busy ? <Spinner /> : <LogoutIcon className="h-5 w-5 shrink-0" />}
          <span className={railLabel(rail)}>Log out</span>
        </button>
      </div>
    </div>
  )
}
