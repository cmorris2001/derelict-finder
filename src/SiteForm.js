// src/SiteForm.js
import React, { useState } from 'react'
import { supabase } from './supabaseClient'

function SiteForm({ position, userId, onClose, onSiteAdded }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [eircode, setEircode] = useState('')
  const [photo, setPhoto] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setUploading(true)

    try {
      let photoUrl = null

      // 1) Upload photo to Supabase Storage (if provided)
      if (photo) {
        const fileExt = photo.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`
        const filePath = fileName

        const { error: uploadError } = await supabase.storage
          .from('site-photos')
          .upload(filePath, photo)

        if (uploadError) throw uploadError

        const { data: publicUrlData } = supabase.storage
          .from('site-photos')
          .getPublicUrl(filePath)

        photoUrl = publicUrlData.publicUrl
      }

      // 2) Insert site into DB
      const { data, error: insertError } = await supabase
        .from('derelict_sites')
        .insert([
          {
            name,
            description,
            latitude: position.lat,
            longitude: position.lng,
            photo_url: photoUrl,
            user_id: userId,
            eircode: eircode || null, // new field
            status: 'pending',        // if you’re using pending/approved
          }
        ])
        .select()
        .single()

      if (insertError) throw insertError

      onSiteAdded(data)
      onClose()
    } catch (err) {
      console.error('Error adding site:', err)
      setError(err.message || 'Failed to add site')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: 24,
        width: '95%',
        maxWidth: 520,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        <h2 style={{ marginTop: 0 }}>🏚️ Add a derelict site</h2>
        <p style={{ fontSize: 14, color: '#666' }}>
          Location: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 4 }}>
              Site name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Old shop on Main Street"
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 6,
                border: '1px solid #ccc',
                fontSize: 14
              }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 4 }}>
              Eircode (optional)
            </label>
            <input
              type="text"
              value={eircode}
              onChange={(e) => setEircode(e.target.value.toUpperCase())}
              placeholder="e.g. P25 ABC1"
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 6,
                border: '1px solid #ccc',
                fontSize: 14,
                textTransform: 'uppercase'
              }}
            />
            <small style={{ color: '#777' }}>
              We’ll store this so councils can see an official list later.
            </small>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 4 }}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the condition or history…"
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 6,
                border: '1px solid #ccc',
                fontSize: 14,
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 4 }}>
              Photo (optional but very helpful)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: 12,
              padding: 10,
              borderRadius: 6,
              background: '#ffebee',
              color: '#b71c1c',
              fontSize: 13
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button
              type="submit"
              disabled={uploading}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 6,
                border: 'none',
                background: uploading ? '#9e9e9e' : '#4CAF50',
                color: '#fff',
                fontWeight: 'bold',
                cursor: uploading ? 'default' : 'pointer'
              }}
            >
              {uploading ? 'Saving…' : 'Save site'}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              style={{
                padding: 12,
                borderRadius: 6,
                border: 'none',
                background: '#eee',
                color: '#333',
                fontWeight: 'bold',
                cursor: uploading ? 'default' : 'pointer'
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