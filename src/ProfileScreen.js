import React, { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function ProfileScreen({ user, profile, sites, favoriteSiteIds, leaderboard, onClose }) {
  const [username, setUsername] = useState(profile?.username || '')
  const [saving, setSaving] = useState(false)
  const [userSites, setUserSites] = useState([])
  const [favorites, setFavorites] = useState([])
  const [rankInfo, setRankInfo] = useState(null)

  useEffect(() => {
    if (!user) return
    // Sites discovered by this user
    setUserSites(sites.filter((s) => s.user_id === user.id))

    // Favourite sites
    setFavorites(sites.filter((s) => favoriteSiteIds.includes(s.id)))

    // Leaderboard position
    if (leaderboard && profile?.username) {
      const index = leaderboard.findIndex((entry) => entry.username === profile.username)
      if (index !== -1) {
        setRankInfo({
          rank: index + 1,
          count: leaderboard[index].count,
        })
      } else {
        setRankInfo(null)
      }
    }
  }, [user, profile, sites, favoriteSiteIds, leaderboard])

  const approvedCount = userSites.filter((s) => s.status === 'approved').length
  const pendingCount = userSites.filter((s) => s.status === 'pending').length

  const handleSaveUsername = async () => {
    if (!username.trim()) {
      alert('Username cannot be empty')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ username: username.trim() })
        .eq('id', user.id)

      if (error) throw error
      alert('Username updated. It may take a refresh to show everywhere.')
    } catch (err) {
      console.error('Error updating username:', err)
      alert('Error updating username: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 3000,
        padding: 20,
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 16,
          maxWidth: 800,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 24,
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>👤 Your profile</h2>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 26,
              cursor: 'pointer',
              color: '#888',
            }}
          >
            ×
          </button>
        </div>

        {/* Username editor */}
        <section style={{ marginTop: 20, marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Username</h3>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 8,
                border: '1px solid #ccc',
                fontSize: 16,
              }}
            />
            <button
              onClick={handleSaveUsername}
              disabled={saving}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                border: 'none',
                background: saving ? '#ccc' : '#2196F3',
                color: 'white',
                fontWeight: 'bold',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </section>

        {/* Stats */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: '#e3f2fd',
            }}
          >
            <div style={{ fontSize: 13, color: '#555' }}>Approved discoveries</div>
            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#1976d2' }}>{approvedCount}</div>
          </div>
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: '#fff3e0',
            }}
          >
            <div style={{ fontSize: 13, color: '#555' }}>Pending approval</div>
            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#f57c00' }}>{pendingCount}</div>
          </div>
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: '#f3e5f5',
            }}
          >
            <div style={{ fontSize: 13, color: '#555' }}>Leaderboard</div>
            {rankInfo ? (
              <div style={{ fontSize: 16, marginTop: 4 }}>
                Rank <strong>#{rankInfo.rank}</strong> with{' '}
                <strong>{rankInfo.count}</strong> approved site
                {rankInfo.count === 1 ? '' : 's'}
              </div>
            ) : (
              <div style={{ fontSize: 14, marginTop: 4, color: '#777' }}>Not ranked yet</div>
            )}
          </div>
        </section>

        {/* User’s sites */}
        <section style={{ marginBottom: 24 }}>
          <h3>Your sites</h3>
          {userSites.length === 0 ? (
            <p style={{ color: '#777' }}>You haven’t added any sites yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {userSites.map((site) => (
                <div
                  key={site.id}
                  style={{
                    borderRadius: 10,
                    border: '1px solid #eee',
                    padding: 10,
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  {site.photo_url && (
                    <img
                      src={site.photo_url}
                      alt={site.name}
                      style={{
                        width: 80,
                        height: 60,
                        objectFit: 'cover',
                        borderRadius: 6,
                      }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold' }}>{site.name}</div>
                    <div style={{ fontSize: 12, color: '#777' }}>
                      {new Date(site.created_at).toLocaleDateString()} ·{' '}
                      {site.status === 'approved' ? 'Approved' : 'Pending'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Favourites */}
        <section style={{ marginBottom: 8 }}>
          <h3>Favourited sites</h3>
          {favorites.length === 0 ? (
            <p style={{ color: '#777' }}>You haven’t favourited any sites yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {favorites.map((site) => (
                <div
                  key={site.id}
                  style={{
                    borderRadius: 10,
                    border: '1px solid #eee',
                    padding: 10,
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  {site.photo_url && (
                    <img
                      src={site.photo_url}
                      alt={site.name}
                      style={{
                        width: 80,
                        height: 60,
                        objectFit: 'cover',
                        borderRadius: 6,
                      }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold' }}>{site.name}</div>
                    <div style={{ fontSize: 12, color: '#777' }}>
                      {new Date(site.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default ProfileScreen