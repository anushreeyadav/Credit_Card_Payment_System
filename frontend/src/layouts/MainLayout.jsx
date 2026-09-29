import { Outlet } from 'react-router-dom'

import AppShell from '../components/layout/AppShell.jsx'

export default function MainLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
