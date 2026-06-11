/**
 * Forgivemе — Supabase Client
 * Configured with session persistence for Capacitor (native app restarts).
 */
import { createClient } from '@supabase/supabase-js'
import { prefsGet, prefsSet, prefsRemove } from './prefs.js'

const isNative = () =>
  typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()

const capacitorStorage = {
  getItem: async (key) => {
    if (isNative()) return await prefsGet(key)
    return localStorage.getItem(key)
  },
  setItem: async (key, value) => {
    if (isNative()) return await prefsSet(key, value)
    localStorage.setItem(key, value)
  },
  removeItem: async (key) => {
    if (isNative()) return await prefsRemove(key)
    localStorage.removeItem(key)
  }
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fbonrxcgpvahabvvrgvb.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZib25yeGNncHZhaGFidnZyZ3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjI4MzIsImV4cCI6MjA5NDgzODgzMn0.WUgVMoOGJO61EQdwYTa_4IkwOp_ghWMZqveYs-kdUtM'

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: isNative() ? capacitorStorage : undefined,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    }
  }
)
