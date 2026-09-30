import { useState } from 'react'

import { CardIcon, ChevronDownIcon, ClockIcon, HelpIcon, LockIcon, MailIcon, ReceiptIcon, SearchIcon, SendIcon, XCircleIcon, CheckCircleIcon } from '../components/icons.jsx'
import PageHeader from '../components/layout/PageHeader.jsx'
import Button, { ButtonLink } from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { PATHS } from '../routes/paths.js'

const FAQS = [
  {
    q: 'How do I add a card?',
    icon: CardIcon,
    a: 'Open My Cards and choose “Add card”. Enter the card number, the name on the card and the expiry date. The number is checked and then only a masked version and the last 4 digits are saved.',
    link: { to: `${PATHS.cards}?add=1`, label: 'Add a card' },
  },
  {
    q: 'How do I make a payment?',
    icon: SendIcon,
    a: 'Go to Make Payment, pick one of your saved cards, enter the amount (and an optional note) and press Pay. The result appears straight away.',
    link: { to: PATHS.payment, label: 'Make a payment' },
  },
  {
    q: 'Where can I see my transactions?',
    icon: ReceiptIcon,
    a: 'Transactions lists every payment with its ID, date, masked card, amount and status. Filter by status, amount or date, and open any row for full details.',
    link: { to: PATHS.transactions, label: 'Open transactions' },
  },
  {
    q: 'What does PENDING mean?',
    icon: ClockIcon,
    a: 'The payment has been recorded but its final result is not known yet. Do not pay again: check the status in a moment from the payment screen or Transactions.',
  },
  {
    q: 'What does SUCCESS mean?',
    icon: CheckCircleIcon,
    a: 'The payment was approved and completed. It counts towards your total paid on the dashboard and in analytics.',
  },
  {
    q: 'What does FAILED mean?',
    icon: XCircleIcon,
    a: 'The payment was declined, for example because the card has expired or the amount is above the limit. No money was taken; the reason is shown with the payment.',
  },
  {
    q: 'How is my card information protected?',
    icon: LockIcon,
    a: 'The full card number is never stored or shown: only a masked number such as **** **** **** 1234 and the last 4 digits are kept, and no CVV is asked for or saved. Payments refer to a saved card by its reference, and your session uses short-lived tokens kept in memory plus a secure cookie.',
  },
  {
    q: 'Why was I signed out?',
    icon: LockIcon,
    a: 'Sessions end when you log out or when your session can no longer be renewed (for example after clearing cookies). Just sign in again; your cards and history are kept.',
  },
]

export default function HelpPage() {
  const [query, setQuery] = useState('')
  const term = query.trim().toLowerCase()
  const results = term ? FAQS.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(term)) : FAQS

  return (
    <section>
      <PageHeader eyebrow="Support" title="Help & Support" description="Answers to common questions about cards, payments and security." />

      <div className="theme-fixed relative mt-6 overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-900 p-6 text-white shadow-xl sm:p-10">
        <div className="pointer-events-none absolute -top-20 -right-10 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
        <h2 className="relative text-2xl font-bold sm:text-3xl">How can we help?</h2>
        <p className="relative mt-1 text-indigo-200">Search the frequently asked questions.</p>
        <div className="relative mt-5 max-w-xl">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <label htmlFor="help-search" className="sr-only">
            Search help articles
          </label>
          <input
            id="help-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. pending, add card, security"
            className="h-13 w-full rounded-2xl border-0 bg-white pr-4 pl-12 text-slate-900 shadow-lg placeholder:text-slate-400 focus:ring-4 focus:ring-indigo-400/40 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Frequently asked questions {term && `· ${results.length} found`}
          </h2>
          {results.length === 0 ? (
            <EmptyState
              icon={HelpIcon}
              tone="slate"
              title="No answers match your search"
              action={
                <Button variant="secondary" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              }
            >
              Try a shorter word such as “card” or “payment”.
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {results.map(({ q, a, icon: Icon, link }) => (
                <details key={q} className="group rounded-3xl border border-slate-200 bg-white shadow-sm transition open:shadow-md">
                  <summary className="flex cursor-pointer list-none items-center gap-3 rounded-3xl p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex-1 font-semibold text-slate-900">{q}</span>
                    <ChevronDownIcon className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-5 pl-[4.25rem] text-sm leading-relaxed text-slate-600 sm:px-5 sm:pl-[4.75rem]">
                    <p>{a}</p>
                    {link && (
                      <ButtonLink to={link.to} variant="soft" size="sm" className="mt-3">
                        {link.label}
                      </ButtonLink>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>

        <aside className="h-fit space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-600">
              <MailIcon className="h-5 w-5" />
            </span>
            <h2 className="mt-3 font-semibold text-slate-900">Contact support</h2>
            <p className="mt-1 text-sm text-slate-600">
              This demo has no support desk or messaging service connected, so messages cannot be sent from here.
            </p>
            <Button variant="secondary" className="mt-4 w-full" disabled title="No support service is connected">
              Contact support (not available)
            </Button>
            <p className="mt-3 text-xs text-slate-500">For account problems, contact the administrator who runs this system.</p>
          </div>
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5 text-sm text-emerald-900">
            <p className="flex items-center gap-2 font-semibold">
              <LockIcon className="h-5 w-5" /> Security tip
            </p>
            <p className="mt-1">We never ask for your password or card number by email or chat. Only enter them on this site.</p>
          </div>
        </aside>
      </div>
    </section>
  )
}
