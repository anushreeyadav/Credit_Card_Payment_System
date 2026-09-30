export const PATHS = {
  home: '/',
  register: '/register',
  login: '/login',
  dashboard: '/dashboard',
  cards: '/cards',
  payment: '/payment',
  transactions: '/transactions',
  analytics: '/analytics',
  notifications: '/notifications',
  profile: '/profile',
  settings: '/settings',
  help: '/help',
  // The admin console keeps its sections in ?tab= because /admin/... is
  // the Django admin behind the reverse proxy.
  admin: '/admin',
}

export const adminSection = (section) => (section === 'dashboard' ? PATHS.admin : `${PATHS.admin}?tab=${section}`)
