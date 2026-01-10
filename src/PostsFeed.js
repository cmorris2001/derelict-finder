// src/PostsFeed.js
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'

const EMOJIS = ['🏡', '🔥', '😍', '👏', '😮', '😂']

function PostsFeed({ user, onClose }) {
  const [posts, setPosts] = useState([])
  const [reactions, setReactions] = useState([]) // rows from post_reactions
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const postIds = useMemo(() => posts.map((p) => p.id), [posts])

  useEffect(() => {
    loadFeed()
    
  }, [])

  useEffect(() => {
    if (postIds.length) loadReactions(postIds)
    else setReactions([])
    
  }, [postIds.join(',')])

  const loadFeed = async () => {
    setLoading(true)
    setErr('')
    try {
      // Requires FKs to exist (we created them in SQL)
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id, caption, created_at,
          user_id,
          site_id,
          generation_id,
          profiles:profiles(username, avatar_url),
          derelict_sites:derelict_sites(id, name, photo_url),
          ai_generations:ai_generations(id, image_url, prompt, concept_type)
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setPosts(data || [])
    } catch (e) {
      console.error(e)
      setErr(e.message || 'Failed to load feed.')
    } finally {
      setLoading(false)
    }
  }

  const loadReactions = async (ids) => {
    try {
      const { data, error } = await supabase
        .from('post_reactions')
        .select('id, post_id, user_id, emoji')
        .in('post_id', ids)

      if (error) throw error
      setReactions(data || [])
    } catch (e) {
      console.error(e)
      // Don’t hard-fail feed if reactions fail
    }
  }

  const countsForPost = (postId) => {
    const rows = reactions.filter((r) => r.post_id === postId)
    const counts = {}
    rows.forEach((r) => {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1
    })
    return counts
  }

  const myReactionForPost = (postId) => {
    if (!user) return null
    return reactions.find((r) => r.post_id === postId && r.user_id === user.id) || null
  }

  const toggleReaction = async (postId, emoji) => {
    if (!user) {
      alert('Sign in to react.')
      return
    }

    const existing = myReactionForPost(postId)

    try {
      // If same emoji already selected => remove
      if (existing && existing.emoji === emoji) {
        const { error } = await supabase
          .from('post_reactions')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id)

        if (error) throw error

        setReactions((prev) => prev.filter((r) => !(r.post_id === postId && r.user_id === user.id)))
        return
      }

      // Otherwise upsert (unique constraint is post_id + user_id)
      const { data, error } = await supabase
        .from('post_reactions')
        .upsert(
          { post_id: postId, user_id: user.id, emoji },
          { onConflict: 'post_id,user_id' }
        )
        .select('id, post_id, user_id, emoji')
        .single()

      if (error) throw error

      setReactions((prev) => {
        const filtered = prev.filter((r) => !(r.post_id === postId && r.user_id === user.id))
        return [...filtered, data]
      })
    } catch (e) {
      console.error(e)
      alert(e.message || 'Failed to react.')
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          width: '100%',
          maxWidth: 980,
          borderRadius: 16,
          boxShadow: '0 6px 30px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: 14,
            borderBottom: '1px solid #eee',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0 }}>📰 Global feed</h2>
            <button
              onClick={loadFeed}
              style={{
                border: '1px solid #ddd',
                background: 'white',
                borderRadius: 10,
                padding: '6px 10px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Refresh
            </button>
          </div>

          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 26,
              cursor: 'pointer',
              color: '#888',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 14, overflow: 'auto' }}>
          {loading && <div style={{ padding: 20 }}>Loading…</div>}
          {err && (
            <div style={{ padding: 12, borderRadius: 12, background: '#ffebee', color: '#b00020' }}>
              {err}
            </div>
          )}

          {!loading && !err && posts.length === 0 && (
            <div style={{ padding: 20, color: '#666' }}>
              No posts yet — share an AI reimagination to kick it off.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {posts.map((p) => {
              const site = p.derelict_sites
              const gen = p.ai_generations
              const counts = countsForPost(p.id)
              const my = myReactionForPost(p.id)

              return (
                <div
                  key={p.id}
                  style={{
                    border: '1px solid #eee',
                    borderRadius: 16,
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>
                        @{p.profiles?.username || 'anonymous'} ·{' '}
                        <span style={{ fontWeight: 'normal', color: '#666', fontSize: 12 }}>
                          {new Date(p.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ color: '#444', marginTop: 4 }}>
                        <strong>{site?.name || 'Site'}</strong>
                        {gen?.concept_type ? ` · ${gen.concept_type}` : ''}
                      </div>
                      {p.caption && <div style={{ marginTop: 6, color: '#555' }}>{p.caption}</div>}
                    </div>
                  </div>

                  {/* Images: side-by-side on desktop, stacked on mobile */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: 0,
                      borderTop: '1px solid #eee',
                      borderBottom: '1px solid #eee',
                    }}
                  >
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 8px', borderRadius: 999, fontSize: 12 }}>
                        Original
                      </div>
                      {site?.photo_url ? (
                        <img
                          src={site.photo_url}
                          alt="Original site"
                          style={{ width: '100%', height: 280, objectFit: 'cover', display: 'block' }}
                        />
                      ) : (
                        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#777' }}>
                          No original photo
                        </div>
                      )}
                    </div>

                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 8px', borderRadius: 999, fontSize: 12 }}>
                        AI concept
                      </div>
                      {gen?.image_url ? (
                        <img
                          src={gen.image_url}
                          alt="AI reimagination"
                          style={{ width: '100%', height: 280, objectFit: 'cover', display: 'block' }}
                        />
                      ) : (
                        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#777' }}>
                          No AI image
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reaction bar */}
                  <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {EMOJIS.map((e) => {
                      const c = counts[e] || 0
                      const selected = my?.emoji === e
                      return (
                        <button
                          key={e}
                          onClick={() => toggleReaction(p.id, e)}
                          style={{
                            border: selected ? '2px solid #1a73e8' : '1px solid #ddd',
                            background: selected ? '#e3f2fd' : 'white',
                            borderRadius: 999,
                            padding: '6px 10px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span style={{ fontSize: 18 }}>{e}</span>
                          <span style={{ fontSize: 13, color: '#444' }}>{c}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PostsFeed
