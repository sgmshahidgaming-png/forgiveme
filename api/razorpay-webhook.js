import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function updatePremium(supabaseUserId, plan) {
  // Premium expiry calculate karo
  const now = new Date()
  const expiresAt = plan === 'annual'
    ? new Date(now.setFullYear(now.getFullYear() + 1))
    : new Date(now.setMonth(now.getMonth() + 1))

  const { error } = await supabase
    .from('profiles')
    .update({
      is_premium: true,
      premium_expires_at: expiresAt.toISOString()
    })
    .eq('id', supabaseUserId)

  if (error) console.error('Supabase update error:', error)
  else console.log('Premium updated for user:', supabaseUserId)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await getRawBody(req)
  const signature = req.headers['x-razorpay-signature']

  // Signature verify karo
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')

  if (expectedSignature !== signature) {
    console.error('Invalid Razorpay webhook signature')
    return res.status(400).json({ error: 'Invalid signature' })
  }

  const event = JSON.parse(rawBody.toString())
  console.log('Razorpay event:', event.event)

  if (event.event === 'payment.captured') {
    const payment = event.payload.payment.entity
    const supabaseUserId = payment.notes?.supabase_user_id
    const plan = payment.notes?.plan

    if (!supabaseUserId) {
      console.error('No supabase_user_id in payment notes')
      return res.status(200).json({ received: true })
    }

    await updatePremium(supabaseUserId, plan)
  }

  return res.status(200).json({ received: true })
}