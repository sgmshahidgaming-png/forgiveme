import Razorpay from 'razorpay'
import { createClient } from '@supabase/supabase-js'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
})

// Vercel env var can be either name — support both
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const AMOUNTS = {
  monthly: 14900,  // ₹149 in paise
  annual: 99900   // ₹999 in paise
}

const APP_URL = process.env.VITE_APP_URL || 'https://forgiveme.app'

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', APP_URL)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { plan, supabaseUserId, email } = req.body

  if (!AMOUNTS[plan]) {
    return res.status(400).json({ error: 'Invalid plan. Use "monthly" or "annual".' })
  }

  if (!supabaseUserId) {
    return res.status(400).json({ error: 'supabaseUserId is required' })
  }

  try {
    const order = await razorpay.orders.create({
      amount: AMOUNTS[plan],
      currency: 'INR',
      receipt: `receipt_${supabaseUserId}_${Date.now()}`,
      notes: {
        supabase_user_id: supabaseUserId,
        email: email ?? '',
        plan
      }
    })

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    })

  } catch (err) {
    console.error('Razorpay order error:', err)
    return res.status(500).json({ error: err.message })
  }
}