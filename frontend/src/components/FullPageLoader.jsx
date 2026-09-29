import Spinner from './ui/Spinner.jsx'

export default function FullPageLoader({ label = 'Loading…' }) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Spinner className="h-7 w-7 text-indigo-600" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  )
}
