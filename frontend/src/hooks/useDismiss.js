import { useEffect } from 'react'

// Closes a popover on Escape or on a click outside `ref`.
export default function useDismiss(ref, open, onClose) {
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose()
    }
    const onKey = (event) => {
      if (event.key === 'Escape') onClose({ restoreFocus: true })
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, open, onClose])
}
