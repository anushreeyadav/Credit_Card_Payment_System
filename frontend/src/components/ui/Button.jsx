import { Link } from 'react-router-dom'

import { buttonClasses, ICON_SIZES } from './buttonStyles.js'
import Spinner from './Spinner.jsx'

// One button system for the whole app: the same variants and sizes for
// <button> (Button) and router links that look like buttons (ButtonLink).
function Content({ icon: Icon, iconRight: IconRight, size, children }) {
  return (
    <>
      {Icon && <Icon className={`${ICON_SIZES[size]} shrink-0`} />}
      {children}
      {IconRight && <IconRight className={`${ICON_SIZES[size]} shrink-0`} />}
    </>
  )
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  loadingText,
  className = '',
  type = 'button',
  disabled,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...props}
    >
      {loading ? (
        <>
          <Spinner />
          {loadingText ?? children}
        </>
      ) : (
        <Content icon={icon} iconRight={iconRight} size={size}>
          {children}
        </Content>
      )}
    </button>
  )
}

export function ButtonLink({ to, children, variant = 'primary', size = 'md', icon, iconRight, className = '', ...props }) {
  return (
    <Link to={to} className={buttonClasses({ variant, size, className })} {...props}>
      <Content icon={icon} iconRight={iconRight} size={size}>
        {children}
      </Content>
    </Link>
  )
}
