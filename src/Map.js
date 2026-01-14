// src/Map.js
import React, { useEffect, useState, useRef } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from './supabaseClient'
import SiteForm from './SiteForm'
import AIReimager from './AIReimager'
import AdminDashboard from './AdminDashboard'
import ProfileScreen from './ProfileScreen'
import PostsFeed from './PostsFeed'

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

// ✅ Recenter ONLY when recenterTick changes (no more "follow me" lock)
function RecenterMap({ target, recenterTick }) {
  const map = useMap()
  const targetRef = useRef(target)

  useEffect(() => {
    targetRef.current = target
  }, [target])

  useEffect(() => {
    const t = targetRef.current
    if (!t) return
    map.setView([t.lat, t.lng], Math.max(map.getZoom(), 15), { animate: true })
  }, [recenterTick, map])

  return null
}

// ✅ Stop Leaflet swallowing clicks inside the popup (mobile safe)
function PopupSafeArea({ children }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    L.DomEvent.disableClickPropagation(ref.current)
    L.DomEvent.disableScrollPropagation(ref.current)
  }, [])

  return <div ref={ref}>{children}</div>
}

// Blue dot icon (no image needed)
const userDotIcon = L.divIcon({
  className: '',
  html: `
    <div style="
      width:14px;height:14px;border-radius:50%;
      background:#1a73e8;border:2px solid white;
      box-shadow:0 0 0 3px rgba(26,115,232,.25);
    "></div>
  `,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

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

  // Profile + Feed modals
  const [showProfile, setShowProfile] = useState(false)
  const [showFeed, setShowFeed] = useState(false)

  // Favorites: list of site_ids
  const [favoriteSiteIds, setFavoriteSiteIds] = useState([])

  // Mobile detection
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 600px)').matches : false
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 600px)')
    const handler = () => setIsMobile(mq.matches)

    if (mq.addEventListener) mq.addEventListener('change', handler)
    else mq.addListener(handler)

    handler()

    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else mq.removeListener(handler)
    }
  }, [])

  // Live user location
  const [liveUserLocation, setLiveUserLocation] = useState(null) // { lat, lng }
  const [locationError, setLocationError] = useState('')
  const watchIdRef = useRef(null)

  // Recenter trigger (manual)
  const [recenterTick, setRecenterTick] = useState(0)

  useEffect(() => {
    loadSites()
    loadLeaderboard()

    // One-time initial center
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        () => {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      )
    }

    // Live tracking (updates dot, does NOT force-follow)
    if ('geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          const accuracy = pos.coords.accuracy ?? null

          if (typeof accuracy === 'number' && accuracy > 120) {
            setLocationError(`Location is approximate (~${Math.round(accuracy)}m).`)
          } else {
            setLocationError('')
          }

          setLiveUserLocation({ lat, lng })
          setUserLocation([lat, lng])
        },
        (err) => setLocationError(err?.message || 'Location permission denied.'),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      )
    } else {
      setLocationError('Geolocation is not supported by this browser.')
    }

    // Welcome modal – first visit only
    try {
      const seen = window.localStorage.getItem('derelict_welcome_seen')
      if (!seen) setShowWelcome(true)
    } catch (e) {}

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (user && profile) setIsAdmin(profile.is_admin || false)
  }, [user, profile])

  // Load favorites whenever user changes
  useEffect(() => {
    if (!user) {
      setFavoriteSiteIds([])
      return
    }
    loadFavorites()
  }, [user])

  const loadFavorites = async () => {
    try {
      if (!user) return
      const { data, error } = await supabase
        .from('favorites')
        .select('site_id')
        .eq('user_id', user.id)

      if (error) throw error

      const ids = (data || [])
        .map((row) => row.site_id)
        .filter((v) => v !== null && v !== undefined)

      setFavoriteSiteIds(ids)
    } catch (err) {
      console.error('Error loading favorites:', err)
      setFavoriteSiteIds([])
    }
  }

  const loadSites = async () => {
    try {
      const { data: sitesData, error: sitesError } = await supabase
        .from('derelict_sites')
        .select('*')
        .order('created_at', { ascending: false })

      if (sitesError) throw sitesError

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')

      if (profilesError) throw profilesError

      const sitesWithProfiles = (sitesData || []).map((site) => ({
        ...site,
        profiles: site.user_id ? profilesData.find((p) => p.id === site.user_id) : null,
      }))

      setSites(sitesWithProfiles)
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
      ;(sitesData || []).forEach((site) => {
        if (site.user_id) {
          const userProfile = (profilesData || []).find((p) => p.id === site.user_id)
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
    setFavoriteSiteIds([])
  }

  const handleDismissWelcome = () => {
    setShowWelcome(false)
    try {
      window.localStorage.setItem('derelict_welcome_seen', 'true')
    } catch (e) {}
  }

  // ✅ Extra protection: stop map/popup event hijacking
  const stopMapEvent = (e) => {
    if (!e) return
    e.preventDefault?.()
    e.stopPropagation?.()
    if (e.nativeEvent) {
      e.nativeEvent.stopPropagation?.()
      e.nativeEvent.stopImmediatePropagation?.()
    }
  }

  const openAIModal = (site, e) => {
    stopMapEvent(e)
    setSelectedSite(site)
    setShowAIModal(true)
  }

  // ✅ Manual “My Location” jump (no follow)
  const recenterToUser = () => {
    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const accuracy = pos.coords.accuracy ?? null

        if (typeof accuracy === 'number' && accuracy > 120) {
          setLocationError(`Location is approximate (~${Math.round(accuracy)}m).`)
        } else {
          setLocationError('')
        }

        setLiveUserLocation({ lat, lng })
        setUserLocation([lat, lng])
        setRecenterTick((t) => t + 1)
      },
      (err) => setLocationError(err?.message || 'Could not fetch your location.'),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        Loading map…
      </div>
    )
  }

  const approvedCount = sites.filter((s) => s.status === 'approved').length
  const pendingCount = sites.filter((s) => s.status === 'pending').length
  const totalSites = sites.length
  const goalProgress = Math.min(approvedCount / GOAL_SITES, 1)

  const btnStyle = (bg) => ({
    background: bg,
    color: 'white',
    border: 'none',
    padding: isMobile ? '6px 10px' : '6px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: isMobile ? 12 : 13,
    lineHeight: 1.1,
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      {/* Top bar */}
      <div
        style={{
          position: 'absolute',
          top: isMobile ? 60 : 10,
          left: isMobile ? 10 : '50%',
          right: isMobile ? 10 : 'auto',
          transform: isMobile ? 'none' : 'translateX(-50%)',
          zIndex: 1000,
          background: 'white',
          padding: isMobile ? '8px 10px' : '10px 20px',
          borderRadius: 8,
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 8 : 15,
          width: isMobile ? 'calc(100% - 20px)' : 'auto',
          maxWidth: isMobile ? 'calc(100% - 20px)' : '90vw',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
        }}
      >
        <div style={{ whiteSpace: 'nowrap', fontSize: isMobile ? 12 : 14 }}>
          🏚️ <strong>{approvedCount}</strong> {isMobile ? 'approved' : 'approved sites'}
        </div>

        {!isMobile && (
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
        )}

        <button onClick={() => setShowFeed(true)} style={btnStyle('#111')}>
          📰{isMobile ? '' : ' Feed'}
        </button>

        <button onClick={() => setShowLeaderboard(!showLeaderboard)} style={btnStyle('#2196F3')}>
          🏆{isMobile ? '' : ' Leaderboard'}
        </button>

        <button onClick={() => setShowImpact(true)} style={btnStyle('#673ab7')}>
          📊{isMobile ? '' : ' Impact'}
        </button>

        <button onClick={recenterToUser} title={locationError || 'Recenter'} style={btnStyle('#1a73e8')}>
          📍{isMobile ? '' : ' My Location'}
        </button>

        {user && (
          <button onClick={() => setShowProfile(true)} style={btnStyle('#607d8b')}>
            👤{isMobile ? '' : ' Profile'}
          </button>
        )}

        {isAdmin && (
          <button onClick={() => setShowAdminDashboard(true)} style={btnStyle('#ff9800')}>
            🛡️{isMobile ? '' : ' Admin'} {pendingCount > 0 && `(${pendingCount})`}
          </button>
        )}

        {isMobile &&
          (user ? (
            <button onClick={handleSignOut} style={btnStyle('#f44336')} title="Sign Out">
              🚪
            </button>
          ) : (
            <button onClick={onSignInClick} style={btnStyle('#4CAF50')} title="Sign In">
              🔐
            </button>
          ))}
      </div>

      {!isMobile &&
        (user ? (
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
        ))}

      <MapContainer center={userLocation} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        <AddMarkerOnClick onMapClick={handleMapClick} />
        <RecenterMap target={liveUserLocation} recenterTick={recenterTick} />

        {liveUserLocation && (
          <Marker position={[liveUserLocation.lat, liveUserLocation.lng]} icon={userDotIcon}>
            <Popup>
              <PopupSafeArea>
                <div>
                  <strong>You are here</strong>
                  {locationError && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>{locationError}</div>
                  )}
                </div>
              </PopupSafeArea>
            </Popup>
          </Marker>
        )}

        {sites.map((site) => (
          <Marker key={site.id} position={[site.latitude, site.longitude]}>
            <Popup maxWidth={320}>
              <PopupSafeArea>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
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
                    <div style={{ fontSize: 12, color: '#666', marginTop: 5, marginBottom: 6 }}>
                      Discovered by <strong>@{site.profiles.username}</strong>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#999', marginTop: 5, marginBottom: 6 }}>
                      Discovered by <em>anonymous</em>
                    </div>
                  )}

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

                  {site.description && <p style={{ marginTop: 8, fontSize: 14 }}>{site.description}</p>}

                  <small style={{ color: '#666', display: 'block', marginTop: 5 }}>
                    {new Date(site.created_at).toLocaleDateString()}
                  </small>

                  <button
                    type="button"
                    onPointerDown={stopMapEvent}
                    onClick={(e) => openAIModal(site, e)}
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
              </PopupSafeArea>
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

      {/* ✅ IMPORTANT: pass isOpen so AIReimager actually renders */}
      {showAIModal && selectedSite && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5000 }}>
          <AIReimager
            isOpen={showAIModal}
            site={selectedSite}
            onClose={() => setShowAIModal(false)}
          />
        </div>
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

      {/* Profile modal with props */}
      {showProfile && user && (
        <ProfileScreen
          user={user}
          profile={profile}
          sites={sites}
          favoriteSiteIds={favoriteSiteIds}
          leaderboard={leaderboard}
          onClose={async () => {
            setShowProfile(false)
            await loadFavorites()
          }}
        />
      )}

      {/* NEW: Global feed modal */}
      {showFeed && <PostsFeed user={user} onClose={() => setShowFeed(false)} />}

      {/* Leaderboard Modal */}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <h3 style={{ margin: 0 }}>🏆 Top Discoverers</h3>
            <button
              onClick={() => setShowLeaderboard(false)}
              style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999' }}
            >
              ×
            </button>
          </div>

          {leaderboard.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', padding: 20 }}>No approved sites yet</p>
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
                      index === 0 ? '#fff9c4' : index === 1 ? '#f5f5f5' : index === 2 ? '#ffe0b2' : '#fafafa',
                    borderRadius: 8,
                    border: index < 3 ? '2px solid #ffc107' : '1px solid #eee',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20, fontWeight: 'bold' }}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                    </span>
                    <span style={{ fontWeight: index < 3 ? 'bold' : 'normal' }}>@{entry.username}</span>
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
        </div>
      )}

      {/* ✅ Restored Welcome modal (4 boxes + strong intro + quick tutorial) */}
      {showWelcome && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2500,
            padding: 16,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) handleDismissWelcome()
          }}
          onTouchStart={(e) => {
            if (e.target === e.currentTarget) handleDismissWelcome()
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 18,
              padding: 22,
              maxWidth: 860,
              width: '100%',
              boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 26, lineHeight: 1.15 }}>
                  🏚️ Welcome to <span style={{ color: '#16a34a' }}>Derelict Connect</span>
                </h2>
                <p style={{ marginTop: 8, marginBottom: 0, color: '#4b5563', fontSize: 14, maxWidth: 700 }}>
                  A community map of derelict and long-term vacant sites across Ireland.
                  Every pin helps show the real scale of under-used buildings and land, and pushes for action.
                </p>
              </div>

              <button
                onClick={handleDismissWelcome}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 26,
                  cursor: 'pointer',
                  color: '#9ca3af',
                  lineHeight: 1,
                }}
                aria-label="Close"
                title="Close"
              >
                ×
              </button>
            </div>

            <div
              style={{
                marginTop: 16,
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                gap: 12,
              }}
            >
              {[
                { title: 'Map the problem', desc: 'Drop pins where buildings are derelict or long-term vacant.', icon: '📍' },
                { title: 'Make it visible', desc: 'A public snapshot that highlights hotspots and patterns.', icon: '👀' },
                { title: 'Support housing', desc: 'Better awareness can help unlock sites for reuse and homes.', icon: '🏠' },
                { title: 'Community-led', desc: 'Built for locals, councils, and anyone who cares.', icon: '🤝' },
              ].map((b) => (
                <div
                  key={b.title}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 14,
                    padding: 12,
                    background: '#f9fafb',
                  }}
                >
                  <div style={{ fontSize: 20 }}>{b.icon}</div>
                  <div style={{ marginTop: 6, fontWeight: 900, color: '#111827', fontSize: 14 }}>
                    {b.title}
                  </div>
                  <div style={{ marginTop: 4, color: '#6b7280', fontSize: 12, lineHeight: 1.35 }}>
                    {b.desc}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 16,
                borderRadius: 16,
                border: '1px solid #e5e7eb',
                padding: 14,
                background: 'white',
              }}
            >
              <div style={{ fontWeight: 900, color: '#111827', marginBottom: 10 }}>
                Quick tutorial (30 seconds)
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
                  gap: 10,
                }}
              >
                <div style={{ background: '#f3f4f6', borderRadius: 14, padding: 12 }}>
                  <div style={{ fontWeight: 900 }}>1) Add a pin</div>
                  <div style={{ color: '#6b7280', fontSize: 13, marginTop: 6, lineHeight: 1.35 }}>
                    Tap the map where the site is. Add a name, details, and (if signed in) upload a photo.
                  </div>
                </div>

                <div style={{ background: '#f3f4f6', borderRadius: 14, padding: 12 }}>
                  <div style={{ fontWeight: 900 }}>2) Explore sites</div>
                  <div style={{ color: '#6b7280', fontSize: 13, marginTop: 6, lineHeight: 1.35 }}>
                    Tap a marker to view details. Use “My Location” to jump to your area (no tracking follow).
                  </div>
                </div>

                <div style={{ background: '#f3f4f6', borderRadius: 14, padding: 12 }}>
                  <div style={{ fontWeight: 900 }}>3) Reimagine</div>
                  <div style={{ color: '#6b7280', fontSize: 13, marginTop: 6, lineHeight: 1.35 }}>
                    Open a site and press “Reimagine with AI” to see what the property could become.
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 10, color: '#6b7280', fontSize: 12 }}>
                Tip: you can add sites anonymously, but signing in lets you upload photos and track your contributions.
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                display: 'flex',
                gap: 10,
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              {!user && (
                <button
                  onClick={() => {
                    handleDismissWelcome()
                    onSignInClick?.()
                  }}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    background: 'white',
                    cursor: 'pointer',
                    fontWeight: 900,
                  }}
                >
                  🔐 Sign in
                </button>
              )}

              <button
                onClick={handleDismissWelcome}
                style={{
                  padding: '10px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: '#16a34a',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 900,
                }}
              >
                ✅ Start mapping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Impact modal */}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
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

            <div style={{ color: '#555', fontSize: 14 }}>
              Approved: <strong>{approvedCount}</strong> · Pending: <strong>{pendingCount}</strong> · Total:{' '}
              <strong>{totalSites}</strong>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                Goal progress: {(goalProgress * 100).toFixed(1)}% ({approvedCount.toLocaleString()} /{' '}
                {GOAL_SITES.toLocaleString()})
              </div>
              <div style={{ width: '100%', height: 10, background: '#eee', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${goalProgress * 100}%`, height: '100%', background: '#4CAF50' }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Map



