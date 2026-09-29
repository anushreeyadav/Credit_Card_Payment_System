export default function Logo({ inverted = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-bold ${
          inverted ? 'bg-white text-indigo-700' : 'bg-indigo-600 text-white'
        }`}
        aria-hidden="true"
      >
        CC
      </span>
      <span className={`text-base font-semibold tracking-tight ${inverted ? 'text-white' : 'text-slate-900'}`}>
        CardPay
      </span>
    </span>
  )
}
