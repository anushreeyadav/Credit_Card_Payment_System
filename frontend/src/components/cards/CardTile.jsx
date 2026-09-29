import { PATHS } from '../../routes/paths.js'
import { BRANDS, formatCardExpiry, isExpired } from '../../utils/cards.js'
import { SendIcon, TrashIcon } from '../icons.jsx'
import Button, { ButtonLink } from '../ui/Button.jsx'

// A saved card, shown only in masked form as returned by the API.
export default function CardTile({ card, onDelete }) {
  const brand = BRANDS[card.card_type] ?? { label: card.card_type, gradient: 'from-slate-600 to-slate-800' }
  const expired = isExpired(card)

  return (
    <li
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
      data-testid="card-tile"
      aria-label={`${brand.label} ending in ${card.last4}`}
    >
      <div className={`relative aspect-[1.7/1] bg-gradient-to-br p-5 text-white ${brand.gradient}`}>
        <div className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-white/10" />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-start justify-between">
            <span className="h-7 w-10 rounded-md bg-gradient-to-br from-amber-200 to-amber-400 opacity-90" aria-hidden="true" />
            <span className="text-sm font-semibold tracking-wide">{brand.label}</span>
          </div>
          <p className="font-mono text-lg tracking-[0.12em] sm:text-xl" data-testid="card-masked-number">
            {card.masked_number}
          </p>
          <div className="flex items-end justify-between gap-3 text-xs">
            <div className="min-w-0">
              <p className="text-white/60 uppercase">Card holder</p>
              <p className="truncate text-sm font-medium">{card.cardholder_name}</p>
            </div>
            <div className="text-right">
              <p className="text-white/60 uppercase">Expires</p>
              <p className="text-sm font-medium tabular-nums">{formatCardExpiry(card)}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        {expired ? (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
            Expired
          </span>
        ) : (
          <span className="text-xs text-slate-500">Ending in {card.last4}</span>
        )}
        <div className="flex items-center gap-1">
          {!expired && (
            <ButtonLink
              to={`${PATHS.payment}?card=${card.id}`}
              variant="soft"
              size="sm"
              icon={SendIcon}
              aria-label={`Pay with ${brand.label} ending in ${card.last4}`}
            >
              Pay
            </ButtonLink>
          )}
          <Button
            variant="danger-soft"
            size="sm"
            icon={TrashIcon}
            onClick={() => onDelete(card)}
            aria-label={`Delete ${brand.label} ending in ${card.last4}`}
          >
            Delete
          </Button>
        </div>
      </div>
    </li>
  )
}
