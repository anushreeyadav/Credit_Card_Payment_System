// Brand mark. `compact` hides the word mark on the icon-only sidebar rail (lg), showing it again from xl.
export default function Logo({ inverted = false, compact = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`grid h-9 w-9 place-items-center rounded-xl text-sm font-bold shadow-sm ${
          inverted
            ? 'bg-white text-indigo-700'
            : 'bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 text-white shadow-indigo-600/30'
        }`}
        aria-hidden="true"
      >
        CC
      </span>
      <span
        className={`text-lg font-bold tracking-tight ${inverted ? 'text-white' : 'text-slate-900'} ${compact ? 'hidden xl:inline' : ''}`}
      >
        Card<span className={inverted ? 'text-indigo-200' : 'text-indigo-600'}>Pay</span>
      </span>
    </span>
  )
}
