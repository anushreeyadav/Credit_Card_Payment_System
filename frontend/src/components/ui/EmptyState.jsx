import { InfoIcon } from '../icons.jsx'

const TONES = {
  indigo: 'from-indigo-100 to-violet-100 text-indigo-600',
  emerald: 'from-emerald-100 to-teal-100 text-emerald-600',
  slate: 'from-slate-100 to-slate-200 text-slate-500',
}

// Friendly "nothing here yet" panel with an optional call to action.
export default function EmptyState({ icon: Icon = InfoIcon, title, children, action, className = '', testId, tone = 'indigo' }) {
  return (
    <div className={`rounded-3xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center ${className}`} data-testid={testId}>
      <span className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${TONES[tone]}`}>
        <Icon className="h-7 w-7" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
      {children && <div className="mx-auto mt-1 max-w-sm text-sm text-slate-600">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
