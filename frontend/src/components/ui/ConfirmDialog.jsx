import { useEffect, useRef } from 'react'

import { AlertIcon } from '../icons.jsx'
import Button from './Button.jsx'

// Modal confirmation built on the native <dialog> element, which provides
// focus trapping, Escape-to-close and an inert background.
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  busyLabel,
  busy = false,
  error,
  onConfirm,
  onCancel,
}) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-dialog-title"
      onCancel={(event) => {
        event.preventDefault() // Escape: let the parent decide (ignored while busy)
        if (!busy) onCancel()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl bg-white p-0 shadow-xl backdrop:bg-slate-900/50 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-6">
        <div className="flex gap-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-100 text-red-600">
            <AlertIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            <div className="mt-1.5 text-sm text-slate-600">{children}</div>
            {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            loading={busy}
            loadingText={busyLabel}
            className="theme-fixed bg-red-600 hover:bg-red-700 focus-visible:outline-red-600 disabled:bg-red-400"
            autoFocus
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
