import { adminSection, PATHS } from '../../routes/paths.js'
import {
  BellIcon,
  CardIcon,
  ChartIcon,
  DatabaseIcon,
  DownloadIcon,
  HelpIcon,
  HomeIcon,
  PieIcon,
  ReceiptIcon,
  SendIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon,
} from '../icons.jsx'

// Customer navigation. Every entry is a real route.
export const MAIN_NAV = [
  { to: PATHS.dashboard, label: 'Dashboard', icon: HomeIcon, hint: 'Overview of your account' },
  { to: PATHS.cards, label: 'My Cards', icon: CardIcon, hint: 'Saved cards, always masked' },
  { to: PATHS.payment, label: 'Make Payment', icon: SendIcon, hint: 'Pay with a saved card' },
  { to: PATHS.transactions, label: 'Transactions', icon: ReceiptIcon, hint: 'Payment history and filters' },
  { to: PATHS.analytics, label: 'Payment Analytics', icon: PieIcon, hint: 'Charts of your payments' },
  { to: PATHS.notifications, label: 'Notifications', icon: BellIcon, hint: 'Latest payment results', badge: true },
]

export const ACCOUNT_NAV = [
  { to: PATHS.profile, label: 'Profile', icon: UserIcon, hint: 'Your account details' },
  { to: PATHS.settings, label: 'Settings', icon: SettingsIcon, hint: 'Preferences and security' },
  { to: PATHS.help, label: 'Help & Support', icon: HelpIcon, hint: 'FAQs and contact' },
]

// Admin console sections (?tab=...). "dashboard" is the default section.
export const ADMIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: ChartIcon },
  { id: 'users', label: 'Users', icon: UsersIcon },
  { id: 'cards', label: 'Cards', icon: CardIcon },
  { id: 'transactions', label: 'Transactions', icon: ReceiptIcon },
  { id: 'summary', label: 'Payment Summary', icon: PieIcon },
  { id: 'logs', label: 'Admin Logs', icon: ShieldIcon },
  { id: 'export', label: 'Export Data', icon: DownloadIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
].map((item) => ({ ...item, to: adminSection(item.id) }))

export const ADMIN_CONSOLE = { to: PATHS.admin, label: 'Admin Console', icon: DatabaseIcon }

// Page titles for the header breadcrumb.
const TITLES = Object.fromEntries([...MAIN_NAV, ...ACCOUNT_NAV].map((item) => [item.to, item.label]))
export const pageTitle = (pathname) => TITLES[pathname] ?? 'Page not found'

export function displayName(user) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username
}

export function roleLabel(user) {
  if (user.is_superuser) return 'Superuser'
  return user.is_staff ? 'Administrator' : 'Customer'
}

export function initials(user) {
  const fromName = `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`
  return (fromName || user.username.slice(0, 2)).toUpperCase()
}
