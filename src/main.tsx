import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import { I18nProvider } from './i18n'
import { ToastProvider } from './components/Toast'
import { DialogProvider } from './components/Dialog'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root container not found')

createRoot(container).render(
  <StrictMode>
    <HashRouter>
      <I18nProvider>
        <ToastProvider>
          <DialogProvider>
            <App />
          </DialogProvider>
        </ToastProvider>
      </I18nProvider>
    </HashRouter>
  </StrictMode>,
)
