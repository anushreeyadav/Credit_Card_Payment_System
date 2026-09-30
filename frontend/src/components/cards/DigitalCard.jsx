import { useId } from 'react'

import { brandOf, formatCardExpiry } from '../../utils/cards.js'

// Card artwork built only from the masked data the API returns
// (masked number, last 4, brand, holder, expiry). Never a full number or CVV.
export default function DigitalCard({ card, numberTestId, size = 'md' }) {
  const brand = brandOf(card)
  const small = size === 'sm'
  const patternId = `card-lines-${useId().replace(/[^\w-]/g, '')}` // safe inside url(#...)
  return (
    <div
      className={`theme-fixed relative isolate aspect-[1.586/1] overflow-hidden bg-gradient-to-br text-white shadow-lg ${brand.gradient} ${
        small ? 'rounded-2xl p-4' : 'rounded-3xl p-5'
      }`}
    >
      {/* Decorative light and pattern */}
      <div className="pointer-events-none absolute -top-16 -right-12 -z-10 h-48 w-48 rounded-full bg-white/15 blur-sm" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 -z-10 h-44 w-44 rounded-full bg-black/15" />
      <svg className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-[0.07]" aria-hidden="true">
        <defs>
          <pattern id={patternId} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="18" stroke="white" strokeWidth="6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>

      <div className="flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <p className={`font-semibold tracking-[0.2em] text-white/70 uppercase ${small ? 'text-[9px]' : 'text-[10px]'}`}>Credit card</p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`rounded-md bg-gradient-to-br from-amber-100 via-amber-300 to-amber-500 shadow-inner ${small ? 'h-6 w-8' : 'h-7 w-10'}`}
                aria-hidden="true"
              />
              <svg viewBox="0 0 24 24" className={`${small ? 'h-4 w-4' : 'h-5 w-5'} text-white/80`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M8.5 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M15.5 3.5a12 12 0 0 1 0 17" />
              </svg>
            </div>
          </div>
          <span className={`font-bold tracking-wide italic ${small ? 'text-sm' : 'text-base'}`}>{brand.label}</span>
        </div>

        <p className={`font-mono tracking-[0.14em] ${small ? 'text-base' : 'text-lg sm:text-xl'}`} data-testid={numberTestId}>
          {card.masked_number}
        </p>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] tracking-wider text-white/60 uppercase">Card holder</p>
            <p className={`truncate font-semibold tracking-wide uppercase ${small ? 'text-xs' : 'text-sm'}`}>{card.cardholder_name}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] tracking-wider text-white/60 uppercase">Expires</p>
            <p className={`font-semibold tabular-nums ${small ? 'text-xs' : 'text-sm'}`}>{formatCardExpiry(card)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
