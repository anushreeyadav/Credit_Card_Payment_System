import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import useAuth from '../../hooks/useAuth.js'
import useDismiss from '../../hooks/useDismiss.js'
import { PATHS } from '../../routes/paths.js'
import { ArrowRightIcon, KeyIcon, PlusIcon, ReceiptIcon, SearchIcon, XCircleIcon, ClockIcon } from '../icons.jsx'
import { ACCOUNT_NAV, ADMIN_CONSOLE, MAIN_NAV } from './navigation.js'

// There is no server-side search API, so this is a "jump to" box: it finds
// pages and common actions, and opens a transaction by its reference ID
// (looked up with the existing GET /api/payments/{reference} endpoint).
const ACTIONS = [
  { to: `${PATHS.cards}?add=1`, label: 'Add a new card', icon: PlusIcon, keywords: 'card save new' },
  { to: `${PATHS.transactions}?status=FAILED`, label: 'Show failed payments', icon: XCircleIcon, keywords: 'failed declined' },
  { to: `${PATHS.transactions}?status=PENDING`, label: 'Show pending payments', icon: ClockIcon, keywords: 'pending processing' },
  { to: `${PATHS.settings}#security`, label: 'Security settings', icon: KeyIcon, keywords: 'password session security' },
]
const REFERENCE = /^PAY-[0-9A-F]{6,32}$/i

export default function GlobalSearch() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapper = useRef(null)
  const input = useRef(null)
  const listId = useId()

  useDismiss(wrapper, open, () => setOpen(false))

  // "/" or Ctrl+K focuses the box from anywhere (except while typing in a field).
  useEffect(() => {
    const onKey = (event) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')
      if ((event.key === '/' && !typing) || (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey))) {
        event.preventDefault()
        input.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    const pages = [...MAIN_NAV, ...ACCOUNT_NAV, ...(user.is_staff ? [ADMIN_CONSOLE] : [])].map((item) => ({
      ...item,
      group: 'Pages',
      keywords: item.hint ?? '',
    }))
    const all = [...pages, ...ACTIONS.map((a) => ({ ...a, group: 'Actions' }))]
    const matches = term
      ? all.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(term))
      : all.slice(0, 6)
    const ref = query.trim()
    if (REFERENCE.test(ref)) {
      matches.unshift({
        to: `${PATHS.transactions}?ref=${encodeURIComponent(ref.toUpperCase())}`,
        label: `Open transaction ${ref.toUpperCase()}`,
        icon: ReceiptIcon,
        group: 'Transaction',
      })
    }
    return matches.slice(0, 8)
  }, [query, user.is_staff])

  function go(item) {
    setOpen(false)
    setQuery('')
    document.activeElement?.blur()
    navigate(item.to)
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((i) => (results.length ? (i + 1) % results.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
    } else if (event.key === 'Enter' && open && results[active]) {
      event.preventDefault()
      go(results[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapper} className="relative w-full max-w-md">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-label="Go to a page or payment ID"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search pages, actions or a PAY- reference…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pr-12 pl-10 text-sm text-slate-900 transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:outline-none"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-400 sm:block">
        Ctrl K
      </kbd>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="pop-in absolute top-full right-0 left-0 z-40 mt-2 max-h-96 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10"
        >
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-slate-500" role="presentation">
              No pages or actions match “{query}”. Transaction IDs look like PAY-1A2B3C…
            </li>
          ) : (
            results.map((item, index) => (
              <li
                key={`${item.group}-${item.to}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(item)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                  index === active ? 'bg-indigo-50 text-indigo-800' : 'text-slate-700'
                }`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${index === active ? 'bg-white text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                  <item.icon className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                <span className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">{item.group}</span>
                {index === active && <ArrowRightIcon className="h-4 w-4 text-indigo-500" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
