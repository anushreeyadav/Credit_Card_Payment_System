import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import { ActivityContext } from '../../context/ActivityContext.js'
import useActivity from '../../hooks/useActivity.js'
import { PATHS } from '../../routes/paths.js'
import { CardIcon, HomeIcon, MenuIcon, ReceiptIcon, SendIcon } from '../icons.jsx'
import MobileDrawer from './MobileDrawer.jsx'
import { pageTitle } from './navigation.js'
import SidebarContent from './Sidebar.jsx'
import TopHeader from './TopHeader.jsx'

// Short labels for the phone tab bar; the accessible name is the full page name
// (which contains the visible text, so voice control still works).
const TABS = [
  { to: PATHS.dashboard, short: 'Dashboard', icon: HomeIcon },
  { to: PATHS.cards, short: 'Cards', label: 'My Cards', icon: CardIcon },
  { to: PATHS.payment, short: 'Pay', label: 'Make Payment', icon: SendIcon },
  { to: PATHS.transactions, short: 'Transactions', icon: ReceiptIcon },
]

function BottomNav({ onMore }) {
  const tab = 'flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 pt-2 pb-2 text-[11px] font-semibold'
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_-8px_rgb(15_23_42/0.15)] backdrop-blur lg:hidden"
      aria-label="Quick navigation"
    >
      <div className="mx-auto flex max-w-lg justify-around">
        {TABS.map(({ to, short, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            aria-label={label}
            className={({ isActive }) => `${tab} ${isActive ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {({ isActive }) => (
              <>
                <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${isActive ? 'bg-indigo-100' : ''}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="max-w-full truncate">{short}</span>
              </>
            )}
          </NavLink>
        ))}
        <button type="button" onClick={onMore} className={`${tab} text-slate-500 hover:text-slate-800`}>
          <span className="grid h-7 w-12 place-items-center rounded-full">
            <MenuIcon className="h-5 w-5" />
          </span>
          More
        </button>
      </div>
    </nav>
  )
}

// Signed-in customer layout: sidebar (drawer on phones), header, content.
export default function AppShell({ children }) {
  const { pathname } = useLocation()
  const activity = useActivity()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Refresh notifications when the user moves between pages (e.g. after paying).
  const { reload } = activity
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    reload()
  }, [pathname, reload])

  const crumbs =
    pathname === PATHS.dashboard ? [{ label: 'Dashboard' }] : [{ label: 'Home', to: PATHS.dashboard }, { label: pageTitle(pathname) }]

  return (
    <ActivityContext.Provider value={activity}>
      <div className="min-h-screen bg-slate-50 lg:flex">
        {/* Desktop sidebar: the outer column stretches with the page, the inner panel stays in view. */}
        <div className="hidden w-20 shrink-0 border-r border-slate-200/80 bg-gradient-to-b from-white to-slate-50 lg:block xl:w-72">
          <aside className="sticky top-0 h-screen">
            <SidebarContent rail testIds />
          </aside>
        </div>

        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} label="Navigation menu">
          <SidebarContent onNavigate={() => setDrawerOpen(false)} />
        </MobileDrawer>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <TopHeader crumbs={crumbs} onOpenMenu={() => setDrawerOpen(true)} />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-10">
            <div key={pathname} className="page-in">
              {children}
            </div>
          </main>
          <footer className="hidden border-t border-slate-200 py-4 text-center text-xs text-slate-400 lg:block">
            CardPay · Demo environment · Payments are simulated and no real money moves
          </footer>
        </div>
        <BottomNav onMore={() => setDrawerOpen(true)} />
      </div>
    </ActivityContext.Provider>
  )
}
