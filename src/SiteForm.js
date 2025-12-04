import React, { useState } from 'react'
import { supabase } from './supabaseClient'

function SiteForm({ position, userId, onClose, onSiteAdded }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState(null)
  const [uploading, setUploading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setUploading(true)

    try {
      let photoUrl = null

      // 1) Upload photo to Supabase Storage (if provided)
      if (photo) {
        const ext = photo.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const filePath = `sites/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('site-photos')
          .upload(filePath, photo)

        if (uploadError) throw uploadError

        const { data: publicData } = supabase.storage
          .from('site-photos')
          .getPublicUrl(filePath)

        photoUrl = publicData.publicUrl
      }

      // 2) Insert site row
      const { data, error } = await supabase
        .from('derelict_sites')
        .insert([
          {
            name,
            description,
            latitude: position.lat,
            longitude: position.lng,
            photo_url: photoUrl,
            user_id: userId,        // can be null if anonymous
            status: 'pending',      // or 'approved' if you want auto-approve
          }
        ])
        .select()
        .single()

      if (error) throw error

      // 3) Update local state in Map
      onSiteAdded(data)
      onClose()
    } catch (err) {
      console.error('Error adding site:', err)
      alert('Error adding site: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000,
      padding: 20
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: 30,
        borderRadius: 12,
        width: '90%',
        maxWidth: 520,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        <h2 style={{ marginTop: 0 }}>🏚️ Add Derelict Site</h2>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 15 }}>
          Location: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 15 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>
              Site name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Abandoned farmhouse"
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 6,
                border: '1px solid #ccc',
                fontSize: 16
              }}
            />
          </div>

          <div style={{ marginBottom: 15 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details about this site…"
              rows={3}
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 6,
                border: '1px solid #ccc',
                fontSize: 15,
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>
              Photo (optional, required if signed in to use AI later)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files[0])}
              style={{ fontSize: 14 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit"
              disabled={uploading}
              style={{
                flex: 1,
                padding: 12,
                backgroundColor: uploading ? '#ccc' : '#4CAF50',
                color: 'white',
                borderRadius: 6,
                border: 'none',
                fontSize: 16,
                fontWeight: 'bold',
                cursor: uploading ? 'not-allowed' : 'pointer'
              }}
            >
              {uploading ? 'Saving…' : 'Save site'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              style={{
                flex: 1,
                padding: 12,
                backgroundColor: '#f44336',
                color: 'white',
                borderRadius: 6,
                border: 'none',
                fontSize: 16,
                fontWeight: 'bold',
                cursor: uploading ? 'not-allowed' : 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default SiteForm

