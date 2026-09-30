import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import '@fontsource-variable/inter'

import App from './App.jsx'
import AuthProvider from './context/AuthProvider.jsx'
import ToastProvider from './context/ToastProvider.jsx'
import { applyToDocument, watchSystemTheme } from './hooks/usePreferences.js'
import './index.css'

applyToDocument() // saved theme and "Reduce motion" preferences
watchSystemTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
