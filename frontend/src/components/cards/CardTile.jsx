import { PATHS } from '../../routes/paths.js'
import { brandOf, isExpired } from '../../utils/cards.js'
import { SendIcon, TrashIcon } from '../icons.jsx'
import Button, { ButtonLink } from '../ui/Button.jsx'
import DigitalCard from './DigitalCard.jsx'

// A saved card, shown only in masked form as returned by the API.
export default function CardTile({ card, onDelete }) {
  const brand = brandOf(card)
  const expired = isExpired(card)

  return (
    <li
      className="group flex flex-col rounded-3xl border border-slate-200 bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/10"
      data-testid="card-tile"
      aria-label={`${brand.label} ending in ${card.last4}`}
    >
      <DigitalCard card={card} numberTestId="card-masked-number" />
      <div className="flex items-center justify-between gap-3 px-1 pt-3">
        {expired ? (
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-600/20 ring-inset">
            Expired
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Active · ending in {card.last4}
          </span>
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
