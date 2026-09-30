import { initials } from '../layout/navigation.js'

// Initials in a gradient circle. Decorative: the name is always shown or labelled nearby.
export default function Avatar({ user, className = 'h-10 w-10 text-sm' }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 font-semibold text-white shadow-sm ring-2 ring-white ${className}`}
      aria-hidden="true"
    >
      {initials(user)}
    </span>
  )
}
