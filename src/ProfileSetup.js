import React, { useState } from 'react'
import { supabase } from './supabaseClient'

function ProfileSetup({ user, onComplete }) {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Validate username
    if (username.length < 3) {
      setError('Username must be at least 3 characters')
      setLoading(false)
      return
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores')
      setLoading(false)
      return
    }

    try {
      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single()

      if (existingProfile) {
        // Update existing profile
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ username })
          .eq('id', user.id)

        if (updateError) throw updateError
      } else {
        // Create new profile (shouldn't happen with trigger, but just in case)
        const { error: insertError } = await supabase
          .from('profiles')
          .insert([{ id: user.id, username }])

        if (insertError) throw insertError
      }

      onComplete()
    } catch (err) {
      console.error('Profile setup error:', err)
      if (err.code === '23505') {
        setError('Username already taken - try another')
      } else {
        setError(err.message || 'Failed to save username')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
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
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        <h2 style={{ marginTop: 0 }}>👋 Choose your username</h2>
        <p style={{ color: '#666', marginBottom: 20 }}>
          This will be visible when you discover sites
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            required
            minLength={3}
            style={{
              width: '100%',
              padding: 12,
              marginBottom: 15,
              border: '1px solid #ccc',
              borderRadius: 6,
              fontSize: 16
            }}
          />

          {error && (
            <p style={{ color: '#d32f2f', fontSize: 14, marginBottom: 15 }}>
              {error}
            </p>
          )}

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
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default ProfileSetup
