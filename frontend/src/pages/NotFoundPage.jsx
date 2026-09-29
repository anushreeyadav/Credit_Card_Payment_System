import { Link } from 'react-router-dom'

import { PATHS } from '../routes/paths.js'

export default function NotFoundPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-600">That page does not exist.</p>
      <Link to={PATHS.dashboard} className="mt-4 inline-block font-medium text-indigo-700 hover:underline">
        Go to the dashboard
      </Link>
    </section>
  )
}
