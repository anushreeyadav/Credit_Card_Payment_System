import { Navigate, Outlet, useLocation } from 'react-router-dom'

import FullPageLoader from '../components/FullPageLoader.jsx'
import useAuth from '../hooks/useAuth.js'
import { PATHS } from './paths.js'

// Signed-out users are sent to /login, remembering where they were going.
export default function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageLoader label="Checking your session…" />
  if (status !== 'authenticated') {
    return <Navigate to={PATHS.login} replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}
