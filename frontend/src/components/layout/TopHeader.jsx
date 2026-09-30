import { useState } from 'react'
import { Link } from 'react-router-dom'

import { PATHS } from '../../routes/paths.js'
import usePreferences, { isDark } from '../../hooks/usePreferences.js'
import { ChevronRightIcon, MenuIcon, MoonIcon, SearchIcon, SunIcon, XIcon } from '../icons.jsx'
import Logo from '../ui/Logo.jsx'
import GlobalSearch from './GlobalSearch.jsx'
import NotificationsMenu from './NotificationsMenu.jsx'
import UserMenu from './UserMenu.jsx'

// crumbs: [{ label, to? }] - the last one is the current page.
export default function TopHeader({ crumbs, onOpenMenu, homeTo = PATHS.dashboard, showNotifications = true, accent = false }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const { preferences, setPreference } = usePreferences()
  const dark = isDark(preferences)

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-slate-50/85 backdrop-blur-md">
      <div className="flex h-18 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden"
          aria-label="Open navigation menu"
          title="Menu"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <Link to={homeTo} aria-label="CardPay home" className="lg:hidden">
          <Logo />
        </Link>

        <nav aria-label="Breadcrumb" className="hidden min-w-0 lg:block">
          <ol className="flex items-center gap-1.5 text-sm">
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1
              return (
                <li key={crumb.label} className="flex min-w-0 items-center gap-1.5">
                  {index > 0 && <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300" />}
                  {last || !crumb.to ? (
                    <span
                      aria-current={last ? 'page' : undefined}
                      className={`truncate ${last ? `text-base font-semibold ${accent ? 'text-violet-700' : 'text-slate-900'}` : 'text-slate-500'}`}
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <Link to={crumb.to} className="truncate text-slate-500 hover:text-indigo-600">
                      {crumb.label}
                    </Link>
                  )}
                </li>
              )
            })}
          </ol>
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden w-72 md:block xl:w-96">
            <GlobalSearch />
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            aria-expanded={searchOpen}
            aria-label={searchOpen ? 'Close quick find' : 'Open quick find'}
            className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm md:hidden"
          >
            {searchOpen ? <XIcon className="h-5 w-5" /> : <SearchIcon className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => setPreference('theme', dark ? 'light' : 'dark')}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            title={dark ? 'Light theme' : 'Dark theme'}
            className="hidden h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 sm:grid"
          >
            {dark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
          </button>
          {showNotifications && <NotificationsMenu />}
          <UserMenu />
        </div>
      </div>
      {searchOpen && (
        <div className="px-4 pb-3 md:hidden">
          <GlobalSearch />
        </div>
      )}
    </header>
  )
}
