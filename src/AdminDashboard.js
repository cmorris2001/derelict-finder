import React, { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function AdminDashboard({ onClose }) {
  const [pendingSites, setPendingSites] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPendingSites()
  }, [])

  const loadPendingSites = async () => {
    try {
      // Get all pending sites
      const { data: sitesData, error: sitesError } = await supabase
        .from('derelict_sites')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (sitesError) throw sitesError

      // Get all profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
      
      if (profilesError) throw profilesError

      // Manually join the data
      const sitesWithProfiles = sitesData.map(site => ({
        ...site,
        profiles: site.user_id ? profilesData.find(p => p.id === site.user_id) : null
      }))

      setPendingSites(sitesWithProfiles || [])
    } catch (err) {
      console.error('Error loading pending sites:', err)
      alert('Error loading pending sites')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (siteId) => {
    try {
      const { error } = await supabase
        .from('derelict_sites')
        .update({ status: 'approved' })
        .eq('id', siteId)

      if (error) throw error
      
      setPendingSites(pendingSites.filter(s => s.id !== siteId))
      alert('✅ Site approved!')
    } catch (err) {
      console.error('Error approving:', err)
      alert('Error approving site')
    }
  }

  const handleReject = async (siteId) => {
    if (!window.confirm('Reject this site? It will be permanently deleted.')) return

    try {
      const { error } = await supabase
        .from('derelict_sites')
        .delete()
        .eq('id', siteId)

      if (error) throw error
      
      setPendingSites(pendingSites.filter(s => s.id !== siteId))
      alert('🗑️ Site rejected and deleted')
    } catch (err) {
      console.error('Error rejecting:', err)
      alert('Error rejecting site')
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
      zIndex: 3000,
      overflow: 'auto',
      padding: 20
    }}>
      <div style={{
        background: 'white',
        padding: 30,
        borderRadius: 12,
        width: '90%',
        maxWidth: 900,
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>🛡️ Admin Dashboard</h2>
          <button onClick={onClose} style={{
            background: '#666', color: 'white', border: 'none',
            padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold'
          }}>
            Close
          </button>
        </div>

        {loading ? (
          <p>Loading pending submissions...</p>
        ) : pendingSites.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#666', padding: 40 }}>
            🎉 No pending submissions!
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 20 }}>
            {pendingSites.map((site) => (
              <div key={site.id} style={{
                border: '2px solid #ff9800',
                borderRadius: 8,
                padding: 20,
                background: '#fff3e0'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <div>
                    <h3 style={{ marginTop: 0 }}>{site.name}</h3>
                    <p style={{ fontSize: 14, color: '#666' }}>
                      <strong>Submitted by:</strong> {site.profiles ? `@${site.profiles.username}` : 'Anonymous'}
                    </p>
                    <p style={{ fontSize: 14, color: '#666' }}>
                      <strong>Location:</strong> {site.latitude.toFixed(5)}, {site.longitude.toFixed(5)}
                    </p>
                    <p style={{ fontSize: 14 }}>{site.description || <em>No description</em>}</p>
                    <small style={{ color: '#999' }}>
                      Submitted: {new Date(site.created_at).toLocaleString()}
                    </small>
                  </div>

                  <div>
                    {site.photo_url ? (
                      <img src={site.photo_url} alt={site.name}
                           style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 6 }} />
                    ) : (
                      <div style={{
                        width: '100%', height: 200,
                        background: '#f0f0f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 6,
                        color: '#999'
                      }}>
                        No photo
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button
                    onClick={() => handleApprove(site.id)}
                    style={{
                      flex: 1,
                      padding: 12,
                      background: '#4CAF50',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    ✅ Approve
                  </button>
                  <button
                    onClick={() => handleReject(site.id)}
                    style={{
                      flex: 1,
                      padding: 12,
                      background: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    🗑️ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminDashboard

