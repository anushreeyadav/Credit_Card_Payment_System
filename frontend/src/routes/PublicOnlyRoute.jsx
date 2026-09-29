import { Navigate, Outlet, useLocation } from 'react-router-dom'

import FullPageLoader from '../components/FullPageLoader.jsx'
import useAuth from '../hooks/useAuth.js'
import { PATHS } from './paths.js'

// /login and /register: signed-in users go straight to where they were headed.
export default function PublicOnlyRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageLoader />
  if (status === 'authenticated') {
    return <Navigate to={location.state?.from || PATHS.dashboard} replace />
  }
  return <Outlet />
}
