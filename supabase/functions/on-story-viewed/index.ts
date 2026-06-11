// supabase/functions/on-story-viewed/index.ts
// Triggered by Supabase DB webhook on stories UPDATE

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const FUNCTION_BASE = Deno.env.get('SUPABASE_URL')!
  .replace('supabase.co', 'functions.supabase.co') + '/functions/v1'

serve(async (req) => {
  const { record, old_record } = await req.json()

  if (!record || record.view_count <= (old_record?.view_count ?? 0)) {
    return new Response('No change', { status: 200 })
  }

  // Don't notify within 10s of creation (creator previewing their own story)
  const createdAt = new Date(record.created_at).getTime()
  if (Date.now() - createdAt < 10000) {
    return new Response('Too soon', { status: 200 })
  }

  const storyOwnerId = record.user_id
  if (!storyOwnerId) return new Response('No owner', { status: 200 })

  const viewCount = record.view_count
  const recipientName = record.recipient_name || 'your story'

  let title = '✦ Your story was opened'
  let body  = `${recipientName} opened your story`

  if (viewCount === 1) body = `${recipientName} just opened your story for the first time`
  else if (viewCount === 5) { title = '✦ Your story is resonating'; body = `${recipientName} has returned ${viewCount} times` }
  else if (viewCount === 10) { title = '✦ Your words are landing'; body = `${recipientName} has read your story ${viewCount} times` }

  await fetch(`${FUNCTION_BASE}/send-notification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('FUNCTION_SECRET')}`
    },
    body: JSON.stringify({
      userId: storyOwnerId,
      title, body,
      data: { type: 'story_viewed', slug: record.slug, viewCount: String(viewCount) }
    })
  })

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
})
