import { supabase } from './supabase.js'
import { prefsGet, prefsSet, prefsRemove } from './prefs.js'

/**
 * Ensure a Supabase session exists.
 * On first run: signs in anonymously.
 * On subsequent runs: restores session from Capacitor Preferences.
 */
export async function ensureSession() {
  // Check for existing in-memory session
  const { data: { session } } = await supabase.auth.getSession()
  if (session) return session

  // Try to restore from device storage (critical for Capacitor — sessions
  // don't survive native app restarts without explicit persistence)
  const stored = await prefsGet('supabase_session')
  if (stored) {
    const { data, error } = await supabase.auth.setSession(stored)
    if (!error && data.session) return data.session
  }

  // First time — sign in anonymously (no email/password required)
  // Enable in: Supabase Dashboard → Authentication → Providers → Anonymous
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error

  await prefsSet('supabase_session', data.session)
  return data.session
}

/**
 * Keep session refreshed across the app lifecycle.
 * Call once in app root init.
 */
export function listenToAuthChanges() {
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      await prefsSet('supabase_session', session)
    }
    if (event === 'SIGNED_OUT') {
      await prefsRemove('supabase_session')
    }
  })
}
