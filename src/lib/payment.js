import { supabase } from './supabase.js'
import { prefsGet, prefsSet, prefsRemove } from './prefs.js'

const isNative = () => window?.Capacitor?.isNativePlatform?.() ?? false
const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID

// ── Load Razorpay Script ───────────────────────────────────────────
function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

// ── Start Razorpay Checkout ────────────────────────────────────────
export async function startCheckout(plan) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No active session')

  // Step 1 — Backend se order create karo
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan,
      supabaseUserId: user.id,
      email: user.email ?? null
    })
  })

  const { orderId, amount, currency, error } = await res.json()
  if (error) throw new Error(error)

  // Step 2 — Razorpay script load karo
  const loaded = await loadRazorpayScript()
  if (!loaded) throw new Error('Razorpay load nahi hua')

  await prefsSet('payment_pending', { plan, startedAt: Date.now() })

  // Step 3 — Checkout open karo
  return new Promise((resolve, reject) => {
    const options = {
      key: RAZORPAY_KEY_ID,
      amount,
      currency,
      order_id: orderId,
      name: 'ForgiveMe',
      description: plan === 'monthly' ? 'Monthly Plan' : 'Annual Plan',
      prefill: {
        email: user.email ?? ''
      },
      handler: async function (response) {
        // Payment success
        await prefsSet('payment_pending', { plan, startedAt: Date.now() })
        resolve(response)
      },
      modal: {
        ondismiss: async function () {
          await prefsRemove('payment_pending')
          reject(new Error('Payment cancelled'))
        }
      }
    }
    const rzp = new window.Razorpay(options)
    rzp.open()
  })
}

// ── Listen for payment return (Native only) ───────────────────────
export function listenForPaymentReturn(callbacks = {}) {
  if (!isNative()) return
  const { App } = window.Capacitor.Plugins

  App?.addListener('appStateChange', async ({ isActive }) => {
    if (!isActive) return
    const pending = await prefsGet('payment_pending')
    if (!pending) return
    const elapsed = Date.now() - pending.startedAt
    if (elapsed < 3000) return
    await checkPremiumStatus(callbacks)
  })
}

// ── Poll Supabase until premium confirmed ─────────────────────────
export async function checkPremiumStatus(callbacks = {}, retries = 5) {
  callbacks.onChecking?.()
  for (let i = 0; i < retries; i++) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_premium')
      .single()
    if (profile?.is_premium) {
      await prefsRemove('payment_pending')
      callbacks.onSuccess?.()
      return true
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  await prefsRemove('payment_pending')
  callbacks.onPending?.()
  return false
}