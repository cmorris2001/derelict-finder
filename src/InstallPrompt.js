import React, { useEffect, useState } from 'react'

function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault()
      
      // Stash the event so it can be triggered later
      setDeferredPrompt(e)
      
      // Check if user dismissed recently
      const dismissed = localStorage.getItem('installPromptDismissed')
      if (dismissed) {
        const daysSinceDismiss = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24)
        if (daysSinceDismiss < 7) {
          return // Don't show if dismissed within last 7 days
        }
      }
      
      // Don't show immediately - wait for user to explore
      setTimeout(() => {
        setShowPrompt(true)
      }, 30000) // Show after 30 seconds
    }

    window.addEventListener('beforeinstallprompt', handler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    // Show the install prompt
    deferredPrompt.prompt()
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice
    
    console.log(`User response to install prompt: ${outcome}`)
    
    // Clear the deferredPrompt
    setDeferredPrompt(null)
    setShowPrompt(false)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    // Remember dismissal for 7 days
    localStorage.setItem('installPromptDismissed', Date.now().toString())
  }

  // Check if already installed
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches ||
                      window.navigator.standalone === true // iOS

  if (!showPrompt || !deferredPrompt || isInstalled) {
    return null
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      background: 'white',
      padding: 20,
      borderRadius: 12,
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      maxWidth: 'calc(100% - 40px)',
      width: 400,
      animation: 'slideUp 0.3s ease-out'
    }}>
      <style>{`
        @keyframes slideUp {
          from {
            transform: translateX(-50%) translateY(100px);
            opacity: 0;
          }
          to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
          }
        }
      `}</style>
      
      <div style={{ display: 'flex', alignItems: 'start', gap: 15 }}>
        <div style={{ fontSize: 40 }}>📲</div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 18 }}>
            Install Derelict Finder
          </h3>
          <p style={{ margin: '0 0 15px 0', fontSize: 14, color: '#666' }}>
            Add to your home screen for quick access and offline use
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleInstall}
              style={{
                flex: 1,
                padding: 10,
                background: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              Install
            </button>
            <button
              onClick={handleDismiss}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                color: '#666',
                border: '1px solid #ddd',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InstallPrompt
