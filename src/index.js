import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './App.css'
import 'leaflet/dist/leaflet.css'

const root = createRoot(document.getElementById('root'))
root.render(<App />)

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.log('SW registered:', registration)
        
        // Check for updates every hour
        setInterval(() => {
          registration.update()
        }, 1000 * 60 * 60)
      })
      .catch((error) => {
        console.log('SW registration failed:', error)
      })
  })
}

