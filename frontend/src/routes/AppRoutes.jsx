import { Navigate, Route, Routes } from 'react-router-dom'

import AuthLayout from '../layouts/AuthLayout.jsx'
import MainLayout from '../layouts/MainLayout.jsx'
import AdminPage from '../pages/AdminPage.jsx'
import AnalyticsPage from '../pages/AnalyticsPage.jsx'
import CardsPage from '../pages/CardsPage.jsx'
import DashboardPage from '../pages/DashboardPage.jsx'
import HelpPage from '../pages/HelpPage.jsx'
import LoginPage from '../pages/LoginPage.jsx'
import NotFoundPage from '../pages/NotFoundPage.jsx'
import NotificationsPage from '../pages/NotificationsPage.jsx'
import PaymentPage from '../pages/PaymentPage.jsx'
import ProfilePage from '../pages/ProfilePage.jsx'
import RegisterPage from '../pages/RegisterPage.jsx'
import SettingsPage from '../pages/SettingsPage.jsx'
import TransactionsPage from '../pages/TransactionsPage.jsx'
import { PATHS } from './paths.js'
import ProtectedRoute from './ProtectedRoute.jsx'
import PublicOnlyRoute from './PublicOnlyRoute.jsx'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path={PATHS.home} element={<Navigate to={PATHS.dashboard} replace />} />

      <Route element={<PublicOnlyRoute />}>
        <Route element={<AuthLayout />}>
          <Route path={PATHS.login} element={<LoginPage />} />
          <Route path={PATHS.register} element={<RegisterPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        {/* The admin console has its own layout (AdminShell). */}
        <Route path={PATHS.admin} element={<AdminPage />} />
        <Route element={<MainLayout />}>
          <Route path={PATHS.dashboard} element={<DashboardPage />} />
          <Route path={PATHS.cards} element={<CardsPage />} />
          <Route path={PATHS.payment} element={<PaymentPage />} />
          <Route path={PATHS.transactions} element={<TransactionsPage />} />
          <Route path={PATHS.analytics} element={<AnalyticsPage />} />
          <Route path={PATHS.notifications} element={<NotificationsPage />} />
          <Route path={PATHS.profile} element={<ProfilePage />} />
          <Route path={PATHS.settings} element={<SettingsPage />} />
          <Route path={PATHS.help} element={<HelpPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
