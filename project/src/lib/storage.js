import { supabase } from './supabase.js'
import { nanoid } from 'nanoid'

const isNative = () => window?.Capacitor?.isNativePlatform?.() ?? false

// ── Pick a PHOTO ───────────────────────────────────────────────────
export async function pickPhoto() {
  if (isNative()) {
    return await pickPhotoNative()
  }
  return await pickFileWeb('image/*')
}

// ── Pick an AUDIO file ─────────────────────────────────────────────
export async function pickAudio() {
  // Camera plugin doesn't handle audio — use file input on both platforms
  return await pickFileWeb('audio/*')
}

// ── Native photo picker via Capacitor Camera plugin ────────────────
async function pickPhotoNative() {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
  const { Filesystem, Directory } = await import('@capacitor/filesystem')

  const photo = await Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Photos
  })

  const file = await Filesystem.readFile({
    path: photo.path,
    directory: Directory.Cache
  })

  const mimeType = photo.format === 'png' ? 'image/png' : 'image/jpeg'
  const blob = base64ToBlob(file.data, mimeType)
  return { blob, ext: photo.format || 'jpeg', mimeType }
}

// ── Web / Capacitor WebView file picker ────────────────────────────
function pickFileWeb(accept) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = (e) => {
      const file = e.target.files?.[0]
      if (!file) return reject(new Error('No file selected'))
      const ext = file.name.split('.').pop()
      resolve({ blob: file, ext, mimeType: file.type })
    }
    input.oncancel = () => reject(new Error('Cancelled'))
    input.click()
  })
}

// ── Upload blob to Supabase Storage ────────────────────────────────
export async function uploadToSupabase(blob, ext, type = 'photo') {
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? 'anon'

  const bucket = type === 'audio' ? 'story-audio' : 'story-photos'
  const path = `${userId}/${nanoid()}.${ext}`

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: blob.type, upsert: false })

  if (error) throw error

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

// ── Full pick + upload flow ────────────────────────────────────────
export async function pickAndUploadPhoto(onProgress) {
  onProgress?.('picking')
  const { blob, ext } = await pickPhoto()
  // Create local blob URL for immediate preview (works without network)
  const localUrl = URL.createObjectURL(blob)
  onProgress?.('uploading')
  const url = await uploadToSupabase(blob, ext, 'photo')
  onProgress?.('done')
  return { url, localUrl }
}

export async function pickAndUploadAudio(onProgress) {
  onProgress?.('picking')
  const { blob, ext } = await pickAudio()
  // Create local blob URL so audio plays immediately after story creation
  const localUrl = URL.createObjectURL(blob)
  onProgress?.('uploading')
  const url = await uploadToSupabase(blob, ext, 'audio')
  onProgress?.('done')
  return { url, localUrl }
}

// ── Helper ─────────────────────────────────────────────────────────
function base64ToBlob(base64, mimeType) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}
