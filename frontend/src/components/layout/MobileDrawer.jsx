import { useEffect, useRef } from 'react'

import { XIcon } from '../icons.jsx'

// Slide-in navigation for phones and tablets, on the native <dialog>
// element (focus trap, Escape to close, inert page behind it).
export default function MobileDrawer({ open, onClose, label, children, dark = false }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className={`drawer-left-in m-0 h-dvh max-h-dvh w-80 max-w-[85vw] p-0 shadow-2xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-[2px] lg:hidden ${
        dark ? 'theme-fixed bg-slate-950' : 'bg-slate-50'
      }`}
    >
      {open && (
        <div className="relative h-full">
          <button
            type="button"
            onClick={onClose}
            className={`absolute top-4 right-3 z-10 rounded-xl p-2 ${dark ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-200/70'}`}
            aria-label="Close navigation menu"
          >
            <XIcon className="h-5 w-5" />
          </button>
          {children}
        </div>
      )}
    </dialog>
  )
}
