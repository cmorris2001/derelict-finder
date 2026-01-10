// src/AIReimager.js
import React, { useState } from 'react'
import { supabase, supabaseAnonKey } from './supabaseClient'

// Our 5 fixed archetypes
const HOME_VARIANTS = [
  {
    key: 'bungalow',
    label: 'Bungalow',
    suffix:
      'a single-storey bungalow, compact footprint, pitched roof, simple and welcoming, suited to Irish suburbs'
  },
  {
    key: 'two_storey',
    label: '2-storey home',
    suffix:
      'a modern two-storey detached family home, pitched roof, balanced windows, comfortable proportions'
  },
  {
    key: 'attached_garage',
    label: '1-storey + attached garage',
    suffix:
      'a single-storey home with an attached single-car garage on one side, neat and practical'
  },
  {
    key: 'detached_garage',
    label: '1-storey + detached garage',
    suffix:
      'a single-storey home with a small detached garage elsewhere on the plot, leaving a clear front elevation'
  },
  {
    key: 'wild',
    label: 'Bold concept',
    suffix:
      'a bold contemporary concept home, interesting geometry, generous glazing, still realistic and buildable'
  }
]

// ---- Helpers: upload AI result to Supabase Storage and store in DB ----

async function uploadImageUrlToSupabase(imageUrl, userId) {
  // Requires a public bucket named: ai-images
  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error('Failed to download AI image')
  const blob = await res.blob()

  const contentType = blob.type || 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : 'jpg'
  const path = `${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('ai-images')
    .upload(path, blob, { contentType, upsert: false })

  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('ai-images').getPublicUrl(path)
  if (!data?.publicUrl) throw new Error('Could not get public URL for uploaded image')
  return data.publicUrl
}

async function saveGenerationToDbAndStorage({ siteId, userId, imageUrl, prompt, conceptType }) {
  // 1) upload to storage so it never expires
  const publicUrl = await uploadImageUrlToSupabase(imageUrl, userId)

  // 2) store DB row
  const { data, error } = await supabase
    .from('ai_generations')
    .insert({
      site_id: siteId,
      user_id: userId,
      image_url: publicUrl,
      prompt: prompt || null,
      concept_type: conceptType || null
    })
    .select('id, image_url')
    .single()

  if (error) throw error
  return data // { id, image_url }
}

async function sharePost({ siteId, generationId, userId, caption }) {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      site_id: siteId,
      generation_id: generationId,
      user_id: userId,
      caption: caption || null
    })
    .select('id')
    .single()

  if (error) throw error
  return data
}

function AIReimager({ site, onClose }) {
  const hasPhoto = !!site?.photo_url

  const [notes, setNotes] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(null)

  // results: [{ key, label, url, generationId, storedUrl, promptUsed }]
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [currentIndex, setCurrentIndex] = useState(-1)

  const [sharingId, setSharingId] = useState(null)

  const resetStateForGeneration = () => {
    setGenerating(true)
    setProgress(0)
    setStatus('Starting reimagination…')
    setResults([])
    setSelected(null)
    setError(null)
    setCurrentIndex(-1)
    setSharingId(null)
  }

  const handleGenerate = async () => {
    if (generating) return
    resetStateForGeneration()

    try {
      // Must be signed in to save/share (needed for Storage + DB writes)
      const auth = await supabase.auth.getUser()
      const userId = auth?.data?.user?.id
      if (!userId) {
        throw new Error('Please sign in to generate and save AI images.')
      }

      const basePrompt = [
        'Design a new home on this derelict site.',
        'Use the same camera angle as the original photo, realistic materials and lighting.',
        'High quality architectural visualization, realistic Irish context.'
      ].join(' ')

      for (let i = 0; i < HOME_VARIANTS.length; i++) {
        const variant = HOME_VARIANTS[i]
        setCurrentIndex(i)
        setStatus(`Generating ${variant.label} (${i + 1}/${HOME_VARIANTS.length})…`)

        const fullPrompt = [
          basePrompt,
          notes?.trim() ? `Extra notes: ${notes.trim()}.` : '',
          variant.suffix
        ]
          .filter(Boolean)
          .join(' ')

        const mode = hasPhoto ? 'preserve' : 'newbuild'
        const strength = hasPhoto ? 0.35 : 0.7

        const { data, error: fnError } = await supabase.functions.invoke('generate-image', {
          body: {
            prompt: fullPrompt,
            mode,
            strength,
            imageUrl: hasPhoto ? site.photo_url : undefined
          },
          headers: {
            Authorization: `Bearer ${supabaseAnonKey}`
          }
        })

        if (fnError) {
          const details =
            typeof fnError?.context?.body === 'string'
              ? fnError.context.body
              : JSON.stringify(fnError?.context?.body || {}, null, 2)
          throw new Error(details)
        }

        const returnedUrl =
          data?.imageUrl ||
          (Array.isArray(data?.images) && data.images[0]) ||
          null

        if (!returnedUrl) {
          throw new Error(`No image returned for ${variant.label}`)
        }

        // ✅ Save AI image permanently (Storage + ai_generations row)
        setStatus(`Saving ${variant.label}…`)
        const saved = await saveGenerationToDbAndStorage({
          siteId: site.id,
          userId,
          imageUrl: returnedUrl,
          prompt: fullPrompt,
          conceptType: variant.key
        })

        // append this result (use storedUrl for display)
        setResults((prev) => {
          const next = [
            ...prev,
            {
              key: variant.key,
              label: variant.label,
              url: saved.image_url, // display the stable storage URL
              generationId: saved.id,
              storedUrl: saved.image_url,
              promptUsed: fullPrompt
            }
          ]
          if (next.length === 1) setSelected(next[0])
          return next
        })

        const pct = Math.round(((i + 1) / HOME_VARIANTS.length) * 100)
        setProgress(pct)
      }

      setStatus('All concepts generated ✔')
    } catch (e) {
      console.error(e)
      setError(e.message || 'Failed to generate images')
      setStatus('Something went wrong.')
    } finally {
      setGenerating(false)
      setCurrentIndex(-1)
    }
  }

  const handleCardClick = (variantKey) => {
    const found = results.find((r) => r.key === variantKey)
    if (found) setSelected(found)
  }

  const handleShareSelected = async () => {
    if (!selected?.generationId) {
      alert('Please generate and select a concept first.')
      return
    }

    try {
      const auth = await supabase.auth.getUser()
      const userId = auth?.data?.user?.id
      if (!userId) {
        alert('Sign in to share.')
        return
      }

      setSharingId(selected.generationId)
      const caption = window.prompt('Caption (optional):', '') || ''

      await sharePost({
        siteId: site.id,
        generationId: selected.generationId,
        userId,
        caption
      })

      alert('Posted ✅ Open the Feed to see it!')
    } catch (e) {
      console.error(e)
      alert(e.message || 'Failed to post.')
    } finally {
      setSharingId(null)
    }
  }

  const renderProgress = () => {
    if (!generating) return null
    return (
      <div style={{ margin: '12px 0 8px' }}>
        <div
          style={{
            height: 8,
            borderRadius: 999,
            backgroundColor: '#eee',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              backgroundColor: '#4CAF50',
              transition: 'width 0.3s ease'
            }}
          />
        </div>
        <small style={{ color: '#555' }}>{status}</small>
      </div>
    )
  }

  const renderOptionGrid = () => (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ marginBottom: 8 }}>Concept options</h3>
      <p style={{ fontSize: 14, color: '#555', marginBottom: 10 }}>
        You&apos;ll get one concept for each type: bungalow, 2-storey, attached garage,
        detached garage, and a bold unique design.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          gap: 12
        }}
      >
        {HOME_VARIANTS.map((variant, i) => {
          const result = results.find((r) => r.key === variant.key)
          const isSelected = selected?.key === variant.key
          const isGeneratingThis = generating && currentIndex === i

          return (
            <div
              key={variant.key}
              onClick={() => result && handleCardClick(variant.key)}
              style={{
                border: isSelected ? '3px solid #4CAF50' : '2px solid #ddd',
                borderRadius: 8,
                overflow: 'hidden',
                backgroundColor: '#fafafa',
                cursor: result ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{ width: '100%', height: 130, backgroundColor: '#eee' }}>
                {result ? (
                  <img
                    src={result.url}
                    alt={variant.label}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block'
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#777',
                      fontSize: 13,
                      padding: '0 6px',
                      textAlign: 'center'
                    }}
                  >
                    {isGeneratingThis
                      ? `Generating ${variant.label}…`
                      : generating && i > currentIndex
                        ? 'Waiting…'
                        : 'Not generated yet'}
                  </div>
                )}
              </div>
              <div style={{ padding: '6px 8px 8px' }}>
                <strong style={{ fontSize: 13 }}>{variant.label}</strong>
                {result?.generationId && (
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                    Saved ✅
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const selectedImageUrl = selected?.url || null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 3000,
        padding: 20
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: 30,
          borderRadius: 12,
          width: '95%',
          maxWidth: 1100,
          maxHeight: '95vh',
          overflow: 'auto',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }}
      >
        <h2 style={{ marginTop: 0, color: 'black' }}>✨ NEW REIMAGINE {site?.name}</h2>

        {/* Top row: original + selected */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            marginBottom: 16
          }}
        >
          <div>
            <h3>Original Derelict Site</h3>
            {hasPhoto ? (
              <img
                src={site.photo_url}
                alt={site?.name || 'Site photo'}
                style={{
                  width: '100%',
                  height: 260,
                  objectFit: 'cover',
                  borderRadius: 8,
                  border: '2px solid #ddd'
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: 260,
                  backgroundColor: '#f0f0f0',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#666'
                }}
              >
                No photo available
              </div>
            )}
          </div>

          <div>
            <h3>AI Reimagined</h3>
            {selectedImageUrl ? (
              <img
                src={selectedImageUrl}
                alt="Selected concept"
                style={{
                  width: '100%',
                  height: 260,
                  objectFit: 'cover',
                  borderRadius: 8,
                  border: '2px solid #4CAF50'
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: 260,
                  backgroundColor: '#f5f5f5',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#666',
                  textAlign: 'center',
                  padding: '0 10px'
                }}
              >
                {generating
                  ? '🎨 Generating concepts…'
                  : 'Click “Generate Reimagination” to see 5 concept options for this site.'}
              </div>
            )}

            {/* Share selected */}
            {selected?.generationId && (
              <button
                onClick={handleShareSelected}
                disabled={generating || sharingId === selected.generationId}
                style={{
                  marginTop: 10,
                  width: '100%',
                  padding: 12,
                  backgroundColor: (generating || sharingId === selected.generationId) ? '#ccc' : '#111',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 'bold',
                  cursor: (generating || sharingId === selected.generationId) ? 'not-allowed' : 'pointer'
                }}
              >
                {sharingId === selected.generationId ? 'Posting…' : '📣 Share selected to Feed'}
              </button>
            )}
          </div>
        </div>

        {renderProgress()}

        {error && (
          <div
            style={{
              marginBottom: 10,
              padding: '8px 10px',
              borderRadius: 6,
              backgroundColor: '#ffe6e6',
              color: '#b71c1c',
              fontSize: 14
            }}
          >
            {String(error)}
          </div>
        )}

        {/* Notes + main button row */}
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: 'block',
              marginBottom: 6,
              fontWeight: 'bold'
            }}
          >
            Optional extra notes for the architect
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., keep some existing trees, use brick and slate, add good parking..."
            rows={2}
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

        <div
          style={{
            display: 'flex',
            gap: 10,
            marginBottom: 10
          }}
        >
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              flex: 1,
              padding: 12,
              backgroundColor: generating ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 16,
              fontWeight: 'bold',
              cursor: generating ? 'not-allowed' : 'pointer'
            }}
          >
            {generating ? '✨ Generating reimagination…' : '🎨 Generate Reimagination'}
          </button>

          <button
            onClick={onClose}
            disabled={generating}
            style={{
              padding: '12px 24px',
              backgroundColor: '#666',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 16,
              fontWeight: 'bold',
              cursor: generating ? 'not-allowed' : 'pointer'
            }}
          >
            Close
          </button>
        </div>

        {renderOptionGrid()}
      </div>
    </div>
  )
}

export default AIReimager

