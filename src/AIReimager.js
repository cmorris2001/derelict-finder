import React, { useState } from 'react'
import { supabase, supabaseAnonKey } from './supabaseClient'

function AIReimager({ site, onClose }) {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState(null)
  const [error, setError] = useState(null)

  const hasPhoto = !!site?.photo_url
  const [mode, setMode] = useState(hasPhoto ? 'preserve' : 'newbuild') // 'preserve' | 'newbuild'
  const [strength, setStrength] = useState(0.4)

  const handleGenerate = async () => {
    setGenerating(true)
    setGeneratedImage(null)
    setError(null)

    try {
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: {
          prompt,
          mode,
          imageUrl: hasPhoto ? site.photo_url : undefined,
          strength: Number(strength)
        },
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`
        }
      })

      if (error) {
        const details = typeof error?.context?.body === 'string'
          ? error.context.body
          : JSON.stringify(error?.context?.body || {}, null, 2)
        throw new Error(`Edge Function error\n${details}`)
      }

      if (data?.error === 'billing_required') {
        throw new Error('Replicate billing required. Add credit and try again.')
      }

      if (!data?.imageUrl) {
        throw new Error('No image returned from Edge Function.')
      }

      setGeneratedImage(data.imageUrl)
    } catch (e) {
      console.error(e)
      setError(e.message || 'Failed to generate')
      alert('Error generating image: ' + (e.message || e))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 3000, padding: 20
    }}>
      <div style={{
        background: 'white', padding: 30, borderRadius: 12,
        width: '90%', maxWidth: 900, maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        <h2 style={{ marginTop: 0 }}>✨ Reimagine: {site?.name}</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <div>
            <h3>Original Derelict Site</h3>
            {hasPhoto ? (
              <img src={site.photo_url} alt={site?.name || 'Site photo'}
                   style={{ width: '100%', height: 250, objectFit: 'cover', borderRadius: 8, border: '2px solid #ddd' }} />
            ) : (
              <div style={{ width: '100%', height: 250, background: '#f0f0f0',
                display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: 8 }}>
                No photo available
              </div>
            )}
          </div>

          <div>
            <h3>AI Reimagined</h3>
            {generatedImage ? (
              <img src={generatedImage} alt="AI Generated"
                   style={{ width: '100%', height: 250, objectFit: 'cover',
                   borderRadius: 8, border: '2px solid #4CAF50' }} />
            ) : (
              <div style={{ width: '100%', height: 250, background: '#f0f0f0',
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                borderRadius: 8, color: '#666' }}>
                {generating ? '🎨 Generating...' : 'Click generate to see magic'}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'end', marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc' }}
            >
              <option value="preserve" disabled={!hasPhoto}>Preserve existing structure (img2img)</option>
              <option value="newbuild">New build on site (text-to-image)</option>
            </select>
            {!hasPhoto && <small style={{ color: '#666' }}>No photo: using New build mode.</small>}
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>
              Change amount ({strength})
            </label>
            <input type="range" min="0.1" max="0.95" step="0.05"
                   value={strength} onChange={(e) => setStrength(e.target.value)}
                   disabled={mode !== 'preserve'} style={{ width: '100%' }} />
            <small style={{ color: '#666' }}>
              Lower = keep more of original shapes. Try 0.3–0.5 to preserve the building massing.
            </small>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 10, fontWeight: 'bold' }}>
            How would you like to reimagine this site?
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={mode === 'preserve'
              ? 'e.g., renovate facade with timber and glass, open porch, new windows'
              : 'e.g., modern two-storey house, white render, large windows, pitched roof'}
            rows={3}
            style={{ width: '100%', padding: 12, border: '1px solid #ccc', borderRadius: 6, fontSize: 16, fontFamily: 'inherit' }}
          />
        </div>

        {error && <div style={{ marginBottom: 12, color: '#d32f2f', fontSize: 14 }}>{String(error)}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleGenerate}
            disabled={!prompt || generating}
            style={{
              flex: 1, padding: 12,
              backgroundColor: (!prompt || generating) ? '#ccc' : '#4CAF50',
              color: 'white', border: 'none', borderRadius: 6, fontSize: 16, fontWeight: 'bold',
              cursor: (!prompt || generating) ? 'not-allowed' : 'pointer'
            }}
          >
            {generating ? '✨ Generating…' : '🎨 Generate Reimagination'}
          </button>
          <button onClick={onClose} disabled={generating}
                  style={{ padding: '12px 24px', background: '#666', color: 'white',
                  border: 0, borderRadius: 6, fontSize: 16, fontWeight: 'bold',
                  cursor: generating ? 'not-allowed' : 'pointer' }}>
            Close
          </button>
        </div>

        {generatedImage && (
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <a href={generatedImage} download="reimagined-site.png"
               style={{ display: 'inline-block', padding: '10px 20px', background: '#2196F3',
               color: 'white', textDecoration: 'none', borderRadius: 6, fontWeight: 'bold' }}>
              💾 Download Reimagined Image
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default AIReimager
