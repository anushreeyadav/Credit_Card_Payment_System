import { useId } from 'react'

const POSITIONS = {
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  right: 'left-full top-1/2 ml-3 -translate-y-1/2',
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
}

// Hover/focus hint for compact controls. The trigger keeps its own accessible
// name (visible text or aria-label); the tooltip only adds a description.
export default function Tooltip({ label, children, side = 'bottom' }) {
  const id = useId()
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        id={id}
        role="tooltip"
        className={`theme-fixed tooltip-in pointer-events-none absolute z-50 hidden rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-lg group-focus-within/tip:block group-hover/tip:block ${POSITIONS[side]}`}
      >
        {label}
      </span>
    </span>
  )
}
