import { useContext } from 'react'

import { ToastContext } from '../context/ToastContext.js'

// notify(message, { variant: 'success' | 'info' | 'warning' }) shows a short confirmation.
export default function useToast() {
  return useContext(ToastContext)
}
