// supabase/functions/on-story-created/index.ts
// Triggered by Supabase DB webhook on stories INSERT

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const FUNCTION_BASE = Deno.env.get('SUPABASE_URL')!
  .replace('supabase.co', 'functions.supabase.co') + '/functions/v1'

serve(async (req) => {
  const { record } = await req.json()

  if (!record?.recipient_user_id) {
    return new Response('No recipient user ID — skipping', { status: 200 })
  }

  const senderName = record.sender_name || 'Someone special'

  await fetch(`${FUNCTION_BASE}/send-notification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('FUNCTION_SECRET')}`
    },
    body: JSON.stringify({
      userId: record.recipient_user_id,
      title: '✦ Someone wrote you something',
      body: `${senderName} created a story for you`,
      data: { type: 'story_created', slug: record.slug, senderName }
    })
  })

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
})
