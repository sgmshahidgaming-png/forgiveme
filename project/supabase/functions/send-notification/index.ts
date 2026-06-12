// send-notification Edge Function
// Supabase Dashboard → Edge Functions → Secrets mein add karo:
//   SUPABASE_URL = https://fbonrxcgpvahabvvrgvb.supabase.co
//   FCM_PROJECT_ID = apka firebase project id
//   FCM_SERVICE_ACCOUNT_JSON = apka service account json
//   FUNCTION_SECRET = apka random secret

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { userId, title, body, data } = await req.json()
  const recipientUserId = userId

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: tokens } = await supabase
    .from('device_tokens')
    .select('token, platform')
    .eq('user_id', recipientUserId)

  if (!tokens?.length) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
  }

  // FCM send karo
  const fcmProject = Deno.env.get('FCM_PROJECT_ID')
  const results = await Promise.allSettled(
    tokens.map(({ token }) =>
      fetch(`https://fcm.googleapis.com/v1/projects/${fcmProject}/messages:send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('FCM_ACCESS_TOKEN')}`,
        },
        body: JSON.stringify({
          message: { token, notification: { title, body }, data }
        })
      })
    )
  )

  const sent = results.filter(r => r.status === 'fulfilled').length
  return new Response(JSON.stringify({ sent }), { status: 200 })
})
