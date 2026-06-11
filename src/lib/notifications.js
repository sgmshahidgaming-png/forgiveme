import { supabase } from './supabase.js'
import { prefsGet, prefsSet } from './prefs.js'

const isNative = () => window?.Capacitor?.isNativePlatform?.() ?? false

// ── Initialize push notifications (call after session is ready) ───
export async function initPushNotifications() {
  if (!isNative()) return

  const { PushNotifications } = await import('@capacitor/push-notifications')

  const { receive } = await PushNotifications.checkPermissions()
  let finalStatus = receive

  if (receive === 'prompt' || receive === 'prompt-with-rationale') {
    const { receive: requested } = await PushNotifications.requestPermissions()
    finalStatus = requested
  }

  if (finalStatus !== 'granted') {
    console.log('Push permission denied')
    return
  }

  await PushNotifications.register()
  setupListeners(PushNotifications)
}

// ── Event listeners ────────────────────────────────────────────────
function setupListeners(PushNotifications) {
  PushNotifications.addListener('registration', async (token) => {
    await saveTokenToSupabase(token.value)
  })

  PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration failed:', err.error)
  })

  // App in foreground — show in-app toast
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    window.__showToast?.(`${notification.title}: ${notification.body}`)
  })

  // User tapped a notification
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    handleNotificationTap(action.notification.data)
  })
}

// ── Save FCM/APNs token to Supabase ───────────────────────────────
async function saveTokenToSupabase(token) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const platform = window.Capacitor.getPlatform()  // 'ios' | 'android'

  const { error } = await supabase
    .from('device_tokens')
    .upsert(
      { user_id: user.id, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,platform' }
    )

  if (error) console.error('Failed to save push token:', error)
  else await prefsSet('push_token', token)
}

// ── Handle notification tap → navigate ────────────────────────────
function handleNotificationTap(data) {
  if (!data) return

  if (data.type === 'story_viewed' && data.slug) {
    window.__goScene?.(2)
  }

  if (data.type === 'story_created' && data.slug) {
    window.__loadStory?.(data.slug)
  }
}

// ── Watch for token refresh ────────────────────────────────────────
export async function watchTokenRefresh() {
  if (!isNative()) return

  const { PushNotifications } = await import('@capacitor/push-notifications')

  PushNotifications.addListener('registration', async (token) => {
    const saved = await prefsGet('push_token')
    if (saved !== token.value) {
      await prefsSet('push_token', token.value)
      await saveTokenToSupabase(token.value)
    }
  })
}
