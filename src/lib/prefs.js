/**
 * Capacitor-aware key-value storage.
 * Uses @capacitor/preferences on device, localStorage in browser.
 */

const isNative = () =>
  typeof window !== 'undefined' && window.Capacitor?.isNativePlatform()

export async function prefsSet(key, value) {
  if (isNative()) {
    const { Preferences } = await import('@capacitor/preferences')
    await Preferences.set({ key, value: JSON.stringify(value) })
  } else {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

export async function prefsGet(key) {
  if (isNative()) {
    const { Preferences } = await import('@capacitor/preferences')
    const { value } = await Preferences.get({ key })
    return value ? JSON.parse(value) : null
  } else {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  }
}

export async function prefsRemove(key) {
  if (isNative()) {
    const { Preferences } = await import('@capacitor/preferences')
    await Preferences.remove({ key })
  } else {
    localStorage.removeItem(key)
  }
}
