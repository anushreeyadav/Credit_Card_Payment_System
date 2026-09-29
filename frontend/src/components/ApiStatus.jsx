import useApiStatus from '../hooks/useApiStatus.js'
import { DJANGO_API_URL, FASTAPI_URL } from '../services/config.js'

const STATE = {
  checking: { dot: 'bg-slate-300 animate-pulse', text: 'text-slate-500' },
  online: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  offline: { dot: 'bg-red-500', text: 'text-red-700' },
}

// "" = same origin as the page (the APIs sit behind the same reverse proxy).
const shown = (url) => url || globalThis.location?.origin || 'same origin'

function Row({ name, role, url, state }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">
          {name} <span className="font-normal text-slate-400">· {role}</span>
        </p>
        <p className="truncate font-mono text-xs text-slate-500">{shown(url)}</p>
      </div>
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${STATE[state].text}`}>
        <span className={`h-2 w-2 rounded-full ${STATE[state].dot}`} aria-hidden="true" />
        <span data-testid={`status-${name}`}>{state}</span>
      </span>
    </li>
  )
}

export default function ApiStatus() {
  const { django, fastapi, recheck } = useApiStatus()

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">System status</h2>
        <button
          type="button"
          onClick={recheck}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
        >
          Check again
        </button>
      </div>
      <ul className="mt-1 divide-y divide-slate-100">
        <Row name="Django" role="accounts & cards" url={DJANGO_API_URL} state={django} />
        <Row name="FastAPI" role="payments" url={FASTAPI_URL} state={fastapi} />
      </ul>
    </section>
  )
}
