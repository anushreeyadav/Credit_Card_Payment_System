import { Link } from 'react-router-dom'

import { ArrowRightIcon } from '../icons.jsx'

const TONES = {
  indigo: { icon: 'bg-indigo-50 text-indigo-600 ring-indigo-100', glow: 'from-indigo-500/10' },
  sky: { icon: 'bg-sky-50 text-sky-600 ring-sky-100', glow: 'from-sky-500/10' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600 ring-emerald-100', glow: 'from-emerald-500/10' },
  rose: { icon: 'bg-rose-50 text-rose-600 ring-rose-100', glow: 'from-rose-500/10' },
  violet: { icon: 'bg-violet-50 text-violet-600 ring-violet-100', glow: 'from-violet-500/10' },
  amber: { icon: 'bg-amber-50 text-amber-600 ring-amber-100', glow: 'from-amber-500/10' },
}

// A clickable statistic. `value` null = still loading (skeleton); `trend` is
// optional and only shown when it is computed from real data.
export default function StatCard({ icon: Icon, label, value, hint, to, tone = 'indigo', testId, trend }) {
  const style = TONES[tone]
  return (
    <Link
      to={to}
      className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5"
    >
      <div className={`pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br ${style.glow} to-transparent`} />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ${style.icon}`}>
          <Icon className="h-5.5 w-5.5" />
        </span>
      </div>
      <p className="relative mt-2 truncate text-2xl font-bold tracking-tight text-slate-900 tabular-nums xl:text-[1.7rem]" data-testid={testId}>
        {value ?? <span className="inline-block h-8 w-16 animate-pulse rounded-lg bg-slate-100 align-middle" />}
      </p>
      <div className="relative mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1 font-medium text-slate-500 group-hover:text-indigo-600">
          {hint} <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
        {trend}
      </div>
    </Link>
  )
}
