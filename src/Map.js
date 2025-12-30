// src/Map.js
import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from './supabaseClient'
import SiteForm from './SiteForm'
import AIReimager from './AIReimager'
import AdminDashboard from './AdminDashboard'
import ProfileScreen from './ProfileScreen'


// fix marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
})

function AddMarkerOnClick({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng)
    },
  })
  return null
}

const GOAL_SITES = 10000

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

  const [showWelcome, setShowWelcome] = useState(false)
  const [showImpact, setShowImpact] = useState(false)

  useEffect(() => {
    loadSites()
    loadLeaderboard()

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setUserLocation([pos.coords.latitude, pos.coords.longitude])
      })
    }

    // Welcome modal – first visit only
    try {
      const seen = window.localStorage.getItem('derelict_welcome_seen')
      if (!seen) setShowWelcome(true)
    } catch (e) {
      // ignore if localStorage not available
    }
  }, [])

  useEffect(() => {
    if (user && profile) {
      setIsAdmin(profile.is_admin || false)
    }
  }, [user, profile])

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
      const sitesWithProfiles = sitesData.map((site) => ({
        ...site,
        profiles: site.user_id ? profilesData.find((p) => p.id === site.user_id) : null,
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
      const { data: sitesData, error: sitesError } = await supabase
        .from('derelict_sites')
        .select('user_id')
        .eq('status', 'approved')

      if (sitesError) throw sitesError

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username')

      if (profilesError) throw profilesError

      const counts = {}
      sitesData.forEach((site) => {
        if (site.user_id) {
          const userProfile = profilesData.find((p) => p.id === site.user_id)
          if (userProfile) {
            const username = userProfile.username
            counts[username] = (counts[username] || 0) + 1
          }
        }
      })

      const leaderboardData = Object.entries(counts)
        .map(([username, count]) => ({ username, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      setLeaderboard(leaderboardData)
    } catch (err) {
      console.error('Error loading leaderboard:', err)
    }
  }

  const handleMapClick = (latlng) => {
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
    loadLeaderboard()
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const handleDismissWelcome = () => {
    setShowWelcome(false)
    try {
      window.localStorage.setItem('derelict_welcome_seen', 'true')
    } catch (e) {
      // ignore
    }
  }

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        Loading map…
      </div>
    )
  }

  const approvedCount = sites.filter((s) => s.status === 'approved').length
  const pendingCount = sites.filter((s) => s.status === 'pending').length
  const totalSites = sites.length
  const goalProgress = Math.min(approvedCount / GOAL_SITES, 1)

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      {/* Top bar */}
      <div
        style={{
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
          gap: 15,
          maxWidth: '90vw',
        }}
      >
        <div>
          🏚️ <strong>{approvedCount}</strong> approved sites
        </div>

        {/* Goal mini bar */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 140 }}>
          <span style={{ fontSize: 11, color: '#666' }}>
            🎯 Goal: {GOAL_SITES.toLocaleString()} mapped
          </span>
          <div
            style={{
              marginTop: 3,
              width: '100%',
              height: 6,
              borderRadius: 999,
              background: '#eee',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${goalProgress * 100}%`,
                height: '100%',
                background: '#4CAF50',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
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
            fontSize: 13,
          }}
        >
          🏆 Leaderboard
        </button>

        {/* Impact button */}
        <button
          onClick={() => setShowImpact(true)}
          style={{
            background: '#673ab7',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: 13,
          }}
        >
          📊 Impact
        </button>

        {profile && (
          <div style={{ borderLeft: '1px solid #ddd', paddingLeft: 15 }}>
            👤 <strong>@{profile.username}</strong>
          </div>
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
              fontSize: 13,
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
            fontSize: 14,
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
            fontSize: 14,
          }}
        >
          Sign In
        </button>
      )}

      <MapContainer center={userLocation} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <AddMarkerOnClick onMapClick={handleMapClick} />

        {sites.map((site) => (
          <Marker key={site.id} position={[site.latitude, site.longitude]}>
            <Popup maxWidth={320}>
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                  }}
                >
                  <strong style={{ fontSize: 16 }}>{site.name}</strong>

                  {site.status === 'pending' && site.user_id === user?.id && (
                    <span
                      style={{
                        background: '#ff9800',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 'bold',
                        marginLeft: 8,
                      }}
                    >
                      PENDING
                    </span>
                  )}
                </div>

                {site.profiles ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: '#666',
                      marginTop: 5,
                      marginBottom: 6,
                    }}
                  >
                    Discovered by <strong>@{site.profiles.username}</strong>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 12,
                      color: '#999',
                      marginTop: 5,
                      marginBottom: 6,
                    }}
                  >
                    Discovered by <em>anonymous</em>
                  </div>
                )}

                {/* Eircode display */}
                {site.eircode && (
                  <div style={{ fontSize: 12, color: '#444', marginBottom: 6 }}>
                    📮 Eircode: <strong>{site.eircode}</strong>
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
                      marginTop: 6,
                      borderRadius: 6,
                    }}
                  />
                )}

                {site.description && (
                  <p style={{ marginTop: 8, fontSize: 14 }}>{site.description}</p>
                )}

                <small style={{ color: '#666', display: 'block', marginTop: 5 }}>
                  {new Date(site.created_at).toLocaleDateString()}
                </small>

                <button
                  onClick={() => {
                    setSelectedSite(site)
                    setShowAIModal(true)
                  }}
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
                    cursor: 'pointer',
                  }}
                >
                  ✨ Reimagine with AI
                </button>
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

      {/* Leaderboard Modal (unchanged) */}
      {showLeaderboard && (
        <div
          style={{
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
            overflow: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 15,
            }}
          >
            <h3 style={{ margin: 0 }}>🏆 Top Discoverers</h3>
            <button
              onClick={() => setShowLeaderboard(false)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 24,
                cursor: 'pointer',
                color: '#999',
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
                    background:
                      index === 0
                        ? '#fff9c4'
                        : index === 1
                        ? '#f5f5f5'
                        : index === 2
                        ? '#ffe0b2'
                        : '#fafafa',
                    borderRadius: 8,
                    border: index < 3 ? '2px solid #ffc107' : '1px solid #eee',
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
                  <span
                    style={{
                      background: '#4CAF50',
                      color: 'white',
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: 13,
                      fontWeight: 'bold',
                    }}
                  >
                    {entry.count} {entry.count === 1 ? 'site' : 'sites'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {profile && (
            <div
              style={{
                marginTop: 20,
                padding: 15,
                background: '#e3f2fd',
                borderRadius: 8,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 13, color: '#666', marginBottom: 5 }}>Your discoveries</div>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: '#2196F3' }}>
                {sites.filter((s) => s.user_id === user?.id && s.status === 'approved').length}
              </div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 5 }}>
                ({sites.filter((s) => s.user_id === user?.id && s.status === 'pending').length} pending
                approval)
              </div>
            </div>
          )}
        </div>
      )}

      {/* Welcome modal */}
      {showWelcome && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 24,
              maxWidth: 600,
              width: '90%',
              boxShadow: '0 6px 30px rgba(0,0,0,0.35)',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>
              ✨ Welcome to <span style={{ color: '#4CAF50' }}>Derelict Connect</span>
            </h2>
            <p style={{ marginTop: 0, color: '#555' }}>
              We’re building a community map of derelict and long–term vacant sites in Ireland.
              Every pin helps show the true scale of under–used buildings and land.
            </p>

            <h3 style={{ marginTop: 18, marginBottom: 6 }}>What counts as a derelict site?</h3>
            <ul style={{ marginTop: 0, color: '#555', paddingLeft: 20, fontSize: 14 }}>
              <li>Clearly abandoned or not lived in for a long time</li>
              <li>In poor or unsafe condition (broken windows, overgrown, boarded up, etc.)</li>
              <li>Not obviously under active renovation</li>
            </ul>

            <p style={{ color: '#666', fontSize: 14 }}>
              Please avoid adding homes that are clearly lived in or in normal use. When in doubt,
              add a note in the description.
            </p>

            <h3 style={{ marginTop: 18, marginBottom: 6 }}>How it works</h3>
            <ul style={{ marginTop: 0, color: '#555', paddingLeft: 20, fontSize: 14 }}>
              <li>Click anywhere on the map to add a site.</li>
              <li>Add a photo, optional Eircode, and a short description.</li>
              <li>
                Our AI reimagines what the site could become – housing, community spaces, or
                something bold and new.
              </li>
              <li>Sites are reviewed before being marked as “approved”.</li>
            </ul>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleDismissWelcome}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#4CAF50',
                  color: 'white',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Start mapping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Impact / goal modal */}
      {showImpact && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 24,
              maxWidth: 520,
              width: '90%',
              boxShadow: '0 6px 30px rgba(0,0,0,0.35)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <h2 style={{ margin: 0 }}>📊 Project impact</h2>
              <button
                onClick={() => setShowImpact(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 24,
                  cursor: 'pointer',
                  color: '#999',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <p style={{ color: '#555', fontSize: 14 }}>
              Derelict Connect is about making the hidden problem of dereliction visible – and
              turning it into a pipeline of opportunities for homes and community spaces.
            </p>

            <div
              style={{
                marginTop: 16,
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 12,
              }}
            >
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: '#e8f5e9',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 12, color: '#388e3c' }}>Approved sites</div>
                <div style={{ fontSize: 26, fontWeight: 'bold', color: '#1b5e20' }}>
                  {approvedCount}
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: '#e3f2fd',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 12, color: '#1976d2' }}>Total mapped</div>
                <div style={{ fontSize: 26, fontWeight: 'bold', color: '#0d47a1' }}>
                  {totalSites}
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: '#fff8e1',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 12, color: '#f9a825' }}>Pending review</div>
                <div style={{ fontSize: 26, fontWeight: 'bold', color: '#f57f17' }}>
                  {pendingCount}
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: '#f3e5f5',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 12, color: '#8e24aa' }}>Goal progress</div>
                <div style={{ fontSize: 18, fontWeight: 'bold', color: '#6a1b9a' }}>
                  {(goalProgress * 100).toFixed(1)}%
                </div>
                <div style={{ fontSize: 11, color: '#8e24aa' }}>
                  {approvedCount.toLocaleString()} / {GOAL_SITES.toLocaleString()}
                </div>
              </div>
            </div>

            <p style={{ marginTop: 18, color: '#666', fontSize: 13 }}>
              For your LEO pitch you can literally say:
              <br />
              <em>
                “Imagine this scaled nationally – a live map of X,000 derelict sites, each with an
                Eircode and a concept design for reuse.”
              </em>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default Map

