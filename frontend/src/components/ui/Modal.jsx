import { useEffect, useId, useRef } from 'react'

import { XIcon } from '../icons.jsx'

// Accessible modal / side drawer on the native <dialog> element: focus is
// trapped, Escape closes it and the page behind is inert.
// variant: 'center' (dialog box) | 'drawer' (slides in from the right).
export default function Modal({ open, onClose, title, description, children, footer, variant = 'center', size = 'max-w-lg' }) {
  const ref = useRef(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const placement =
    variant === 'drawer'
      ? `drawer-in m-0 ml-auto h-dvh max-h-dvh w-full ${size} rounded-none sm:rounded-l-3xl`
      : `modal-in m-auto w-[calc(100%-2rem)] ${size} rounded-3xl`

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose() // click on the backdrop
      }}
      className={`bg-white p-0 shadow-2xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-[2px] ${placement}`}
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-slate-900">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-0.5 text-sm text-slate-500">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close"
              title="Close"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  )
}
