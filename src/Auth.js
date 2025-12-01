import React, { useState } from 'react'
import { supabase } from './supabaseClient'

function Auth({ onClose }) {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  const handleMagicLink = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        }
      })

      if (error) throw error

      setMessage('✅ Check your email for the magic link!')
      setEmail('')
    } catch (error) {
      setMessage('❌ ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000
    }}>
      <div style={{
        background: 'white',
        padding: 40,
        borderRadius: 12,
        width: '90%',
        maxWidth: 400,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        position: 'relative'
      }}>
        {/* Close button for anonymous browsing */}
        {onClose && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              background: 'transparent',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: '#999'
            }}
          >
            ×
          </button>
        )}

        <h2 style={{ marginTop: 0, textAlign: 'center' }}>🏚️ Derelict Finder</h2>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: 30 }}>
          Sign in to upload photos and save sites
        </p>

        <form onSubmit={handleMagicLink}>
          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: '100%',
              padding: 12,
              marginBottom: 15,
              border: '1px solid #ccc',
              borderRadius: 6,
              fontSize: 16
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: 12,
              background: loading ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 16,
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Sending...' : '✨ Send Magic Link'}
          </button>
        </form>

        {message && (
          <p style={{
            marginTop: 20,
            padding: 12,
            background: message.includes('❌') ? '#ffebee' : '#e8f5e9',
            color: message.includes('❌') ? '#c62828' : '#2e7d32',
            borderRadius: 6,
            fontSize: 14,
            textAlign: 'center'
          }}>
            {message}
          </p>
        )}

        <p style={{ marginTop: 20, fontSize: 13, color: '#999', textAlign: 'center' }}>
          No password needed - we'll email you a secure link
        </p>
      </div>
    </div>
  )
}

export default Auth
