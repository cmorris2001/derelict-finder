import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from './supabaseClient'
import SiteForm from './SiteForm'
import AIReimager from './AIReimager'
import AdminDashboard from './AdminDashboard'
import ProfileScreen from './ProfileScreen'   // 👈 NEW

// fix marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
})

function AddMarkerOnClick({ onMapClick }) {
  useMapEvents({
    click(e) { onMapClick(e.latlng) }
  })
  return null
}

function Map({ user, profile, onSignInClick }) {
  const [sites, setSites] = useState([])
  const [userLocation, setUserLocation] = useState([51.9, -8.47])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedPosition, setSelectedPosition] = useState(null)
  const [showAIModal, setShowAIModal] = useState(false)
  const [selectedSite, setSelectedSite] = useState(null)
  const [showAdminDashboard, setShowAdminDashboard] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [leaderboard, setLeaderboard] = useState([])
  const [showLeaderboard, setShowLeaderboard] = useState(false)

  // NEW: favourites + profile modal
  const [favoriteSiteIds, setFavoriteSiteIds] = useState([])
  const [showProfile, setShowProfile] = useState(false)

  useEffect(() => {
    loadSites()
    loadLeaderboard()
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setUserLocation([pos.coords.latitude, pos.coords.longitude])
      })
    }
  }, [])

  useEffect(() => {
    if (user && profile) {
      setIsAdmin(profile.is_admin || false)
    }
  }, [user, profile])

  // NEW: load favourites whenever the user changes
  useEffect(() => {
    if (!user) {
      setFavoriteSiteIds([])
      return
    }

    const loadFavorites = async () => {
      try {
        const { data, error } = await supabase
          .from('favorites')
          .select('site_id')
          .eq('user_id', user.id)

        if (error) throw error
        setFavoriteSiteIds(data.map((f) => f.site_id))
      } catch (err) {
        console.error('Error loading favorites:', err)
      }
    }

    loadFavorites()
  }, [user])

  const loadSites = async () => {
    try {
      // First get all sites
      const { data: sitesData, error: sitesError } = await supabase
        .from('derelict_sites')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (sitesError) throw sitesError

      // Then get all profiles separately
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
      
      if (profilesError) throw profilesError

      // Manually join the data
      const sitesWithProfiles = sitesData.map(site => ({
        ...site,
        profiles: site.user_id ? profilesData.find(p => p.id === site.user_id) : null
      }))

      setSites(sitesWithProfiles || [])
    } catch (err) {
      console.error('Error loading sites:', err)
      alert('Error loading sites: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadLeaderboard = async () => {
    try {
      // Get all approved sites with user info
      const { data: sitesData, error: sitesError } = await supabase
        .from('derelict_sites')
        .select('user_id')
        .eq('status', 'approved')
      
      if (sitesError) throw sitesError

      // Get all profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username')
      
      if (profilesError) throw profilesError

      // Count sites per user
      const counts = {}
      sitesData.forEach(site => {
        if (site.user_id) {
          const userProfile = profilesData.find(p => p.id === site.user_id)
          if (userProfile) {
            const username = userProfile.username
            counts[username] = (counts[username] || 0) + 1
          }
        }
      })

      // Convert to array and sort
      const leaderboardData = Object.entries(counts)
        .map(([username, count]) => ({ username, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10) // Top 10

      setLeaderboard(leaderboardData)
    } catch (err) {
      console.error('Error loading leaderboard:', err)
    }
  }

  const handleMapClick = (latlng) => {
    // If not signed in, show confirmation before opening form
    if (!user) {
      if (window.confirm('You can add sites anonymously, but sign in to upload photos. Continue?')) {
        setSelectedPosition(latlng)
        setShowForm(true)
      }
      return
    }
    
    setSelectedPosition(latlng)
    setShowForm(true)
  }

  const handleSiteAdded = (newSite) => {
    setSites([newSite, ...sites])
    loadLeaderboard() // Refresh leaderboard
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  // NEW: toggle favourite
  const toggleFavorite = async (siteId) => {
    if (!user) {
      alert('Sign in to favourite sites.')
      return
    }

    const isFav = favoriteSiteIds.includes(siteId)

    try {
      if (isFav) {
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('site_id', siteId)

        if (error) throw error
        setFavoriteSiteIds(favoriteSiteIds.filter((id) => id !== siteId))
      } else {
        const { error } = await supabase
          .from('favorites')
          .insert([{ user_id: user.id, site_id: siteId }])

        if (error) throw error
        setFavoriteSiteIds([...favoriteSiteIds, siteId])
      }
    } catch (err) {
      console.error('Error toggling favorite:', err)
      alert('Error updating favourite: ' + err.message)
    }
  }

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh'
    }}>
      Loading map…
    </div>
  )

  const approvedCount = sites.filter(s => s.status === 'approved').length
  const pendingCount = sites.filter(s => s.status === 'pending').length

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      {/* Top bar */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        background: 'white',
        padding: '10px 20px',
        borderRadius: 8,
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: 15
      }}>
        <div>
          🏚️ <strong>{approvedCount}</strong> approved sites
        </div>
        
        {/* Leaderboard button */}
        <button
          onClick={() => setShowLeaderboard(!showLeaderboard)}
          style={{
            background: '#2196F3',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: 13
          }}
        >
          🏆 Leaderboard
        </button>

        {profile && (
          <button
            onClick={() => setShowProfile(true)}
            style={{
              borderLeft: '1px solid #ddd',
              paddingLeft: 15,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            👤 <strong>@{profile.username}</strong>
          </button>
        )}
        
        {isAdmin && (
          <button
            onClick={() => setShowAdminDashboard(true)}
            style={{
              background: '#ff9800',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: 13
            }}
          >
            🛡️ Admin {pendingCount > 0 && `(${pendingCount})`}
          </button>
        )}
      </div>

      {/* Sign in/out button */}
      {user ? (
        <button
          onClick={handleSignOut}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 1000,
            background: '#f44336',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: 14
          }}
        >
          Sign Out
        </button>
      ) : (
        <button
          onClick={onSignInClick}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 1000,
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: 14
          }}
        >
          Sign In
        </button>
      )}

      <MapContainer center={userLocation} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        <AddMarkerOnClick onMapClick={handleMapClick} />

        {sites.map((site) => (
          <Marker key={site.id} position={[site.latitude, site.longitude]}>
            <Popup maxWidth={300}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <strong style={{ fontSize: 16 }}>{site.name}</strong>
                  
                  {/* Show pending badge if it's user's own pending site */}
                  {site.status === 'pending' && site.user_id === user?.id && (
                    <span style={{
                      background: '#ff9800',
                      color: 'white',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 'bold',
                      marginLeft: 8
                    }}>
                      PENDING
                    </span>
                  )}
                </div>
                
                {/* Show who discovered it */}
                {site.profiles && (
                  <div style={{ 
                    fontSize: 12, 
                    color: '#666', 
                    marginTop: 5,
                    marginBottom: 10 
                  }}>
                    Discovered by <strong>@{site.profiles.username}</strong>
                  </div>
                )}
                {!site.profiles && (
                  <div style={{ fontSize: 12, color: '#999', marginTop: 5, marginBottom: 10 }}>
                    Discovered by <em>anonymous</em>
                  </div>
                )}

                {site.photo_url && (
                  <img
                    src={site.photo_url}
                    alt={site.name}
                    style={{ 
                      width: '100%', 
                      height: 150, 
                      objectFit: 'cover', 
                      marginTop: 10, 
                      borderRadius: 6 
                    }}
                  />
                )}
                
                {site.description && (
                  <p style={{ marginTop: 10, fontSize: 14 }}>{site.description}</p>
                )}
                
                <small style={{ color: '#666', display: 'block', marginTop: 5 }}>
                  {new Date(site.created_at).toLocaleDateString()}
                </small>
                
                <button
                  onClick={() => { setSelectedSite(site); setShowAIModal(true) }}
                  style={{
                    marginTop: 10,
                    width: '100%',
                    padding: 8,
                    background: '#9C27B0',
                    color: '#fff',
                    border: 0,
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  ✨ Reimagine with AI
                </button>

                {user && (
                  <button
                    onClick={() => toggleFavorite(site.id)}
                    style={{
                      marginTop: 8,
                      width: '100%',
                      padding: 6,
                      background: favoriteSiteIds.includes(site.id) ? '#e91e63' : '#ffffff',
                      color: favoriteSiteIds.includes(site.id) ? '#fff' : '#e91e63',
                      border: '1px solid #e91e63',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    {favoriteSiteIds.includes(site.id) ? '♥ Favourited' : '♡ Add to favourites'}
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {showForm && selectedPosition && (
        <SiteForm 
          position={selectedPosition} 
          userId={user?.id || null}
          onClose={() => setShowForm(false)} 
          onSiteAdded={handleSiteAdded} 
        />
      )}

      {showAIModal && selectedSite && (
        <AIReimager site={selectedSite} onClose={() => setShowAIModal(false)} />
      )}

      {showAdminDashboard && isAdmin && (
        <AdminDashboard 
          onClose={() => {
            setShowAdminDashboard(false)
            loadSites()
            loadLeaderboard()
          }} 
        />
      )}

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div style={{
          position: 'fixed',
          top: 80,
          right: 20,
          zIndex: 1000,
          background: 'white',
          padding: 20,
          borderRadius: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          width: 300,
          maxHeight: '70vh',
          overflow: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <h3 style={{ margin: 0 }}>🏆 Top Discoverers</h3>
            <button
              onClick={() => setShowLeaderboard(false)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 24,
                cursor: 'pointer',
                color: '#999'
              }}
            >
              ×
            </button>
          </div>

          {leaderboard.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', padding: 20 }}>
              No approved sites yet
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {leaderboard.map((entry, index) => (
                <div
                  key={entry.username}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 12,
                    background: index === 0 ? '#fff9c4' : index === 1 ? '#f5f5f5' : index === 2 ? '#ffe0b2' : '#fafafa',
                    borderRadius: 8,
                    border: index < 3 ? '2px solid #ffc107' : '1px solid #eee'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20, fontWeight: 'bold' }}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                    </span>
                    <span style={{ fontWeight: index < 3 ? 'bold' : 'normal' }}>
                      @{entry.username}
                    </span>
                  </div>
                  <span style={{
                    background: '#4CAF50',
                    color: 'white',
                    padding: '4px 10px',
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 'bold'
                  }}>
                    {entry.count} {entry.count === 1 ? 'site' : 'sites'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {profile && (
            <div style={{
              marginTop: 20,
              padding: 15,
              background: '#e3f2fd',
              borderRadius: 8,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 5 }}>Your discoveries</div>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#2196F3' }}>
                {sites.filter(s => s.user_id === user?.id && s.status === 'approved').length}
              </div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 5 }}>
                ({sites.filter(s => s.user_id === user?.id && s.status === 'pending').length} pending approval)
              </div>
            </div>
          )}
        </div>
      )}

      {/* Profile modal */}
      {showProfile && user && profile && (
        <ProfileScreen
          user={user}
          profile={profile}
          sites={sites}
          favoriteSiteIds={favoriteSiteIds}
          leaderboard={leaderboard}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  )
}

export default Map
