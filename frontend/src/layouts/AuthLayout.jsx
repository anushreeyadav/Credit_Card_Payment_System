import { Outlet } from 'react-router-dom'

import { BoltIcon, CardIcon, LockIcon, ShieldIcon } from '../components/icons.jsx'
import Logo from '../components/ui/Logo.jsx'

const FEATURES = [
  { icon: LockIcon, title: 'Card data never stored', text: 'Only a masked number and last 4 digits are kept. CVVs are never saved.' },
  { icon: ShieldIcon, title: 'Secure sessions', text: 'Short-lived access tokens with an httpOnly refresh cookie.' },
  { icon: BoltIcon, title: 'Instant payments', text: 'Pay with a saved card and see the result straight away.' },
  { icon: CardIcon, title: 'Full history', text: 'Filter every transaction by status, amount and date.' },
]

// Split screen on large displays: brand panel left, form right. Form only on small screens.
export default function AuthLayout() {
  return (
    <div className="flex min-h-screen bg-white">
      <aside className="relative hidden w-[44%] max-w-xl overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />

        <Logo inverted />
        <div className="relative mt-16">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">
            Card payments,
            <br />
            built on trust.
          </h2>
          <p className="mt-4 max-w-sm text-indigo-100/90">
            Save cards securely, pay in seconds and keep a clear record of every transaction.
          </p>
        </div>

        <ul className="relative mt-12 space-y-6">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <Icon className="h-5 w-5 text-indigo-100" />
              </span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="mt-0.5 text-sm text-indigo-100/75">{text}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="relative mt-auto pt-12 text-xs text-indigo-200/70">
          Demo environment · Payments are simulated and no real money moves.
        </p>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Logo className="mb-8 lg:hidden" />
          <Outlet />
        </div>
      </main>
    </div>
  )
}
