import { AlertIcon, RefreshIcon } from '../icons.jsx'
import Button from './Button.jsx'

// A section that failed to load. `message` must already be user-friendly
// (see utils/errors.js generalMessage) - never a raw server response.
export default function ErrorState({ message, onRetry, className = '', compact = false }) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center gap-3 rounded-3xl border border-red-200 bg-red-50/60 text-center ${compact ? 'p-5' : 'p-8'} ${className}`}
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-red-100 text-red-600">
        <AlertIcon className="h-5.5 w-5.5" />
      </span>
      <p className="max-w-md text-sm font-medium text-red-800">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={RefreshIcon} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
