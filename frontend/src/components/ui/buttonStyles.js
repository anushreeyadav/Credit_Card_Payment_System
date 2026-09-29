// Shared button styles for Button and ButtonLink (and anything that needs to look like one).
const VARIANTS = {
  primary:
    'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-sm shadow-indigo-600/25 ring-1 ring-inset ring-indigo-700/20 hover:from-indigo-500 hover:to-indigo-700 hover:shadow-md hover:shadow-indigo-600/30 focus-visible:outline-indigo-600 disabled:from-indigo-300 disabled:to-indigo-400 disabled:shadow-none',
  secondary:
    'bg-white text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:text-slate-900 hover:ring-slate-400 focus-visible:outline-indigo-600 disabled:text-slate-400',
  soft: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 focus-visible:outline-indigo-600 disabled:opacity-60',
  success:
    'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-600/25 hover:to-emerald-700 hover:shadow-md focus-visible:outline-emerald-600 disabled:opacity-60',
  danger:
    'bg-gradient-to-b from-red-500 to-red-600 text-white shadow-sm shadow-red-600/25 hover:to-red-700 hover:shadow-md focus-visible:outline-red-600 disabled:from-red-300 disabled:to-red-400',
  'danger-soft': 'text-red-600 hover:bg-red-50 focus-visible:outline-red-600',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-indigo-600',
}

const SIZES = {
  sm: 'gap-1.5 rounded-lg px-3 py-1.5 text-xs',
  md: 'gap-2 rounded-xl px-4 py-2.5 text-sm',
  lg: 'gap-2 rounded-xl px-5 py-3 text-base',
}

export const ICON_SIZES = { sm: 'h-3.5 w-3.5', md: 'h-4.5 w-4.5', lg: 'h-5 w-5' }

export function buttonClasses({ variant = 'primary', size = 'md', className = '' } = {}) {
  return `inline-flex items-center justify-center font-semibold whitespace-nowrap transition-all duration-150 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:active:translate-y-0 ${SIZES[size]} ${VARIANTS[variant]} ${className}`
}
