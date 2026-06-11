import { supabase } from './supabase.js'
import { nanoid } from 'nanoid'
import { ensureSession } from './auth.js'

const FREE_LIMIT = 3

// ── Create a story ─────────────────────────────────────────────────
export async function createStoryFlow({ recipientName, senderName, message, tone, mediaUrls = [] }) {
  await ensureSession()

  // Server-side free use check
  const canCreate = await checkAndConsumeUse()
  if (!canCreate) return { success: false, reason: 'limit_reached' }

  const slug = nanoid(6)

  const { data, error } = await supabase
    .from('stories')
    .insert({
      slug,
      user_id: (await supabase.auth.getUser()).data.user.id,
      recipient_name: recipientName,
      sender_name: senderName,
      message,
      tone,
      media_urls: mediaUrls
    })
    .select()
    .single()

  if (error) throw error

  return {
    success: true,
    story: data,
    shareUrl: `${import.meta.env.VITE_APP_URL}/s/${slug}`
  }
}

// ── Fetch story by slug (public shared link) ───────────────────────
export async function getStoryBySlug(slug) {
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (error) throw error

  // Increment view count (fire and forget)
  supabase.from('stories')
    .update({ view_count: data.view_count + 1 })
    .eq('slug', slug)
    .then(() => {})

  return data
}

// ── Fetch all stories for current user ─────────────────────────────
export async function getUserStories() {
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

// ── Soft-delete a story ────────────────────────────────────────────
export async function deactivateStory(slug) {
  const { error } = await supabase
    .from('stories')
    .update({ is_active: false })
    .eq('slug', slug)

  if (error) throw error
}

// ── Get user profile ───────────────────────────────────────────────
export async function getProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

// ── Check and consume one free use ────────────────────────────────
async function checkAndConsumeUse() {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('is_premium, free_uses_count')
    .single()

  if (error || !profile) {
    // Profile doesn't exist yet — create it
    await supabase.from('profiles').insert({ free_uses_count: 0, is_premium: false })
    return true
  }

  if (profile.is_premium) return true
  if (profile.free_uses_count >= FREE_LIMIT) return false

  // Atomic increment via Postgres RPC (prevents race conditions)
  await supabase.rpc('increment_free_uses')
  return true
}
