import React, { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import ProfileSetup from './ProfileSetup'
import Map from './Map'
import InstallPrompt from './InstallPrompt'
import './App.css'

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        loadProfile(session.user.id)
        setShowAuth(false)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) throw error
      setProfile(data)
    } catch (error) {
      console.error('Error loading profile:', error)
      setProfile(null)
    }
  }

  const handleProfileComplete = async () => {
    if (session) {
      await loadProfile(session.user.id)
    }
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontSize: 18
      }}>
        Loading...
      </div>
    )
  }

  // Show profile setup if signed in but no username
  if (session && (!profile || !profile.username)) {
    return <ProfileSetup user={session.user} onComplete={handleProfileComplete} />
  }

  return (
    <div className="App">
      {/* Auth modal - only shows when user clicks sign in */}
      {showAuth && !session && (
        <Auth onClose={() => setShowAuth(false)} />
      )}
      
      {/* Map is always visible */}
      <Map 
        user={session?.user || null} 
        profile={profile} 
        onSignInClick={() => setShowAuth(true)}
      />

      {/* PWA Install Prompt */}
      <InstallPrompt />
    </div>
  )
}

export default App
