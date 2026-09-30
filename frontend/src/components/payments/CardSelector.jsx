import { BRANDS, formatCardExpiry, isExpired } from '../../utils/cards.js'

// Radio list of saved cards (masked). Expired cards are shown but cannot be chosen.
export default function CardSelector({ cards, value, onChange, error }) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Select card</legend>
      <div className="mt-2 grid gap-3" role="radiogroup" aria-invalid={error ? true : undefined}>
        {cards.map((card) => {
          const brand = BRANDS[card.card_type] ?? { label: card.card_type, gradient: 'from-slate-600 to-slate-800' }
          const expired = isExpired(card)
          const selected = value === card.id
          return (
            <label
              key={card.id}
              className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3.5 transition duration-150 sm:gap-4 ${
                expired
                  ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
                  : selected
                    ? 'cursor-pointer border-indigo-500 bg-indigo-50/60 shadow-sm ring-4 ring-indigo-500/10'
                    : 'cursor-pointer border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="card"
                value={card.id}
                checked={selected}
                disabled={expired}
                onChange={() => onChange(card.id)}
                className="h-4 w-4 accent-indigo-600"
                aria-label={`${brand.label} ${card.masked_number}`}
              />
              <span
                className={`theme-fixed grid h-10 w-16 shrink-0 place-items-center rounded-lg bg-gradient-to-br shadow-sm text-[10px] font-bold text-white ${brand.gradient}`}
                aria-hidden="true"
              >
                {brand.label.split(' ')[0].toUpperCase().slice(0, 6)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-sm tracking-wider text-slate-900">{card.masked_number}</span>
                <span className="block truncate text-xs text-slate-500">
                  {card.cardholder_name} · Expires {formatCardExpiry(card)}
                </span>
              </span>
              {expired ? (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Expired</span>
              ) : (
                selected && (
                  <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-semibold text-white">Selected</span>
                )
              )}
            </label>
          )
        })}
      </div>
      {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
    </fieldset>
  )
}
