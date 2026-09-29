import { AlertIcon, CheckCircleIcon, InfoIcon } from '../icons.jsx'

const STYLES = {
  success: { box: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20', icon: CheckCircleIcon },
  error: { box: 'bg-red-50 text-red-800 ring-red-600/20', icon: AlertIcon },
  warning: { box: 'bg-amber-50 text-amber-800 ring-amber-600/20', icon: AlertIcon },
  info: { box: 'bg-sky-50 text-sky-800 ring-sky-600/20', icon: InfoIcon },
}

export default function Alert({ variant = 'info', children, className = '' }) {
  const { box, icon: Icon } = STYLES[variant]
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`flex gap-3 rounded-lg px-3.5 py-3 text-sm ring-1 ring-inset ${box} ${className}`}
    >
      <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}
