import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

function loadServiceWorkerRegistration() {
  void import('./services/serviceWorker')
    .then(({ registerServiceWorker }) => registerServiceWorker())
    .catch(() => undefined)
}

if (document.readyState === 'complete') {
  loadServiceWorkerRegistration()
} else {
  window.addEventListener('load', loadServiceWorkerRegistration, { once: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
