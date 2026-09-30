import { useId } from 'react'

// On/off switch (a checkbox with role="switch"), always with a visible label.
// A disabled switch explains why it is disabled.
export default function Toggle({ label, description, checked, onChange, disabled = false, disabledReason }) {
  const id = useId()
  const hintId = `${id}-hint`
  const hint = disabled && disabledReason ? disabledReason : description
  return (
    <div className={`flex items-start justify-between gap-6 py-4 ${disabled ? 'opacity-70' : ''}`}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-slate-900">
          {label}
        </label>
        {hint && (
          <p id={hintId} className="mt-0.5 text-sm text-slate-500">
            {hint}
          </p>
        )}
      </div>
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={hint ? hintId : undefined}
          className="peer h-6 w-11 cursor-pointer appearance-none rounded-full bg-slate-300 transition-colors checked:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed"
        />
        <span
          className="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
          aria-hidden="true"
        />
      </span>
    </div>
  )
}
