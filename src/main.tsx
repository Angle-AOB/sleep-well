import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './i18n'

if ('serviceWorker' in navigator) {
  window.__SW_READY__ = new Promise((resolve, reject) => {
    registerSW({
      immediate: true,
      onRegisteredSW: (_url, registration) => {
        if (registration) {
          void registration.update()
          resolve(registration)
        } else {
          reject(new Error('Service worker registration failed'))
        }
      },
      onRegisterError: reject
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
