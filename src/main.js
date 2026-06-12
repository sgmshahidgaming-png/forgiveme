/**
 * Forgivemе — Main Application Entry Point
 * Wires together: Supabase auth, story creation, media uploads,
 * payment flow, push notifications, cinematic scene navigation,
 * and AI-powered story generation.
 */

import { supabase } from './lib/supabase.js'
import { ensureSession, listenToAuthChanges } from './lib/auth.js'
import { pickAndUploadPhoto, pickAndUploadAudio } from './lib/storage.js'
import { createStoryFlow, getStoryBySlug, getProfile } from './lib/stories.js'
import { startCheckout, listenForPaymentReturn, checkPremiumStatus } from './lib/payment.js'
import { initPushNotifications, watchTokenRefresh } from './lib/notifications.js'
// AI generation is now handled directly via Anthropic API in handleAIGenerate

// ─── STATE ─────────────────────────────────────────────────────────
let currentScene = 0
let selectedTone = 'tender'
let selectedPlan = 'annual'
let uploadedMediaUrls = []
let currentShareUrl = ''
let isGeneratingAI = false

const ADMIN_PASSWORD = 'forgive2026shahid'  // change this in production!

const DEFAULT_MESSAGES = {
  tender: `I've been carrying this with me for too long, afraid that words could never reach what I actually feel. But here, in this quiet space, I want you to know — I'm sorry. Not because I have to be, but because you matter to me in a way that makes my silence feel like a wound I've been inflicting on us both.`,
  passionate: `There's a fire in my chest that won't go out — it's all the things I never said to you. Every moment I held back felt like a small betrayal of what we could be. I'm done holding back. I'm sorry. I miss you. I want us.`,
  remorseful: `I sit with the weight of what I did, and I don't want to minimize it or explain it away. I hurt you. I was wrong. I'm truly, deeply sorry — and I understand if these words feel small compared to what happened.`,
  hopeful: `I believe in us. I believe in what we've built and what we can still become. This apology isn't an ending — it's a door I'm holding open, hoping you'll walk through it with me again. I'm sorry, and I'm still here.`,
  poetic: `Forgiveness is a country I've been traveling toward with bare feet and no map. You are its language, its landscape, its light. I was wrong, and I am sorry — in ways that predate words, in the marrow-deep way of things that matter most.`,
  raw: "I don't have beautiful words right now. I just have this: I messed up. I know it. And it's eating me alive. I'm sorry. That's it. That's all I have and I mean every single letter of it."
}

// ─── INIT ──────────────────────────────────────────────────────────
async function init() {
  window.__showToast = showToast
  window.__goScene = goScene

  initCanvas()

  listenToAuthChanges()
  try {
    await ensureSession()
    await refreshUseCounter()
  } catch (err) {
    console.warn('Auth init failed (offline?):', err.message)
  }

  listenForPaymentReturn({
    onChecking: () => showPaymentLoader(true),
    onSuccess: () => { showPaymentLoader(false); onPremiumActivated() },
    onPending: () => { showPaymentLoader(false); showToast('✦ Payment received — premium activates shortly') },
    onCancel: () => showToast('Payment cancelled — you can try again anytime')
  })

  try {
    await initPushNotifications()
    await watchTokenRefresh()
  } catch (err) {
    console.warn('Push init skipped (web or denied):', err.message)
  }

  // Tone button listeners
  document.querySelectorAll('.tone-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tone-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      selectedTone = btn.dataset.tone
    })
  })

  // AI generate button
  const aiBtn = document.getElementById('ai-generate-btn')
  if (aiBtn) {
    aiBtn.addEventListener('click', handleAIGenerate)
  }

  // Character counter for message
  const msgArea = document.getElementById('f-msg')
  const charCount = document.getElementById('char-count')
  if (msgArea && charCount) {
    msgArea.addEventListener('input', () => {
      const len = msgArea.value.length
      charCount.textContent = `${len} chars`
      charCount.style.color = len > 1000 ? 'rgba(212,92,92,.7)' : 'var(--muted)'
    })
  }

  initSwipe()

  // Deep link: if URL contains /s/, load shared story
  const slug = window.location.pathname.match(/\/s\/([^/]+)/)?.[1]
  if (slug) loadSharedStory(slug)
}

// ─── SCENE NAVIGATION ──────────────────────────────────────────────
window.goScene = function goScene(idx) {
  const scenes = document.querySelectorAll('.scene')
  const navBtns = document.querySelectorAll('nav button')

  scenes[currentScene].classList.add('exit-up')
  const prevScene = currentScene
  currentScene = idx

  setTimeout(() => {
    scenes[prevScene].classList.add('hidden')
    scenes[prevScene].classList.remove('exit-up')
    scenes[idx].classList.remove('hidden', 'exit-up')
    navBtns.forEach((b, i) => b.classList.toggle('active', i === idx))
  }, 350)
}

// ─── SWIPE NAVIGATION ──────────────────────────────────────────────
function initSwipe() {
  let startX = 0, startY = 0
  document.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
  })
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX
    const dy = e.changedTouches[0].clientY - startY
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      if (dx < 0 && currentScene < 5) goScene(currentScene + 1)
      if (dx > 0 && currentScene > 0) goScene(currentScene - 1)
    }
  })
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' && currentScene < 5) goScene(currentScene + 1)
    if (e.key === 'ArrowLeft' && currentScene > 0) goScene(currentScene - 1)
  })
}

// ─── AI GENERATION ──────────────────────────────────────────────────
window.handleAIGenerate = async function handleAIGenerate() {
  if (isGeneratingAI) return
  isGeneratingAI = true

  const btn = document.getElementById('ai-generate-btn')
  const recipientName = document.getElementById('f-to').value.trim()
  const senderName = document.getElementById('f-from').value.trim()
  const context = document.getElementById('f-context')?.value?.trim() || ''
  const lang = window.currentLang || localStorage.getItem('lang') || 'hi'

  if (btn) {
    btn.textContent = lang === 'hi' ? '✦ AI likh raha hai…' : '✦ AI is writing…'
    btn.disabled = true
    btn.classList.add('generating')
  }

  try {
    const res = await fetch('/api/ai-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientName: recipientName || (lang === 'hi' ? 'aap' : 'them'),
        senderName: senderName || (lang === 'hi' ? 'main' : 'me'),
        tone: selectedTone,
        context,
        lang
      })
    })

    const data = await res.json()
    const story = data.message || data.fallback

    if (story) {
      const msgArea = document.getElementById('f-msg')
      if (msgArea) {
        msgArea.value = ''
        msgArea.disabled = false
        // Typewriter effect
        let i = 0
        const chars = story.split('')
        function typeNext() {
          if (i < chars.length) {
            msgArea.value += chars[i++]
            const cc = document.getElementById('char-count')
            if (cc) cc.textContent = `${msgArea.value.length} chars`
            setTimeout(typeNext, Math.random() * 8 + 2)
          }
        }
        typeNext()
      }
      showToast(lang === 'hi' ? '✦ AI ne aapki kahani likhi' : '✦ Your story has been written by AI')
    } else {
      throw new Error('Empty response')
    }
  } catch (err) {
    // Fallback to curated message
    const msgArea = document.getElementById('f-msg')
    if (msgArea) {
      const fallbacks = {
        hi: {
          tender: 'Tumse kuch kehna tha jo dil mein bahut gehra tha. Maafi chahta hoon un sab lamhon ke liye jab tumhe akela feel karaya. Tum mere liye bahut khaas ho.',
          passionate: 'Main tumhe bhool nahi sakta. Har jagah tumhari yaad aati hai. Galat hua mujhse, poori tarah se. Main abhi bhi yahan hoon.',
          remorseful: 'Jo kiya woh galat tha. Koi bahana nahi, koi safai nahi. Sirf yeh ki maafi chahta hoon dil ki gehraai se.',
          hopeful: 'Mujhe yakeen hai hum phir se theek ho sakte hain. Ek mauka do, main sabit kar dunga.',
          poetic: 'Tumhara naam mere dil mein ek dard ki tarah rehta hai jo yaad dilaata hai kya khoya. Maafi chahta hoon.',
          raw: 'Galat kiya. Jaanta hoon. Maafi chahta hoon. Bas itna.'
        },
        en: {
          tender: "There's something I've been carrying — words meant for you that kept dissolving before I could speak them. I'm sorry for every moment my silence made you feel alone.",
          passionate: "I can't stop thinking about what I did. You deserved better, and I know that now in a way that won't let me sleep.",
          remorseful: "I was wrong. No excuses, no context. Just: I hurt you, I knew it, and I'm deeply sorry.",
          hopeful: "I believe we can find our way back. I'm sorry for the distance I created. I'm holding the door open.",
          poetic: "Your name lives in me like a bruise I keep pressing — not to hurt, but to remember what I'm missing. I'm sorry.",
          raw: "Messed up. Know it. Sorry. That's the whole thing."
        }
      }
      msgArea.value = fallbacks[lang]?.[selectedTone] || fallbacks['hi'].tender
      msgArea.dispatchEvent(new Event('input'))
    }
    showToast(lang === 'hi' ? '✦ AI ne kahani likhi (offline mode)' : '✦ Story generated (offline mode)')
  } finally {
    isGeneratingAI = false
    if (btn) {
      btn.textContent = lang === 'hi' ? '✦ AI Se Likhwao' : '✦ AI Write For Me'
      btn.disabled = false
      btn.classList.remove('generating')
    }
  }
}



// ─── CHIP UPLOAD ───────────────────────────────────────────────────
window.handleChipUpload = async function handleChipUpload(type) {
  const chip = document.querySelector(`[data-type="${type}"]`)
  chip.textContent = '⏳ Uploading…'
  chip.disabled = true

  try {
    let url
    if (type === 'photo') {
      url = await pickAndUploadPhoto(stage => {
        chip.textContent = stage === 'picking' ? '📷 Selecting…' : '☁️ Uploading…'
      })
    } else {
      url = await pickAndUploadAudio(stage => {
        chip.textContent = stage === 'picking' ? '🎵 Selecting…' : '☁️ Uploading…'
      })
    }

    uploadedMediaUrls.push({ type, url })
    chip.textContent = `✓ ${type.charAt(0).toUpperCase() + type.slice(1)} added`
    chip.style.borderColor = 'rgba(212,168,92,.4)'
    chip.style.color = 'var(--gold)'

    if (type === 'photo') {
      const img = document.createElement('img')
      img.src = url
      img.style.cssText = 'width:100%;border-radius:12px;margin-top:10px;max-height:200px;object-fit:cover'
      document.getElementById('memory-tape').appendChild(img)
    }

    if (type === 'music' || type === 'voice') {
      const wrap = document.createElement('div')
      wrap.className = 'audio-player-chip'
      wrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px 12px;background:rgba(255,255,255,.05);border-radius:12px;border:1px solid rgba(212,168,92,.3)'
      wrap.innerHTML = `<span style="font-size:1rem">${type === 'music' ? '🎵' : '🎙'}</span><audio controls src="${url}" style="height:28px;flex:1;accent-color:var(--gold)"></audio>`
      document.getElementById('memory-tape').appendChild(wrap)
    }

    showToast(`✦ ${type} uploaded successfully`)
  } catch (err) {
    if (err.message === 'Cancelled') {
      chip.textContent = { photo: '📷 Photo', voice: '🎙 Voice', music: '🎵 Music' }[type]
      chip.disabled = false
      return
    }
    chip.textContent = '✗ Failed — retry'
    chip.disabled = false
    showToast('Upload failed: ' + (err.message || 'Unknown error'))
  }
}

// ─── CREATE STORY ──────────────────────────────────────────────────
window.handleCreate = async function handleCreate() {
  const btn = document.getElementById('create-btn')
  btn.textContent = '⏳ Creating…'
  btn.disabled = true

  const recipientName = document.getElementById('f-to').value.trim() || 'Someone Special'
  const senderName = document.getElementById('f-from').value.trim() || 'With all my love'
  const message = document.getElementById('f-msg').value.trim() || DEFAULT_MESSAGES[selectedTone]

  try {
    const result = await createStoryFlow({
      recipientName, senderName, message,
      tone: selectedTone,
      mediaUrls: uploadedMediaUrls
    })

    if (!result.success && result.reason === 'limit_reached') {
      // Admin ko limit nahi lagti
      if (window._adminUnlocked) {
        // ignore limit, continue below
      } else {
        goScene(3)
        showToast('✦ Your free stories are used — upgrade to continue')
        return
      }
    }

    document.getElementById('prev-to').textContent = recipientName
    document.getElementById('prev-from').textContent = senderName
    document.getElementById('prev-body').textContent = message
    document.getElementById('share-link').textContent = result.shareUrl
    currentShareUrl = result.shareUrl

    // Media preview in story card
    const tape = document.getElementById('memory-tape')
    tape.innerHTML = ''
    uploadedMediaUrls.forEach(({ type, url }) => {
      if (type === 'photo') {
        const img = document.createElement('img')
        img.src = url
        img.style.cssText = 'width:100%;border-radius:12px;margin-top:10px;max-height:220px;object-fit:cover'
        tape.appendChild(img)
      } else if (type === 'music' || type === 'voice') {
        const wrap = document.createElement('div')
        wrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:10px;padding:8px 12px;background:rgba(255,255,255,.05);border-radius:12px;border:1px solid rgba(212,168,92,.3)'
        wrap.innerHTML = `<span style="font-size:1.1rem">${type === 'music' ? '🎵' : '🎙'}</span><audio controls src="${url}" style="height:32px;flex:1;accent-color:var(--gold)"></audio>`
        tape.appendChild(wrap)
      }
    })

    await refreshUseCounter()
    goScene(2)
    showToast('✦ Your story is ready to share')
  } catch (err) {
    showToast('Something went wrong: ' + err.message)
  } finally {
    btn.textContent = '✦ Create & Preview Story'
    btn.disabled = false
  }
}

// ─── SHARE ─────────────────────────────────────────────────────────
window.handleShare = async function handleShare() {
  const url = currentShareUrl || document.getElementById('share-link').textContent

  if (window?.Capacitor?.isNativePlatform()) {
    const { Share } = await import('@capacitor/share')
    await Share.share({
      title: 'A letter for you',
      text: 'Someone wrote you something beautiful.',
      url,
      dialogTitle: 'Share your story'
    })
  } else if (navigator.share) {
    await navigator.share({ title: 'A letter for you', url })
  } else {
    await handleCopyLink()
  }
}

window.handleCopyLink = async function handleCopyLink() {
  const url = currentShareUrl || document.getElementById('share-link').textContent
  const display = document.getElementById('share-link-display')

  await navigator.clipboard.writeText(url)
  display.style.display = 'block'
  showToast('✦ Link copied to clipboard')
}

// ─── PREMIUM ────────────────────────────────────────────────────────
window.selectPlan = function selectPlan(plan) {
  selectedPlan = plan
  document.querySelectorAll('.plan-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.plan === plan)
  })
}

window.handleUnlock = async function handleUnlock(plan) {
  const btn = document.querySelector(`#card-${plan} .btn-unlock`)
  btn.textContent = 'Opening Checkout…'
  btn.disabled = true

  try {
    await startCheckout(plan)
  } catch (err) {
    showToast('Could not open checkout: ' + err.message)
    btn.textContent = plan === 'monthly' ? 'Unlock Monthly' : 'Unlock Annual'
    btn.disabled = false
  }
}

function onPremiumActivated() {
  document.getElementById('remaining-display').textContent = '∞'
  document.getElementById('use-count').textContent = 'Premium — unlimited'
  document.getElementById('pbar-fill').style.width = '100%'
  showToast('✦ Premium activated — create without limits')
  goScene(1)
}

// ─── USE COUNTER ───────────────────────────────────────────────────
async function refreshUseCounter() {
  try {
    const profile = await getProfile()
    if (!profile) return

    const isPremium = profile.is_premium
    const used = profile.free_uses_count ?? 0
    const rem = isPremium ? '∞' : Math.max(0, 3 - used)

    document.getElementById('remaining-display').textContent = String(rem)
    document.getElementById('use-count').textContent = isPremium
      ? 'Premium — unlimited'
      : `${used} / 3 used`
    document.getElementById('pbar-fill').style.width = isPremium
      ? '100%'
      : `${(used / 3) * 100}%`
  } catch { /* offline — silently skip */ }
}

// ─── ADMIN ──────────────────────────────────────────────────────────
window.checkAdmin = function checkAdmin() {
  const pass = document.getElementById('admin-pass').value
  if (pass === ADMIN_PASSWORD) {
    window._adminUnlocked = true
    window._adminIsPremium = true  // admin = full premium access
    document.getElementById('admin-lock').style.display = 'none'
    document.getElementById('admin-panel').classList.add('visible')
    adminLog('✦ Logged in as admin — full access granted')
    adminLoadRecentStories()
    adminLoadStats()

    // Unlock counter display
    try {
      const rd = document.getElementById('remaining-display')
      if (rd) rd.textContent = '∞'
      const uc = document.getElementById('use-count')
      if (uc) uc.textContent = 'Admin — unlimited'
      const pb = document.getElementById('pbar-fill')
      if (pb) pb.style.width = '100%'
    } catch { }

    // Unlock download button
    updateDownloadBtn(true)

    // Unlock cards immediately
    const lock = document.getElementById('cards-lock')
    if (lock) lock.classList.add('hidden')
    renderCardsForAdmin()

    showToast('✦ Admin access — all features unlocked')
  } else {
    showToast('Incorrect password')
  }
}

window.adminGrant = async function adminGrant() {
  const userId = document.getElementById('admin-user-id').value.trim()
  if (!userId) return showToast('Enter a user ID')

  const { error } = await supabase
    .from('profiles')
    .update({ is_premium: true })
    .eq('id', userId)

  if (error) return showToast('Error: ' + error.message)
  adminLog(`✦ Granted premium → ${userId.slice(0, 8)}…`)
  showToast('✦ Premium granted')
}

window.adminRevoke = async function adminRevoke() {
  const userId = document.getElementById('admin-revoke-id').value.trim()
  if (!userId) return showToast('Enter a user ID')

  const { error } = await supabase
    .from('profiles')
    .update({ is_premium: false })
    .eq('id', userId)

  if (error) return showToast('Error: ' + error.message)
  adminLog(`✗ Revoked premium → ${userId.slice(0, 8)}…`)
  showToast('Premium revoked')
}

window.adminDeactivateStory = async function adminDeactivateStory(slug) {
  const { error } = await supabase
    .from('stories')
    .update({ is_active: false })
    .eq('slug', slug)

  if (error) return showToast('Error: ' + error.message)
  adminLog(`✗ Deactivated story: ${slug}`)
  showToast('Story deactivated')
  adminLoadRecentStories()
  adminLoadStats()
}

async function adminLoadRecentStories() {
  const container = document.getElementById('admin-stories')
  if (!container) return

  try {
    const { data, error } = await supabase
      .from('stories')
      .select('slug, recipient_name, sender_name, tone, view_count, created_at, is_active')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error

    container.innerHTML = data.length === 0
      ? '<div style="color:var(--muted);font-size:.6rem">No stories yet.</div>'
      : data.map(s => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">
          <div style="flex:1;min-width:0">
            <div style="font-size:.65rem;color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${esc(s.recipient_name || '—')} ← ${esc(s.sender_name || '—')}
            </div>
            <div style="font-size:.55rem;color:var(--muted)">
              ${s.tone} · ${s.view_count} views · ${new Date(s.created_at).toLocaleDateString()}
              ${!s.is_active ? ' · <span style="color:rgba(212,92,92,.8)">inactive</span>' : ''}
            </div>
          </div>
          ${s.is_active ? `<button onclick="adminDeactivateStory('${s.slug}')"
            style="background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.2);color:rgba(255,140,140,.8);
            font-family:var(--ff-sans);font-size:.5rem;letter-spacing:.1em;padding:4px 10px;border-radius:6px;cursor:pointer">
            Remove
          </button>` : ''}
        </div>
      `).join('')
  } catch (err) {
    container.innerHTML = `<div style="color:rgba(255,80,80,.7);font-size:.6rem">Error: ${err.message}</div>`
  }
}

async function adminLoadStats() {
  const container = document.getElementById('admin-stats')
  if (!container) return

  try {
    const [
      { count: totalStories },
      { count: activeStories },
      { count: premiumUsers }
    ] = await Promise.all([
      supabase.from('stories').select('*', { count: 'exact', head: true }),
      supabase.from('stories').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_premium', true)
    ])

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        ${adminStat('Total Stories', totalStories)}
        ${adminStat('Active', activeStories)}
        ${adminStat('Premium Users', premiumUsers)}
      </div>
    `
  } catch (err) {
    container.innerHTML = `<div style="color:rgba(255,80,80,.7);font-size:.6rem">Stats error: ${err.message}</div>`
  }
}

function adminStat(label, value) {
  return `
    <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:10px;text-align:center">
      <div style="font-family:var(--ff-display);font-size:1.4rem;font-style:italic;color:var(--gold)">${value ?? '—'}</div>
      <div style="font-size:.5rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:2px">${label}</div>
    </div>
  `
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function adminLog(msg) {
  const log = document.getElementById('admin-log')
  const time = new Date().toLocaleTimeString()
  log.textContent = `[${time}] ${msg}\n` + log.textContent
}

// Admin cards unlock helper
function renderCardsForAdmin() {
  const lock = document.getElementById('cards-lock')
  if (lock) lock.classList.add('hidden')
  if (typeof renderCards === 'function') renderCards()
}

// ─── SHARED STORY VIEWER ───────────────────────────────────────────
window.__loadStory = async function loadSharedStory(slug) {
  try {
    const story = await getStoryBySlug(slug)
    document.getElementById('prev-to').textContent = story.recipient_name
    document.getElementById('prev-from').textContent = story.sender_name
    document.getElementById('prev-body').textContent = story.message

    const tape = document.getElementById('memory-tape')
    if (Array.isArray(story.media_urls)) {
      story.media_urls.forEach(({ type, url }) => {
        if (type === 'photo') {
          const img = document.createElement('img')
          img.src = url
          tape.appendChild(img)
        }
      })
    }

    goScene(2)
  } catch (err) {
    console.error('Could not load story:', err)
    showToast('This story may have been removed')
  }
}

// ─── TOAST ──────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 3200)
}
window.__showToast = showToast

// ─── PAYMENT LOADER ─────────────────────────────────────────────────
function showPaymentLoader(visible) {
  let loader = document.getElementById('payment-loader')
  if (!loader) {
    loader = document.createElement('div')
    loader.id = 'payment-loader'
    loader.style.cssText = `
      position:fixed;inset:0;z-index:999;
      background:rgba(13,8,8,.95);backdrop-filter:blur(30px);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      font-family:'Josefin Sans',sans-serif;color:var(--gold);
      letter-spacing:.3em;font-size:.6rem;text-transform:uppercase;gap:1.5rem;
      transition:opacity .4s
    `
    loader.innerHTML = `
      <div style="width:36px;height:36px;border:1px solid rgba(212,168,92,.3);
        border-top-color:var(--gold);border-radius:50%;animation:spin 1s linear infinite"></div>
      <span>Confirming your payment…</span>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `
    document.body.appendChild(loader)
  }
  loader.style.opacity = visible ? '1' : '0'
  loader.style.pointerEvents = visible ? 'all' : 'none'
}

// ─── STARFIELD CANVAS ───────────────────────────────────────────────
function initCanvas() {
  const canvas = document.getElementById('bg-canvas')
  const ctx = canvas.getContext('2d')
  let W, H, stars = []

  function resize() {
    W = canvas.width = window.innerWidth
    H = canvas.height = window.innerHeight
    stars = Array.from({ length: 140 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.2 + .2,
      a: Math.random(),
      s: Math.random() * .004 + .001
    }))
  }

  function draw() {
    ctx.clearRect(0, 0, W, H)
    stars.forEach(s => {
      s.a += s.s
      if (s.a > 1 || s.a < 0) s.s *= -1
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(250,246,240,${s.a * .6})`
      ctx.fill()
    })
    requestAnimationFrame(draw)
  }

  window.addEventListener('resize', resize)
  resize()
  draw()
}


// ─── DOWNLOAD STORY ─────────────────────────────────────────────────
window.handleDownload = async function handleDownload() {
  try {
    const profile = await getProfile()
    if (!profile?.is_premium) {
      goScene(3)
      showToast('✦ Download is a premium feature — upgrade to unlock')
      return
    }

    const to = document.getElementById('prev-to').textContent
    const from = document.getElementById('prev-from').textContent
    const body = document.getElementById('prev-body').textContent

    const content = `TO: ${to}
FROM: ${from}

${body}`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `forgiveme-${to.replace(/\s+/g, '-').toLowerCase()}.txt`
    a.click()
    URL.revokeObjectURL(url)
    showToast('✦ Story downloaded!')
  } catch (err) {
    showToast('Download failed: ' + err.message)
  }
}

function updateDownloadBtn(isPremium) {
  const unlocked = document.getElementById('download-btn-wrap')
  const locked = document.getElementById('download-locked-wrap')
  if (!unlocked || !locked) return
  unlocked.style.display = isPremium ? 'block' : 'none'
  locked.style.display = isPremium ? 'none' : 'block'
}
// ─── BOOT ───────────────────────────────────────────────────────────
init()

// ══════════════════════════════════════════════════════════════════
// ─── APOLOGY CARDS — 100 Premium Cards ───────────────────────────
// ══════════════════════════════════════════════════════════════════

const APOLOGY_CARDS = [
  // TENDER (17 cards)
  { id: 1, tone: 'tender', title: 'The Weight of Silence', title_hi: 'Khamoshi Ka Bojh', body: `I've been sitting with so many things I should have said to you — words that kept dissolving before I could speak them. This isn't about excuses. This is me, finally, holding open the door I kept closing. I'm sorry for every moment my silence made you feel alone when I was standing right there.`, body_hi: `Main bahut kuch bol deta jo bol nahi paya — baatein jo zuban tak aate aate bikhar jaati thin. Yeh bahane nahi hain. Yeh main hoon, aakhirkar, woh darwaza khola jo main band karta raha. Maafi chahta hoon har us pal ke liye jab meri khamoshi ne tumhe akela feel karaya, jabke main wahin khada tha.` },
  { id: 2, tone: 'tender', title: 'Soft and Certain', title_hi: 'Dheema aur Pakka', body: `There are apologies that arrive like thunder, and there are ones like this — quiet, steady, certain. I was wrong. Not in the way that asks for your immediate forgiveness, but in the way that asks for the chance to be better. I'll wait as long as that takes. You're worth the patience.`, body_hi: `Kuch maafiyaan bijli ki tarah aati hain, aur kuch isi tarah — dheemi, sthir, pakki. Main galat tha. Iss tarah nahi jo turant maafi maange, balki iss tarah jo behtar banne ka mauka maange. Jitna waqt lage, main ruka rahunga. Tum is sabr ke laayak ho.` },
  { id: 3, tone: 'tender', title: 'All the Small Things', title_hi: 'Saari Choti Baatein', body: `It wasn't one big thing. It was the small absences — the times I looked at my phone when you were talking, the sighs that said everything I shouldn't have, the way I made you feel smaller to make room for my own noise. I'm sorry for all of it. Every quiet wound.`, body_hi: `Koi ek bada masla nahi tha. Woh choti choti kamiyan thin — jab tum bol rahe the aur main phone dekh raha tha, woh thande saansen jo sab kuch keh deti thin jo nahi kehna chahiye tha, jis tarah maine tumhe chota feel karaya apni awaaz ke liye jagah banane ko. Maafi chahta hoon sab ke liye. Har khamosh zakhm ke liye.` },
  { id: 4, tone: 'tender', title: 'I Came Back', title_hi: 'Main Wapas Aaya', body: `I don't have flowers or speeches. I just have this: I thought about everything, and I came back. Not because it's easy, but because you matter more than my pride, more than my fear, more than the version of myself that doesn't know how to say I'm sorry.`, body_hi: `Mere paas phool ya taqreerin nahi hain. Bas yeh hai: maine sab soch liya, aur main wapas aaya. Isliye nahi ki aasaan hai, balki isliye ki tum mere guroor se zyada, mere dar se zyada, us wale mujhse zyada matter karte ho jo maafi maangna nahi jaanta.` },
  { id: 5, tone: 'tender', title: 'Your Name in My Chest', title_hi: 'Tum Mere Seene Mein', body: `Your name has been living in my chest like a bruise I keep pressing — not to hurt myself, but to remember what I'm missing. I miss you. I was wrong. And I'm learning, slowly, how to be someone who says that before it's too late.`, body_hi: `Tumhara naam mere seene mein ek chot ki tarah bas gaya hai jise main baar baar chhoota rehta hoon — khud ko dard dene ke liye nahi, balki yaad karne ke liye ki kya kho raha hoon. Tumhari yaad aati hai. Main galat tha. Aur dheere dheere seekh raha hoon koi aise banna jo yeh waqt par bol sake.` },
  { id: 6, tone: 'tender', title: 'The Quiet After', title_hi: 'Baad Wali Khamoshi', body: `In the quiet after everything, I keep returning to the same truth: I let you down. Not because I stopped caring, but because I forgot to show it in ways that reached you. That's on me. I'm sorry, and I want to do better — if you'll let me.`, body_hi: `Sab kuch ke baad ki khamoshi mein, main usi sach par wapas aata hoon: maine tumhe neeche giraaya. Isliye nahi ki parwaah band ho gayi, balki isliye ki bhool gaya dikhana un tareekon se jo tumhak pahunchta. Yeh meri galti hai. Maafi chahta hoon, aur behtar karna chahta hoon — agar tum mujhe mauka do.` },
  { id: 7, tone: 'tender', title: 'What I Should Have Said', title_hi: 'Jo Mujhe Kehna Chahiye Tha', body: `The thing I should have said, and didn't, was simple: I hear you. I see you. You're not too much — I just didn't know how to hold everything you were offering me. I'm sorry I made you feel like your feelings were a burden. They were never that.`, body_hi: `Jo mujhe kehna chahiye tha, aur nahi kaha, woh seedha tha: main sun raha hoon. Main dekh raha hoon. Tum zyada nahi ho — bas main nahi jaanta tha kaise thaamu sab jo tum de rahe the. Maafi chahta hoon ki tumhe laga tumhare jazbaat bojh hain. Woh kabhi nahi the.` },
  { id: 8, tone: 'tender', title: 'A Gentle Truth', title_hi: 'Ek Naram Sach', body: `Here is a gentle truth: I was afraid. Afraid of saying the wrong thing, of making it worse — and in that fear, I made it worse anyway. I froze when you needed me to move. I'm sorry. Next time, I choose you over my own discomfort.`, body_hi: `Ek naram sach yeh hai: main dara hua tha. Galat baat kehne se dara, aur bura karne se dara — aur us dar mein, waise bhi bura kar diya. Main ruk gaya jab tumhe mujhe chalte dekhna tha. Maafi chahta hoon. Agli baar, apni takleef se pehle tumhein chununga.` },
  { id: 9, tone: 'tender', title: 'The Space Between Us', title_hi: 'Hamare Beech Ka Faasla', body: `The space between us felt like a country I created. I built it from small dismissals and borrowed distances, and I'm sorry for every stone I laid there. I want to take them apart, one by one, if you'll show me which ones hurt the most.`, body_hi: `Hamare beech ki jagah ek mulk jaisi lagi jo maine banaya. Choti choti nakaramiyon aur udhar liye faslon se banaya, aur maafi chahta hoon har us patthar ke liye jo maine wahan rakha. Unhe uthana chahta hoon, ek ek karke, agar tum dikhao kaun se sabse zyada dard dete hain.` },
  { id: 10, tone: 'tender', title: 'Held Breath', title_hi: 'Ruka Hua Saans', body: `I've been holding my breath since that day — waiting for the moment I could say this clearly, quietly, without drama: I'm sorry. You deserved more from me than what I gave, and I know that now in a way I didn't then. I'm breathing again. I hope you are too.`, body_hi: `Us din se saans rok raha hoon — us pal ka intezaar mein jab yeh saaph, dheeme, bina drama ke keh sakun: maafi chahta hoon. Tumhare laayak tha mujhse zyada, aur ab jaanta hoon jo tab nahi tha. Ab saans le raha hoon. Umeed hai tum bhi le rahe ho.` },
  { id: 11, tone: 'tender', title: 'The Version of Me You Deserve', title_hi: 'Main Jo Tumhare Laayak Hoon', body: `The version of me you fell for is still here. The one who listened, who showed up, who cared about the details — that person just got lost for a while. I'm finding my way back. Not for a second chance necessarily. Just to be, again, someone you can be proud of knowing.`, body_hi: `Woh wala main jo tumhe pasand aaya tha, abhi bhi hoon. Jo sunta tha, jo aata tha, jo choti choti baaton ki parwaah karta tha — woh banda bas kuch waqt ke liye kho gaya tha. Wapas aa raha hoon. Zaruri nahi doosre mauke ke liye. Bas phir se aise banne ke liye jo tum jaante ho iske liye fakhr karo.` },
  { id: 12, tone: 'tender', title: "The Way You Look When You're Hurt", title_hi: 'Tum Dard Mein Kaise Dikhte Ho', body: `I memorized the way you look when you're hurt — and I've been carrying that image like a debt. I owe you more than this apology, but it's where I start. With honesty. With care. With the simple, unflinching admission that I hurt you, and I hate that I did.`, body_hi: `Yaad kar liya hai mujhe tum dard mein kaise dikhte ho — aur woh tasveer ek qarz ki tarah liye chal raha hoon. Tumhara iss maafi se zyada haq hai, par yahi se shuru karta hoon. Imandaari se. Parwaah se. Is seedhe, bina jhijhak ke ikraar se ki maine tumhe dard diya, aur ghinn aati hai mujhe isse.` },
  { id: 13, tone: 'tender', title: 'Still and True', title_hi: 'Sthir aur Sach', body: `Apologies can be loud things — full of gestures and noise. This one is still and true: I was careless with something precious. You. And I'm sorry in the marrow-deep, before-sleep way that doesn't ask for anything back. Just offered, quietly, with both hands open.`, body_hi: `Maafiyaan shor wali ho sakti hain — ibaarat aur awaaz se bhari. Yeh waali sthir aur sach hai: jo cheez anmol thi us ke saath laparwahi ki. Tum. Aur maafi chahta hoon hadiyon tak gehri, neend se pehle wali maafi jo kuch wapas nahi maangti. Bas pesh ki gayi, dheeme, dono haath khule.` },
  { id: 14, tone: 'tender', title: "For What I Couldn't Say", title_hi: 'Jo Main Nahi Bol Paya', body: `For every time I swallowed words that needed to come out — for every door I walked through alone when I should have held it open — for every glance I gave my fears instead of giving you my full self: I'm sorry. You never deserved to translate my silence.`, body_hi: `Har baar ke liye jab main woh baatein pee gaya jo nikalni chahiye thin — har darwaze ke liye jo akele guzra jab roka chahiye tha — har us nazar ke liye jo mere daron ko di apni poori zindagi ki jagah: maafi chahta hoon. Tumhe kabhi meri khamoshi ka tarjuma nahi karna chahiye tha.` },
  { id: 15, tone: 'tender', title: 'A Letter I Kept Rewriting', title_hi: 'Ek Khat Jo Baar Baar Likha', body: `I've written this a hundred times in my head and deleted it. Not because I didn't mean it, but because I was afraid the words would be wrong. They might still be. But I'd rather give you imperfect honesty than perfect silence: I miss you, I was wrong, and I'm sorry.`, body_hi: `Yeh sau baar dimag mein likha aur mita diya. Isliye nahi ki matlab nahi tha, balki isliye ki dara tha alfaaz galat honge. Shayad abhi bhi hain. Par nakamil imandaari kaafi achhi hai mukammal khamoshi se: tumhari yaad aati hai, main galat tha, aur maafi chahta hoon.` },
  { id: 16, tone: 'tender', title: 'The Same Heart', title_hi: 'Wahi Dil', body: `It's the same heart that loved you then — just a little cracked from what I put it through when I chose badly. I'm not asking you to fix it. I'm just letting you know: it still beats for you, stubborn and steady, with something I can only call sorry.`, body_hi: `Wahi dil hai jo tab tumse pyaar karta tha — bas thoda toota hua apni buri pasand ki wajah se. Tumse theek karne ko nahi keh raha. Bas bata raha hoon: abhi bhi tumhare liye dhadakta hai, ziddi aur sthir, kuch aise ke saath jo sirf maafi keh sakta hoon.` },
  { id: 17, tone: 'tender', title: 'Morning Light', title_hi: 'Subah Ki Roshni', body: `In the morning light, things look clearer than they do in the dark of arguments and pride. I see clearly now: I was wrong. You gave me grace I didn't earn, and I repaid it with distance. I'm sorry. Today is the day I say that out loud, in the daylight, where it counts.`, body_hi: `Subah ki roshni mein, cheezein zyada saaph dikhti hain jhagdon aur guroor ke andheron se. Ab saaph dikh raha hai: main galat tha. Tumne mujhe woh ehsaan diya jo maine kamaaya nahi tha, aur maine use doori se chuka diya. Maafi chahta hoon. Aaj woh din hai jab yeh zor se kehta hoon, daylight mein, jahan maayane rakhta hai.` },

  // PASSIONATE (17 cards)
  { id: 18, tone: 'passionate', title: "A Fire I Can't Put Out", title_hi: 'Ek Aag Jo Bujhti Nahi', body: `There's a fire in me that won't go out — it's everything I never said, all the "I'm sorry" I let burn instead of speak. I love you with a force that terrifies me, and I let that fear turn into cruelty. I'm done being a coward. I want you. I'm sorry. I choose you.`, body_hi: `Mere andar ek aag hai jo bujhti nahi — woh sab jo kabhi nahi kaha, woh saari maafiyaan jo bolne ki jagah jalti rahin. Tumse itna pyaar hai jo mujhe daraata hai, aur us dar ko maine zulm banne diya. Ab kaayar nahi hoon. Tumhe chahta hoon. Maafi chahta hoon. Tumhein chuntta hoon.` },
  { id: 19, tone: 'passionate', title: "I Can't Let This Be the End", title_hi: 'Yeh Aakhir Nahi Ho Sakta', body: `I refuse to let this be the end of us. Not like this — not over something I could have prevented with honesty and courage. You are not replaceable. You are not forgettable. You are the thing I keep fighting my way back to, even when I'm the one who left. I'm sorry. Come back.`, body_hi: `Main nahi manunga ki yeh hamara aakhir hai. Aise nahi — aise kisi baat par nahi jo imandaari aur himmat se rok sakta tha. Tum ki jagah koi nahi le sakta. Tum bhulaaye nahi ja sakte. Tum woh ho jis tak main baar baar apna raasta lad ke wapas aata hoon, chahe jaane wala main hi tha. Maafi chahta hoon. Wapas aao.` },
  { id: 20, tone: 'passionate', title: 'Raw and Relentless', title_hi: 'Saccha aur Biraham', body: `I'm not going to dress this up: I messed up. I knew what I was doing and I did it anyway and the moment it was done I knew I'd be chasing this feeling — this hollow, aching regret — forever. I don't want forever to feel like this. I want it to feel like you.`, body_hi: `Yeh sajaunga nahi: main ne gadbad ki. Jaanta tha kya kar raha hoon aur phir bhi kiya, aur jis pal hua, jaanta tha is khaalipan ka pachtawa hamesha peechhega. Nahi chahta hamesha aisa feel ho. Chahta hoon hamesha tum jaisa feel ho.` },
  { id: 21, tone: 'passionate', title: 'The Loudest Silence', title_hi: 'Sabse Tez Khamoshi', body: `You went quiet and it was louder than anything you've ever said. I felt it in my bones — that silence that says I went too far, that silence I caused. I'm sorry with everything in me. I would unmake the moment if I could. Since I can't, I'm here, asking you to let me remake us.`, body_hi: `Tum chup ho gaye aur woh khamoshi tumhari kisi baat se zyada tez thi. Hadiyon mein mehsoos hua — woh khamoshi jo kehti hai main bahut aage nikal gaya, woh khamoshi jo meri wajah se thi. Poori jaan se maafi chahta hoon. Woh pal unmaake kar sakta to karta. Kyunki nahi kar sakta, yahan hoon, tumse keh raha hoon mujhe humein phir se banana do.` },
  { id: 22, tone: 'passionate', title: 'Burning Through', title_hi: 'Jal Ke Aar Par', body: `I'm burning through all my careful words because this isn't the time for careful. This is the time for: I was wrong, I was selfish, and losing you feels like losing the best version of the world. So here I am, uncareful and desperate, asking you to stay. Please.`, body_hi: `Mere saare sambhale alfaaz jal rahe hain kyunki yeh sambhalne ka waqt nahi. Yeh waqt hai: main galat tha, main swarth tha, aur tumhe khona duniya ki sabse achhi soorat khone jaisa lagta hai. Toh yahan hoon, laparwah aur bechain, tumse rukne ki guzarish kar raha hoon. Please.` },
  { id: 23, tone: 'passionate', title: 'No One Else', title_hi: 'Koi Aur Nahi', body: `I've tried imagining moving on. The math doesn't work — there's no version of my future that feels real without you in it. That's not pressure, it's truth. I love you with the kind of love that doesn't negotiate with regret. I'm sorry. I'm not going anywhere. Are you?`, body_hi: `Aage badhne ki koshish ki sochne ki. Hisaab nahi milta — mere bhavishya ki koi soorat sach nahi lagti jisme tum nahi ho. Yeh dabaav nahi, yeh sach hai. Tumse uss tarah pyaar hai jo pachtawe se saudabaazi nahi karta. Maafi chahta hoon. Main kahin nahi ja raha. Tum?` },
  { id: 24, tone: 'passionate', title: 'The Argument I Lost in My Head', title_hi: 'Woh Bahas Jo Dimag Mein Haara', body: `I had the argument with myself a hundred times: was I wrong? Should I apologize? And every single time, the answer came back the same: yes. You were right. I was protecting ego instead of protecting us. That ends now. I choose us. I always should have.`, body_hi: `Khud se sau baar bahas ki: kya main galat tha? Kya maafi maangni chahiye? Aur har baar, jawaab wahi aaya: haan. Tum sahi the. Main hum dono ko bachane ki jagah apna guroor bacha raha tha. Yeh abhi khatam hota hai. Main hum dono ko chuntta hoon. Hamesha karna chahiye tha.` },
  { id: 25, tone: 'passionate', title: 'Your Name at 3am', title_hi: 'Raat 3 Baje Tumhara Naam', body: `At 3am your name is the loudest thing in the room. It's the first thing I think and the last thing I fight against sleeping, because sleeping means another day without fixing this — without reaching you and saying: I was wrong, I love you, and I'm sorry for every moment I made you doubt that.`, body_hi: `Raat ke 3 baje tumhara naam kamre mein sabse tez cheez hai. Pehli baat jo sochta hoon aur aakhri jo neend se lad ke sochta hoon, kyunki neend matlab ek aur din bina ise theek kiye — bina tumtak pahunche aur kehne ke: main galat tha, tumse pyaar hai, aur maafi chahta hoon har us pal ke liye jab tumne isse doubt kiya.` },
  { id: 26, tone: 'passionate', title: 'All of It', title_hi: 'Sab Kuch', body: `I want all of it back — every stupid fight, every moment of grace you gave me that I didn't deserve, every time you laughed at something I said and I felt like the luckiest person alive. I want all of it back. I'm sorry I made you question whether it was worth it. It is. You are.`, body_hi: `Sab wapas chahta hoon — har bekar jhagda, parwaah ka har woh pal jo tumne diya jo maine nahi kamaaya tha, har baar jab tum meri baat par hanse aur main khud ko duniya ka sabse khushnaseeb insaan samjha. Sab wapas chahta hoon. Maafi chahta hoon ki tumhe sochna pada ki kya yeh waqt tha. Tha. Tum ho.` },
  { id: 27, tone: 'passionate', title: 'Too Much, Never Enough', title_hi: 'Bahut Zyada, Kabhi Kaafi Nahi', body: `I was too much of the wrong things and not enough of the right ones. Too proud, not present enough. Too loud in the wrong moments, too silent in the ones that needed my voice. I'm sorry. The version of me you fell in love with is still here — fighting to be the one you see right now.`, body_hi: `Main galat cheezon mein bahut zyada tha aur sahi cheezon mein kaafi nahi. Bahut ghamandi, kaafi haazir nahi. Galat waqt mein bahut shor, un waqton mein bahut chup jahan meri awaaz chahiye thi. Maafi chahta hoon. Woh wala main jis se tumne pyaar kiya tha abhi bhi hoon — lad raha hoon abhi tumhe dikhne ke liye.` },
  { id: 28, tone: 'passionate', title: 'I Am Here', title_hi: 'Main Yahan Hoon', body: `I am here. Not strategically, not carefully — just here, with everything I have. With an apology that isn't performed but felt. With love that hasn't gone anywhere even when I made you question it. With the simple, overwhelming fact that you are worth fighting for. And I'm sorry I made you feel otherwise.`, body_hi: `Main yahan hoon. Strategy se nahi, sambhal ke nahi — bas yahan, apna sab leke. Ek maafi ke saath jo perform nahi ki balki mehsoos ki. Pyaar ke saath jo kahin nahi gaya chahe tumne use doubt kiya. Us seedhe, bhaarip sach ke saath ki tum larne ke laayak ho. Aur maafi chahta hoon ki tumhe aisa nahi laga.` },
  { id: 29, tone: 'passionate', title: 'The Heart Remembers', title_hi: 'Dil Yaad Rakhta Hai', body: `The heart remembers what the mind wants to protect. Mine keeps returning to you — every defense I built falls when I'm alone and honest. I was wrong. I was scared. I was selfish. But my heart, stripped of all that, still only knows one thing: you. I'm sorry I made you question that.`, body_hi: `Dil woh yaad rakhta hai jo dimag bachana chahta hai. Mera baar baar tumhare paas lautता hai — har deewar jo khadi ki woh giri jab main akela aur sachcha hoon. Main galat tha. Main dara hua tha. Main swarth tha. Par mera dil, sab utarke, abhi bhi sirf ek cheez jaanta hai: tum. Maafi chahta hoon ki tumne ise doubt kiya.` },
  { id: 30, tone: 'passionate', title: 'I Can Do Better', title_hi: 'Main Behtar Kar Sakta Hoon', body: `I can do better. I know that now in a way I didn't before — in the aching, certain way of someone who has seen the alternative and rejected it completely. I don't want a world where I wasn't worth fighting for. I want to be worthy. I'm sorry. Let me prove it.`, body_hi: `Main behtar kar sakta hoon. Ab jaanta hoon uss tarah se jo pehle nahi tha — us dardnaak, pakke tarike se jo doosra raasta dekh chuka aur use poori tarah nakaara. Nahi chahta ek aisi duniya jisme main larane ke laayak nahi tha. Laayak banna chahta hoon. Maafi chahta hoon. Mujhe sabit karne do.` },
  { id: 31, tone: 'passionate', title: 'Unfinished Story', title_hi: 'Adhuri Kahani', body: `We're not finished. I refuse that. Not when there's still so much I haven't shown you — so many mornings and arguments-turned-to-laughing and moments where I get it right. I haven't earned those yet. I'm still earning them. I'm sorry. Stay long enough to see who I'm becoming.`, body_hi: `Hum khatam nahi hue. Main yeh nahi manunga. Jab abhi itna kuch dikhaana baaki hai — kitni subhein, kitne jhagde jo hansi mein badal gaye aur woh lamhe jab main sahi karta hoon. Abhi kamaaye nahi. Abhi bhi kama raha hoon. Maafi chahta hoon. Itna ruko ki dekh sako main kya ban raha hoon.` },
  { id: 32, tone: 'passionate', title: 'This Is Me Choosing', title_hi: 'Yeh Main Hoon Jo Chun Raha Hoon', body: `This is me, standing here, choosing. Not the easy path of silence, not the prideful exit — choosing you. Choosing the hard work of repair, choosing honesty over ego, choosing this: I was wrong, I'm sorry, and I want us more than I've ever wanted anything comfortable.`, body_hi: `Yeh main hoon, yahan khada, chunne wala. Khamoshi ka aasaan raasta nahi, ghamandi vidaai nahi — tumhein chun raha hoon. Marammaat ki mehnat chunna, guroor se pehle imandaari chunna, yeh chunna: main galat tha, maafi chahta hoon, aur hum dono ko chahta hoon zyada kisi bhi aaram se.` },
  { id: 33, tone: 'passionate', title: 'What You Do to Me', title_hi: 'Tum Mujhe Kya Karte Ho', body: `You should know what you do to me — the way I become more myself around you, and the specific ways losing that unmakes me. I became someone I don't recognize when I let my fear drive. I'm sorry. The real me — the one that loves you right — is here now. He's not leaving again.`, body_hi: `Tumhe pata hona chahiye ki tum mujhe kya karte ho — kaise main tumhare paas zyada khud ban jaata hoon, aur kaise tumhe khona mujhe bigaad deta hai. Main koi aisa ban gaya tha jise main pehchaanta nahi jab apne dar ko aage karne diya. Maafi chahta hoon. Sachcha main — jo tumse sahi tarah pyaar karta hai — yahan hai. Ab nahi jayega.` },
  { id: 34, tone: 'passionate', title: 'The Distance I Made', title_hi: 'Woh Doori Jo Maine Banaayi', body: `I made the distance. It wasn't fate or bad timing — I made it, choice by choice, silence by silence, and I watched it grow without stopping it. I'm stopping it now. Right here, right now, with everything I have: I love you, I'm sorry, and I'm done letting distance be the place I live.`, body_hi: `Doori maine banaayi. Taqdeer nahi tha ya bura waqt nahi tha — maine banaayi, chunaav pe chunaav, khamoshi pe khamoshi, aur badhte hue dekha bina roke. Ab rok raha hoon. Yahan, abhi, apna sab leke: tumse pyaar hai, maafi chahta hoon, aur ab doori ko apna ghar nahi banaaunga.` },

  // REMORSEFUL (17 cards)
  { id: 35, tone: 'remorseful', title: 'No Defense Left', title_hi: 'Koi Safaayi Nahi Bachi', body: `I'm not here to defend myself. There is no defense — what I did was wrong, and every explanation I could offer would just be another way of not fully owning it. So here it is, without decoration: I hurt you. I'm responsible for that. And I'm truly, deeply sorry.`, body_hi: `Main apni safaayi nahi karne aaya. Koi safaayi hai hi nahi — jo kiya woh galat tha, aur jo bhi waazeh pesh kar sakta hoon woh sirf poori zimmedaari se bachne ka ek aur tarika hoga. Toh yeh hai, bina sajaawe ke: maine tumhe dard diya. Main zimmedaar hoon. Aur sach mein, gehri maafi chahta hoon.` },
  { id: 36, tone: 'remorseful', title: 'The Weight of What I Did', title_hi: 'Jo Kiya Uska Bojh', body: `I sit with the weight of what I did every day. It doesn't get lighter. I don't want it to — not yet. Because the weight reminds me that I caused something real, that my actions had consequences I didn't have the right to ignore. I'm sorry. Not to feel better. Just because it's true.`, body_hi: `Jo kiya uska bojh har roz mahsoos karta hoon baith ke. Halka nahi hota. Chahta bhi nahi — abhi nahi. Kyunki bojh yaad dilaata hai ki kuch asli hua, ki mere kamon ke natije the jo ignore karne ka mera haq nahi tha. Maafi chahta hoon. Behtar feel karne ke liye nahi. Bas isliye ki sach hai.` },
  { id: 37, tone: 'remorseful', title: "I Don't Expect Forgiveness", title_hi: 'Maafi Ki Umeed Nahi', body: `I'm not writing this expecting forgiveness. I'm writing it because you deserve to hear — without my ego getting in the way — that what I did was wrong. You were right to be hurt. You were right to be angry. And I should have said this much sooner, without conditions or caveats.`, body_hi: `Yeh maafi ki umeed mein nahi likh raha. Likh raha hoon kyunki tumhara haq hai sunne ka — mere guroor ke beena beech mein aaye — ki jo kiya woh galat tha. Tum sahi the dard mehsoos karne mein. Tum sahi the gusse mein. Aur yeh bahut pehle kehna chahiye tha, bina kisi shart ya pabandi ke.` },
  { id: 38, tone: 'remorseful', title: 'The Truth About What I Did', title_hi: 'Jo Kiya Uska Sach', body: `The truth is I knew it was wrong when I did it. Not after — during. And I did it anyway, and that's the part that keeps me up at night. Not the consequences. The choice. I made a choice that hurt you, knowing it would. I'm sorry in the deepest, most uncomfortable way possible.`, body_hi: `Sach yeh hai ki jab kiya tab pata tha galat hai. Baad mein nahi — karte waqt. Aur phir bhi kiya, aur yahi woh baat hai jo raat ko jagate rehti hai. Natije nahi. Chunaav. Maine ek chunaav kiya jo tumhe dard dega jaante hue. Maafi chahta hoon sabse gehri, sabse behaal tarah se.` },
  { id: 39, tone: 'remorseful', title: 'Accountable', title_hi: 'Zimmedaar', body: `I'm holding myself accountable — not because you asked me to, but because it's the only honest thing left to do. I failed you. I failed what we had. I failed my own standards. That's mine to carry. I just needed you to know that I see it clearly, and I'm sorry without conditions.`, body_hi: `Khud ko zimmedaar thahra raha hoon — isliye nahi ki tumne kaha, balki isliye ki yahi ek ईमानदाrani bachi hai. Tumhara saath chhod diya. Hamara rishta chhod diya. Apne aadar chhod diya. Yeh mera bojh hai. Bas tumhe pata hona chahiye ki saaph dikh raha hai, aur maafi bina kisi shart ke chahta hoon.` },
  { id: 40, tone: 'remorseful', title: "The Moments I Can't Take Back", title_hi: 'Woh Lamhe Jo Wapas Nahi Aayenge', body: `There are moments I can't take back — I know that. I'm not asking you to pretend they didn't happen or that they don't matter. They do. They happened. And my apology doesn't erase them. It just says: I see them. I own them. They were wrong. And I'm sorry you had to live through them.`, body_hi: `Kuch lamhe hain jo wapas nahi le sakta — jaanta hoon. Tumse yeh dikhawa nahi karwa raha ki nahi hue ya maayane nahi rakhte. Rakhte hain. Hue. Aur meri maafi unhe mitaati nahi. Bas kehti hai: main dekhta hoon. Maanta hoon. Galat the. Aur maafi chahta hoon ki tumhe un mein se guzarna pada.` },
  { id: 41, tone: 'remorseful', title: 'What I Owe You', title_hi: 'Jo Tumhara Mujh Par Haq Hai', body: `What I owe you is not a performance of remorse — it's honesty. So here it is: I was selfish. I prioritized the wrong things. I dismissed what you were trying to tell me and called it "perspective" when really it was just my inability to hear anything that challenged my comfort. I'm sorry.`, body_hi: `Jo tumhara mera par haq hai woh pachtawe ka naatak nahi — woh imandaari hai. Toh yeh lo: main swarth tha. Galat cheezein pehle rakhi. Jo tum kehne ki koshish kar rahe the use nazar andaaz kiya aur "naazariya" bola jab woh asliyat mein bas meri naakaamiyat thi kuch bhi sunne ki jo mera aaraam chunaute mein daalta. Maafi chahta hoon.` },
  { id: 42, tone: 'remorseful', title: 'I Was Wrong, Full Stop', title_hi: 'Main Galat Tha, Bas', body: `I was wrong. No "but", no "however", no "in fairness". Just: wrong. The kind of wrong that doesn't get mitigated by context or explanation or the good things I also did. This was wrong. You were hurt. That's the whole sentence. And I'm sorry for every word of it.`, body_hi: `Main galat tha. Koi "lekin" nahi, koi "phir bhi" nahi, koi "insaaf se sochein". Bas: galat. Woh qism ka galat jo context ya tashreeh ya jo achha bhi kiya use kam nahi hota. Yeh galat tha. Tumhe dard hua. Yahi poora jumla hai. Aur maafi chahta hoon iske har lafz ke liye.` },
  { id: 43, tone: 'remorseful', title: 'Looking Back', title_hi: 'Peeche Mur Ke Dekhun', body: `Looking back, I can trace every moment I chose myself over you and called it something else — called it protecting the relationship, called it honesty, called it space. It was selfishness dressed up in reasonable language. I know that now. I'm sorry it took me so long to stop dressing it up.`, body_hi: `Peeche mur ke dekhta hoon, har woh pal track kar sakta hoon jab tumse pehle apne aap ko chuna aur ise kuch aur bola — rishte ki hifazat bola, imandaari bola, jagah bola. Woh swarth tha makul zabaan mein sajaya hua. Ab jaanta hoon. Maafi chahta hoon ki itna waqt laga use sajana band karne mein.` },
  { id: 44, tone: 'remorseful', title: 'The Apology You Should Have Had', title_hi: 'Woh Maafi Jo Tumhe Milni Chahiye Thi', body: `This is the apology you should have had weeks ago — the one that doesn't ask for anything in return, doesn't position me as the victim of my own mistakes, doesn't minimize what happened with context you didn't ask for. Just: I hurt you. That was wrong. I'm sorry.`, body_hi: `Yeh woh maafi hai jo hafte pehle milni chahiye thi — jo kuch wapas nahi maangti, jo mujhe apni galtiyon ka shikaar nahi dikhaati, jo kuch hua use un halaat se chota nahi karti jo tumne nahi maange. Bas: maine tumhe dard diya. Yeh galat tha. Maafi chahta hoon.` },
  { id: 45, tone: 'remorseful', title: 'I Broke Something Precious', title_hi: 'Kuch Anmol Tooda', body: `I broke something precious, and the fact that I didn't mean to doesn't make it less broken. It just means I have to live with knowing that carelessness can cause the same damage as intention. I was careless with something irreplaceable. I'm sorry. That's real and it matters.`, body_hi: `Kuch anmol toda, aur yeh ke matlab nahi tha use kam tuta nahi karta. Bas matlab hai ki mujhe iske saath jeena hai ki laparwahi utna hi nuksan kar sakti hai jitna iraada. Jo cheez ki jagah nahi thi us ke saath laparwah tha. Maafi chahta hoon. Yeh asli hai aur maayane rakhta hai.` },
  { id: 46, tone: 'remorseful', title: 'No More Justifications', title_hi: 'Ab Koi Jawaazat Nahi', body: `I'm done justifying. Every justification I've ever offered you was just another way of making my comfort more important than your pain. It's not. You were right to feel what you felt. You're right to still feel it. And I'm sorry — clearly, completely, without the asterisk of explanation.`, body_hi: `Jawaazat karna khatam. Jo bhi jawaazat tumhe di woh bas mera aaraam tumhare dard se zyada zaroori dikhane ka ek aur tarika tha. Hai nahi. Tum sahi the jo feel kiya. Abhi bhi feel karne mein sahi ho. Aur maafi chahta hoon — saaph, poori tarah, bina kisi tashreeh ki asterisk ke.` },
  { id: 47, tone: 'remorseful', title: 'The Cost', title_hi: 'Qeemat', body: `I understand the cost now — not theoretically, but viscerally. The cost of what I did, the cost of my choices, the cost of prioritizing the wrong things at the wrong time. I wish I had understood it sooner. I'm sorry I needed the loss to see the value clearly.`, body_hi: `Ab samajh aa gaya hai qeemat — theory mein nahi, antar tak. Jo kiya uski qeemat, mere chunaavon ki qeemat, galat waqt par galat cheezein pehle rakhne ki qeemat. Kaash pehle samajh aata. Maafi chahta hoon ki mujhe nuksan chahiye tha qeemat saaph dekhne ke liye.` },
  { id: 48, tone: 'remorseful', title: 'Owning It', title_hi: 'Maanta Hoon', body: `I'm owning it — every bit of it. Not because someone told me to, not because it's the "mature" thing. Because you deserve to hear it, once, clearly, without me flinching from the specifics: I was wrong to do that. It hurt you. I knew better and didn't do better. I'm sorry.`, body_hi: `Maanta hoon — iska har hissa. Isliye nahi ki kisine kaha, isliye nahi ki "samjhdari" hai. Isliye ki tumhara haq hai sunne ka, ek baar, saaph, bina mujhse kisi detail se daraye hue: woh karna galat tha. Tumhe dard hua. Behtar jaanta tha aur behtar nahi kiya. Maafi chahta hoon.` },
  { id: 49, tone: 'remorseful', title: 'What My Pride Cost Us', title_hi: 'Mere Guroor Ne Kya Le Liya', body: `My pride cost us something we can't get back, and I'm sitting with that. The specific shape of what we lost has my fingerprints on it — mine, not ours. I did that. And I'm sorry in the way that doesn't reach for the past or demand a future, just stands here, honest, in the present.`, body_hi: `Mere guroor ne hum se kuch le liya jo wapas nahi aa sakta, aur main iske saath baith raha hoon. Jo khoya uski khaas soorat par mere ungliyon ke nishaan hain — mere, hamare nahi. Maine kiya. Aur maafi chahta hoon us tarah se jo na past dhundta hai na future maangta hai, bas yahan khada hai, sachcha, abhi mein.` },
  { id: 50, tone: 'remorseful', title: 'I Hear You', title_hi: 'Main Sun Raha Hoon', body: `I hear you. I know I didn't before — not really — but I do now. I understand what you were trying to tell me, and I understand why it hurt when I didn't listen. You were right. I was wrong. And the only thing left that matters is that you know I finally, fully, hear you.`, body_hi: `Main sun raha hoon. Jaanta hoon pehle nahi suna — sach mein nahi — par ab sunta hoon. Samajh gaya tum kya kehne ki koshish kar rahe the, aur samajh gaya kyun dard hua jab main nahi suna. Tum sahi the. Main galat tha. Aur jo abhi ek zaruri baat bachi hai woh yeh hai ki tum jaano main aakhirkar, poori tarah, sun raha hoon.` },
  { id: 51, tone: 'remorseful', title: 'A Better Accounting', title_hi: 'Ek Behtar Hisaab', body: `Here is a better accounting of what happened: you trusted me, I took that for granted, I made choices that broke that trust, and I let too much time pass before saying any of this. That's the true version. I'm sorry it took me this long to offer it to you plainly.`, body_hi: `Ek behtar hisaab yeh hai jo hua: tumne mujh par bharosa kiya, maine use halke mein liya, maine chunaav kiye jo us bharose ko toda, aur itna waqt guzarne diya yeh sab kehne se pehle. Yahi sach hai. Maafi chahta hoon ki itna waqt laga tumhe seedha pesh karne mein.` },

  // HOPEFUL (17 cards)
  { id: 52, tone: 'hopeful', title: 'Still Believing', title_hi: 'Abhi Bhi Yakeen Hai', body: `I still believe in what we built — not blindly, not ignoring what happened, but with the specific, stubborn faith of someone who has seen what we're capable of when we're at our best. I'm sorry for the ways I contributed to our worst. I believe we can find our way back. I'm holding the door.`, body_hi: `Abhi bhi maanta hoon jo humne banaya — andhe hokar nahi, kya hua use nazar andaaz karke nahi, balki uss khaas, ziddi yakeen se jo dekh chuka hai hum kya kar sakte hain jab apne sabse achhe pe hote hain. Maafi chahta hoon un tareekon ke liye jo hamare sabse bure mein daala. Maanta hoon hum wapas raasta dhundh sakte hain. Main darwaza thame hoon.` },
  { id: 53, tone: 'hopeful', title: "A Door I'm Holding Open", title_hi: 'Ek Darwaza Jo Main Thame Hoon', body: `This apology isn't a closing statement — it's a door I'm holding open. I was wrong, and I'm sorry, and I believe that's not where the story has to end. There's a version of us on the other side of this moment that I'm still working toward. Are you?`, body_hi: `Yeh maafi khatam karne ka bayan nahi — yeh ek darwaza hai jo main thame hoon. Main galat tha, aur maafi chahta hoon, aur maanta hoon yahan kahani khatam nahi honi chahiye. Is lamhe ke doosri taraf hum dono ki ek soorat hai jis ki taraf abhi bhi kaam kar raha hoon. Tum?` },
  { id: 54, tone: 'hopeful', title: 'What Could Still Be', title_hi: 'Jo Abhi Bhi Ho Sakta Hai', body: `I'm not trying to undo what happened. I'm asking you to help me build what could still be — something better, something we make consciously, with the specific knowledge of what we should have done differently. I'm sorry. And I'm hopeful, if that means anything.`, body_hi: `Jo hua use mitaane ki koshish nahi kar raha. Tumse keh raha hoon jo abhi bhi ho sakta hai use milke banao — kuch behtar, kuch hum milke banayein hoshyari se, us khaas jaankari ke saath ki kya alag karna chahiye tha. Maafi chahta hoon. Aur umeed rakhta hoon, agar maayane rakhta hai.` },
  { id: 55, tone: 'hopeful', title: 'Growing Season', title_hi: 'Ugne Ka Mausam', body: `They say some things have to break before they can grow — I'm hoping that's true for us. I'm sorry for the breaking. I've been doing the growing. And if you're willing to water this alongside me, I think we could become something neither of us has seen yet: what we were always supposed to be.`, body_hi: `Kahte hain kuch cheezein pehle totni padti hain phir ugne ke liye — umeed hai yeh hamare liye sach hai. Tutne ke liye maafi chahta hoon. Ugne ka kaam kar raha hoon. Aur agar tum mere saath ise pani dene ko tayyar ho, lagta hai hum kuch aisa ban sakte hain jo hum mein se kisine nahi dekha: jo hume hamesha se banna tha.` },
  { id: 56, tone: 'hopeful', title: 'The Morning After', title_hi: 'Agli Subah', body: `Every morning after a hard night, something small is possible again — coffee, sunlight, the beginning of a different conversation. I'm not asking for everything back at once. Just for the morning version: small, quiet, possible. I'm sorry. I'm still here. I'm still hoping.`, body_hi: `Mushkil raat ke baad har subah, kuch chhota phir se mumkin hota hai — chai, dhoop, ek alag baatcheet ki shuruaat. Sab kuch ek saath wapas nahi maang raha. Bas subah wala: chhota, dheema, mumkin. Maafi chahta hoon. Abhi bhi hoon. Abhi bhi umeed rakhta hoon.` },
  { id: 57, tone: 'hopeful', title: "I've Been Thinking", title_hi: 'Soch Raha Tha', body: `I've been thinking about who I want to be — not just for you, but in general. And the person I want to be would have said this sooner: I was wrong. I'm sorry. And I want to build something new with you, if you're open to it. Not the same as before. Better. Chosen, this time, on purpose.`, body_hi: `Soch raha tha main kaisa banna chahta hoon — sirf tumhare liye nahi, aam taur par bhi. Aur jo main banna chahta hoon woh yeh pehle keh deta: main galat tha. Maafi chahta hoon. Aur tumhare saath kuch naya banana chahta hoon, agar tum tayyar ho. Pehle jaisa nahi. Behtar. Is baar, jaanbujhkar chuna hua.` },
  { id: 58, tone: 'hopeful', title: 'Not the End', title_hi: 'Aakhir Nahi', body: `I know it feels like an ending. But I've been watching closely — the way you still answer my messages, the way you still laugh at the things I say — and I think we both know this isn't over. I'm sorry for the damage I did. I believe the foundation is still there.`, body_hi: `Jaanta hoon khatam jaisa lagta hai. Par main dhyaan se dekh raha tha — jaise tum abhi bhi mere messages ka jawaab dete ho, jaise abhi bhi meri baaton par haste ho — aur lagta hai hum dono jaante hain yeh khatam nahi hua. Jo nuksan kiya uske liye maafi chahta hoon. Maanta hoon neev abhi bhi hai.` },
  { id: 59, tone: 'hopeful', title: 'The Life We Could Have', title_hi: 'Woh Zindagi Jo Ho Sakti Hai', body: `Somewhere in the future, there's a version of our life I want us to actually live — not just imagine as a consolation. I want that future badly enough to be fully honest now: I was wrong, I'm sorry, and I'm willing to do the work to make it possible.`, body_hi: `Bhavishya mein kahin, hamaari zindagi ki ek soorat hai jo main chahta hoon hum sachmuch jiyen — sirf takleef mein khayal ke taur par nahi. Woh bhavishya chahta hoon itna ki ab poori tarah sachcha hoon: main galat tha, maafi chahta hoon, aur use mumkin banane ki mehnat karne ko tayyar hoon.` },
  { id: 60, tone: 'hopeful', title: 'Learning to Be Better', title_hi: 'Behtar Banna Seekh Raha Hoon', body: `I've been learning how to be better — not as a performance for you, but because I looked at myself clearly and didn't like what I saw. That process isn't finished. But it started because of you, because of this. I'm sorry. I'm grateful for the hard lesson. I want to show you the results.`, body_hi: `Seekh raha hoon kaise behtar banna hai — tumhare liye natak ke taur par nahi, balki isliye ki khud ko saaph dekha aur jo dekha pasand nahi aaya. Woh process khatam nahi hua. Par tumhari wajah se, is ki wajah se shuru hua. Maafi chahta hoon. Mushkil sabak ka shukriya ada karta hoon. Natije dikhana chahta hoon.` },
  { id: 61, tone: 'hopeful', title: 'Still Possible', title_hi: 'Abhi Bhi Mumkin', body: `There are things that are still possible between us, if we choose them. That's what I keep coming back to: choice. I made wrong ones. I'm choosing differently now — starting with honesty, starting with sorry, starting with the belief that we are still possible.`, body_hi: `Kuch cheezein hain jo hamare beech abhi bhi mumkin hain, agar hum chunein. Yahi main baar baar yaad karta hoon: chunaav. Maine galat kiye. Ab alag chun raha hoon — imandaari se shuru, maafi se shuru, is yakeen se shuru ki hum abhi bhi mumkin hain.` },
  { id: 62, tone: 'hopeful', title: 'I Changed', title_hi: 'Main Badal Gaya', body: `I changed. I know that might sound hollow right now, but it's true — and I changed because losing you (or the possibility of you) showed me exactly what I was doing wrong. I'm sorry. The version of me that hurt you is still learning. But he's learning fast, and he hasn't stopped thinking about you.`, body_hi: `Main badal gaya. Jaanta hoon abhi khokha lag sakta hai, par sach hai — aur badla isliye ki tumhe khona (ya tumhari sambhavana) ne mujhe bilkul dikhaya kya galat kar raha tha. Maafi chahta hoon. Jo main ne tumhe dard diya woh abhi bhi seekh raha hai. Par jaldi seekh raha hai, aur tumhare baare mein sochna band nahi kiya.` },
  { id: 63, tone: 'hopeful', title: 'Repair', title_hi: 'Marammaat', body: `I believe in repair. Not erasure — not pretending it didn't happen — but the specific work of looking at what broke and asking: can this be made better? I think it can. I think we can. I'm sorry for the breaking. I'm ready for the repair, if you are.`, body_hi: `Marammaat par yakeen karta hoon. Mitane pe nahi — dikhawa karne pe nahi ki nahi hua — balki khaas kaam par jo toota use dekhne aur poochne ka: kya yeh behtar ho sakta hai? Lagta hai ho sakta hai. Lagta hai hum ho sakte hain. Tutne ke liye maafi chahta hoon. Marammaat ke liye tayyar hoon, agar tum ho.` },
  { id: 64, tone: 'hopeful', title: 'A Different Kind of Start', title_hi: 'Ek Alag Tarah Ki Shuruaat', body: `I don't want to start over — I want to start differently. With honesty from the beginning. With the kind of communication I should have had all along. I'm sorry for the learning curve. But I've learned. And I'm wondering if you'd let me show you what that looks like.`, body_hi: `Naye sar se shuru karna nahi chahta — alag tarah se shuru karna chahta hoon. Shuruaat se imandaari ke saath. Woh tarah ki baat ke saath jo hamesha honi chahiye thi. Seekhne ki takleef ke liye maafi chahta hoon. Par seekh gaya hoon. Aur soch raha hoon ki kya tum mujhe dikhane doge yeh kaisa dikhta hai.` },
  { id: 65, tone: 'hopeful', title: 'Both of Us Together', title_hi: 'Hum Dono Milke', body: `The thing that keeps bringing me back is this: none of the good things in my life feel as good without someone to share them with. And the person I want to share them with is you. I'm sorry for the distance I created. I want to close it. Together.`, body_hi: `Jo mujhe baar baar wapas laata hai woh yeh hai: zindagi ki koi bhi achhi cheez utni achhi nahi lagti bina kisi ke saath share karne ke. Aur jo inhe share karna chahta hoon woh tum ho. Jo doori banayi uske liye maafi chahta hoon. Use band karna chahta hoon. Milke.` },
  { id: 66, tone: 'hopeful', title: 'Forward, Not Back', title_hi: 'Aage, Peeche Nahi', body: `I'm not asking us to go back — back to before, to the way things were. I'm asking us to go forward: toward the version of this where we've both grown, where I've proven I mean what I say, where the apology became real change. I'm sorry. I believe in forward.`, body_hi: `Hum dono ko peeche jaane ko nahi keh raha — pehle wale ko, cheezein jaisi thin waisi. Aage jaane ko keh raha hoon: is ki us soorat ki taraf jahan hum dono bade ho chuke, jahan sabit kar chuka ki jo keh raha hoon matlab rakhta hai, jahan maafi asli badlav ban gayi. Maafi chahta hoon. Aage par yakeen karta hoon.` },
  { id: 67, tone: 'hopeful', title: 'The Best Part of Knowing You', title_hi: 'Tumhein Jaanne Ka Sabse Achha Hissa', body: `The best part of knowing you has always been the possibility of more — more mornings, more honesty, more becoming. I almost threw that away. I'm sorry. I didn't fully see what I had until I started losing it. Now I see. And I want to spend whatever time you'll give me proving it.`, body_hi: `Tumhein jaanne ka sabse achha hissa hamesha zyada ki sambhavana rahi hai — zyada subhein, zyada imandaari, zyada banna. Lagbhag ise phenk diya. Maafi chahta hoon. Jo mere paas tha poora nahi dekha jab tak khona shuru nahi kiya. Ab dikha. Aur jo bhi waqt do, use sabit karne mein lagana chahta hoon.` },
  { id: 68, tone: 'hopeful', title: "Slowly, If That's What It Takes", title_hi: 'Dheere Dheere, Agar Waqt Lagta Hai', body: `Slowly — if that's what it takes. I'll take slowly. I'll take small steps and earned trust and the gradual rebuilding of something I damaged by moving too fast in the wrong direction. I'm sorry. Take all the time you need. I'll be here, working, hoping, growing. Slowly.`, body_hi: `Dheere dheere — agar waqt lagta hai. Main dheere dheere le lunga. Chote kadam lunga aur kamaaya hua bharosa aur kuch ki dheere dheere marammaat jo galat disha mein bahut tezi se chalne se toda. Maafi chahta hoon. Jitna waqt chahiye lo. Main yahan rahunga, kaam karta, umeed rakhta, barhta. Dheere dheere.` },

  // POETIC (16 cards)
  { id: 69, tone: 'poetic', title: 'The Space Between Stars', title_hi: 'Taaron Ke Beech Ki Jagah', body: `Between stars, there is no void — there is only distance waiting to collapse. That's what I think of us: not nothing, but unresolved. I have been learning the language of my own wreckage, and the first fluent sentence is this: I was wrong. I am sorry. The distance between us was my making, and I want to unmake it.`, body_hi: `Taaron ke beech koi shunyata nahi — sirf doori hai jo mitne ka intezaar kar rahi hai. Yahi sochta hoon hamare baare mein: kuch nahi, balki ankaha. Apni tabahi ki zabaan seekh raha tha, aur pehla rawaan jumla yeh hai: main galat tha. Maafi chahta hoon. Hamare beech ki doori meri banayi thi, aur use mitana chahta hoon.` },
  { id: 70, tone: 'poetic', title: 'Cartography of Regret', title_hi: 'Pachtawe Ka Naksha', body: `I have mapped every point where I went wrong — a cartography of small disasters and large silences, each one marked in the ink of what I should have said. You deserved better navigation. You deserved a guide who didn't lose the way. I'm sorry. I'm learning to read the stars.`, body_hi: `Har woh jagah map ki hai jahan galat gaya — choti museebaton aur badi khamoshiyon ka naksha, har ek jo kehna chahiye tha uski syahi mein. Tumhare laayak behtar raah tha. Tumhare laayak ek raahbar tha jo raasta nahi bhoolata. Maafi chahta hoon. Taare padhna seekh raha hoon.` },
  { id: 71, tone: 'poetic', title: 'The River Remembers', title_hi: 'Nadi Yaad Rakhti Hai', body: `The river remembers every rock it has moved and every shore it has carved — it carries the evidence of everywhere it has been. I carry the evidence of you: of what I had, and what I wasted, and the specific shape of the apology I owe you. Consider this the river returning to its source.`, body_hi: `Nadi har us patthar ko yaad rakhti hai jise hataya aur har us kinare ko jo taraasha — har jagah ka saboot saath chalti hai. Tumhara saboot uthaye chalata hoon: jo mere paas tha, aur jo barbaad kiya, aur us maafi ki khaas soorat jo tumhara mujh par haq hai. Yeh samjho nadi apne srot par wapas laut rahi hai.` },
  { id: 72, tone: 'poetic', title: 'Dusk Language', title_hi: 'Shaam Ki Zabaan', body: `There is a language spoken only at dusk — softer than day, more honest than night, the light that makes ordinary things look like what they always were: precious. In that light, I see you clearly. I see what I did. I see the sorry that was always there, waiting for me to be brave enough to say it.`, body_hi: `Ek zabaan hai jo sirf shaam mein boli jaati hai — din se naram, raat se zyada sachchi, woh roshni jo aam cheezein dikhati hai woh jo hamesha thin: anmol. Us roshni mein, tumhein saaph dekhta hoon. Jo kiya woh dekhta hoon. Woh maafi dekhta hoon jo hamesha wahan thi, mere himmat se kehne ka intezaar karte hue.` },
  { id: 73, tone: 'poetic', title: 'After the Rain', title_hi: 'Baarish Ke Baad', body: `After rain, something opens — the earth exhales, the light changes, even the silences between sounds become different. That's what I want from this apology: not a sudden clearing, but a slow opening. An exhale. The beginning of a different kind of light between us.`, body_hi: `Baarish ke baad, kuch khulta hai — zameen saans leti hai, roshni badal jaati hai, yahan tak ki awaazein ke beech ki khamoshiyaan bhi alag ho jaati hain. Yahi chahta hoon is maafi se: achanak saaf hona nahi, balki dheemi khilaawat. Ek saans. Hamare beech ek alag tarah ki roshni ki shuruaat.` },
  { id: 74, tone: 'poetic', title: 'What the Hands Know', title_hi: 'Haath Kya Jaante Hain', body: `The hands know what the voice forgets: they reach toward warmth without being told, they remember touch without rehearsal. My hands remember you. And what they know — what they reach for, unconsciously, in the quiet — is the honest thing I keep failing to say aloud: I'm sorry. I miss you. Come back.`, body_hi: `Haath woh jaante hain jo awaaz bhool jaati hai: bina bataye hue garmahat ki taraf badhte hain, bina riyaaz ke sparsh yaad rakhte hain. Mere haath tumhein yaad rakhte hain. Aur jo jaante hain — khamoshi mein, anjaan mein, kya dhundhe — woh sachchi baat hai jo keh nahi paata: maafi chahta hoon. Yaad aate ho. Wapas aao.` },
  { id: 75, tone: 'poetic', title: 'A Wound Shaped Like You', title_hi: 'Tumhari Soorat Ka Zakhm', body: `I carry a wound shaped exactly like you — not because you hurt me, but because I hurt the possibility of you, and that absence has your outline. I am learning to stop pressing it. I am learning, instead, to speak it plainly: I was wrong. I'm sorry. You mattered.`, body_hi: `Ek zakhm uthaye chalata hoon bilkul tumhari soorat ka — isliye nahi ki tumne dard diya, balki isliye ki maine tumhari sambhavana ko dard diya, aur us gairahaaziri mein tumhara khaaka hai. Ise dabaana band karna seekh raha hoon. Seedha bolna seekh raha hoon: main galat tha. Maafi chahta hoon. Tum maayane rakhte the.` },
  { id: 76, tone: 'poetic', title: 'The Other Shore', title_hi: 'Doosra Kinara', body: `I can see the other shore from here — the one where this apology is already given, already received, where we've both made sense of what happened and found, if not the same place as before, a new one. I'm building the bridge from my side. I hope you're still on yours.`, body_hi: `Yahan se doosra kinara dikh raha hai — woh jahan yeh maafi pehle se di ja chuki hai, pehle se qabool ho chuki hai, jahan hum dono ne jo hua use samjha aur paaya, agar pehle jaisi jagah nahi to naya. Main apni taraf se pul bana raha hoon. Umeed hai tum abhi bhi apni taraf ho.` },
  { id: 77, tone: 'poetic', title: 'Language of Return', title_hi: 'Wapasi Ki Zabaan', body: `Every language has a word for coming home that means more than location — it means the specific relief of belonging restored, of displacement ended, of the world making sense again. This apology is that word, said in whatever language you need to hear: I was wrong. I'm sorry. I'm returning.`, body_hi: `Har zabaan mein ghar wapas aane ka ek lafz hai jo jagah se zyada kuch kehta hai — woh khaas sukoon kehta hai jab apnepan ki wapasi ho, beparwahi khatam ho, duniya phir se samajh aaye. Yeh maafi wahi lafz hai, jis bhi zabaan mein tumhe sunna ho: main galat tha. Maafi chahta hoon. Wapas aa raha hoon.` },
  { id: 78, tone: 'poetic', title: 'The Architecture of Us', title_hi: 'Hamaari Imaarat', body: `We built something real — I can still see the architecture of it when I close my eyes. I damaged a load-bearing wall through carelessness, through choosing ego over structure. But the foundation is still there. It's always been there. I'm sorry for the damage. Can we still make it whole?`, body_hi: `Humne kuch asli banaya tha — aankhen band karoon to abhi bhi dikh sakti hai uski banawat. Maine ek zaroori deewar nuksaan ki laparwahi se, banawat se pehle guroor chunne se. Par neev abhi bhi wahan hai. Hamesha wahan rahi hai. Nuksan ke liye maafi chahta hoon. Kya hum abhi bhi ise poora kar sakte hain?` },
  { id: 79, tone: 'poetic', title: 'Seasons of Regret', title_hi: 'Pachtawe Ke Mausam', body: `Regret has seasons: the winter of denial, the slow thaw of truth, the spring that comes when you finally see yourself clearly. I'm in the spring of this. I see what I did. I see the cost. And with the particular clarity that comes after cold, I want to say: I'm sorry. I was wrong.`, body_hi: `Pachtawe ke mausam hote hain: inkaar ki sardi, sach ki dheemi pighalawat, woh bahaar jo aati hai jab aakhirkar saaph dikhte ho. Main iss ki bahaar mein hoon. Jo kiya woh dikh raha hai. Qeemat dikh rahi hai. Aur sardi ke baad aane wali khaas spashtata ke saath kehna chahta hoon: maafi chahta hoon. Main galat tha.` },
  { id: 80, tone: 'poetic', title: 'Ghost Light', title_hi: 'Bhoot Wali Roshni', body: `In theater, ghost light is the single bulb left burning after everyone leaves — not darkness, not performance, just presence. An acknowledgment that the stage still exists, that the story isn't over. This apology is my ghost light. The stage isn't dark. I'm still here, if you come back.`, body_hi: `Theater mein, ghost light woh akela bulb hai jo sabke jaane ke baad jalta rehta hai — na andhera, na natak, bas maujoodgi. Ek iqraar ki stage abhi bhi hai, kahani khatam nahi. Yeh maafi meri ghost light hai. Stage andhera nahi hai. Main abhi bhi hoon, agar tum wapas aao.` },
  { id: 81, tone: 'poetic', title: 'The Tide That Returns', title_hi: 'Wapas Aane Wala Suraj', body: `The tide doesn't apologize for leaving — but it always comes back. I'm not the tide. I'm the person who made a choice, and I'm choosing, now, return. Not as inevitability but as intention. I'm sorry for what I carried out with me when I left. I want to bring it back.`, body_hi: `Samundar ka pani maafi nahi maangta jaane ke liye — par hamesha wapas aata hai. Main leher nahi hoon. Main woh insaan hoon jisne chunaav kiya, aur ab wapsi chun raha hoon. Majboori nahi balki iraade se. Jaate waqt jo saath le gaya uske liye maafi chahta hoon. Use wapas laana chahta hoon.` },
  { id: 82, tone: 'poetic', title: 'Before the First Word', title_hi: 'Pehle Lafz Se Pehle', body: `Before the first word of this, I sat with everything — with the weight of what happened, with the specific shape of your disappointment, with the version of me I want to be instead. And when I finally arrived at this page, this moment, the first word that came was: sorry. Every word after is just that, expanded.`, body_hi: `Is ke pehle lafz se pehle, sab ke saath baitha — jo hua uske bojh ke saath, tumhari naumi ki khaas soorat ke saath, jis mujhe banna chahta hoon us ke saath. Aur jab aakhirkar is safhe par, is lamhe par pahuncha, pehla lafz jo aaya: maafi. Baad ke har lafz bas wahi hai, phaaila hua.` },
  { id: 83, tone: 'poetic', title: 'What Light Does to Water', title_hi: 'Roshni Paani Ko Kya Karti Hai', body: `Watch what light does to water: it doesn't just reflect — it refracts, bends, becomes something new in the meeting. That's what I want from honesty between us. Not just my sorry reflecting back unchanged. A refraction. Something new made from the meeting of truth and grace. I'm offering truth. I'm hoping for grace.`, body_hi: `Dekho roshni paani ko kya karti hai: sirf chalkaati nahi — mundti hai, jhukti hai, milne mein kuch naya ban jaati hai. Yahi chahta hoon hamare beech imandaari se. Sirf meri maafi waise hi wapas na aaye. Ek mundaav. Sach aur ehsaan ke milne se kuch naya bana. Sach pesh kar raha hoon. Ehsaan ki umeed hai.` },
  { id: 84, tone: 'poetic', title: 'The Heart Has Its Own Grammar', title_hi: 'Dil Ki Apni Vyakaran Hai', body: `The heart has its own grammar, its own syntax of longing and regret, and mine keeps conjugating the same sentence: I should have known better. I should have loved better. I should have — and didn't — say this sooner. Sorry is the root word. Everything else is conjugation.`, body_hi: `Dil ki apni vyakaran hai, tarsana aur pachtawe ka apna syntax, aur mera baar baar wahi jumla jodhta rehta hai: behtar jaanna chahiye tha. Behtar pyaar karna chahiye tha. Yeh pehle — aur nahi kaha — kehna chahiye tha. Maafi root word hai. Baaki sab conjugation hai.` },

  // RAW (16 cards)
  { id: 85, tone: 'raw', title: 'No Frills', title_hi: 'Koi Sajaawat Nahi', body: `No poetry. No setup. Just: I screwed up. I know exactly how and why and I'm not going to dress it up. I hurt you. I'm sorry. That's it.`, body_hi: `Koi kavita nahi. Koi bhumika nahi. Bas: maine gadbad ki. Bilkul pata hai kaise aur kyun aur sajaoonga nahi ise. Tumhe dard diya. Maafi chahta hoon. Bas itna.` },
  { id: 86, tone: 'raw', title: 'Eating Me Alive', title_hi: 'Andar Se Kha Raha Hai', body: `This is eating me alive. Every day I don't say this, it gets louder. So here: I was wrong. I know it. I knew it then. The fact that I still did it — that's on me, fully, no excuses. I'm sorry.`, body_hi: `Yeh mujhe andar se kha raha hai. Har din jo yeh nahi kehta, aur tez hota jaata hai. Toh yeh lo: main galat tha. Jaanta hoon. Tab bhi jaanta tha. Aur phir bhi kiya — woh mera hai, poora, koi maazrat nahi. Maafi chahta hoon.` },
  { id: 87, tone: 'raw', title: "I Don't Have the Words But Here It Is", title_hi: 'Alfaaz Nahi Hain Par Yeh Lo', body: `I don't have the words, but here it is anyway: I messed up bad. I saw the damage and I froze instead of fixing it, and that freezing made it worse. I'm sorry. I should have been braver.`, body_hi: `Alfaaz nahi hain, par waise bhi yeh lo: bahut buri gadbad ki. Nuksan dekha aur theek karne ki jagah ruk gaya, aur woh rukna aur bura kar gaya. Maafi chahta hoon. Zyada daler hona chahiye tha.` },
  { id: 88, tone: 'raw', title: 'Say It Straight', title_hi: 'Seedha Bolo', body: `Let me say it straight: you deserved better. What I gave you wasn't good enough and I knew that and I kept giving it anyway because changing was hard. That's the ugly truth. I'm sorry. I'm trying to do the hard thing now.`, body_hi: `Seedha kehta hoon: tumhare laayak behtar tha. Jo diya woh kaafi achha nahi tha aur jaanta tha aur deta raha kyunki badlna mushkil tha. Yahi bhaddha sach hai. Maafi chahta hoon. Abhi mushkil kaam karne ki koshish kar raha hoon.` },
  { id: 89, tone: 'raw', title: 'Gutted', title_hi: 'Toot Gaya', body: `I'm gutted. By what I did and by what it cost. I don't know how to be eloquent about it — I just know that losing your good opinion of me is worse than any consequence I imagined. I'm sorry. Genuinely. Without agenda.`, body_hi: `Toot gaya. Jo kiya aur jo lagaa usse. Nahi jaanta ise khubsurti se kaise kahoon — bas jaanta hoon tumhari achhi raay khona har us natije se bura hai jo socha tha. Maafi chahta hoon. Sach mein. Bina kisi iraade ke.` },
  { id: 90, tone: 'raw', title: 'No One to Blame', title_hi: 'Koi Kasoorwaar Nahi', body: `I've tried blaming other things, other circumstances. It doesn't hold. At the end of every story I tell myself, I'm the one who made that choice. Me. I'm sorry. No one else to point to.`, body_hi: `Doosri cheezon ko, doosre haalaton ko dosh dene ki koshish ki. Nahi tiktaa. Har us kahani ke aakhir mein jo khud se kehta hoon, woh chunaav karne wala main hoon. Main. Maafi chahta hoon. Kisi aur ki taraf ungli nahi.` },
  { id: 91, tone: 'raw', title: 'I Knew Better', title_hi: 'Behtar Jaanta Tha', body: `I knew better. That's the thing. I knew better and I didn't do better and I've been trying to make peace with that gap ever since. I can't. So here: I'm sorry. I should have closed the gap when it mattered.`, body_hi: `Behtar jaanta tha. Yahi baat hai. Behtar jaanta tha aur behtar nahi kiya aur tab se us faasle se sulah karne ki koshish kar raha hoon. Nahi kar sakta. Toh yeh lo: maafi chahta hoon. Us faasle ko tab band karna chahiye tha jab maayane rakhta tha.` },
  { id: 92, tone: 'raw', title: "Couldn't Sleep", title_hi: 'Neend Nahi Aayi', body: `I couldn't sleep again. Kept thinking about your face when I said it — that split second before you went quiet. I did that. I'm sorry. I want to take it back and I can't, so the only thing left is: here I am, saying it, finally, out loud.`, body_hi: `Phir neend nahi aayi. Tumhara chehra sochta raha jab woh kaha — woh ek pal pehle khamosh ho gaye. Maine kiya. Maafi chahta hoon. Wapas lena chahta hoon aur nahi le sakta, toh jo ek cheez bachi hai: yahan hoon, keh raha hoon, aakhirkar, zor se.` },
  { id: 93, tone: 'raw', title: 'Just This', title_hi: 'Bas Yeh', body: `I don't have a plan or a speech. Just this: I'm sorry. I failed you. I want to do better. That's the whole thing. No footnotes.`, body_hi: `Mere paas koi yojana ya taqreer nahi hai. Bas yeh: maafi chahta hoon. Tumhara saath choot gaya. Behtar karna chahta hoon. Yahi poori baat hai. Koi foot note nahi.` },
  { id: 94, tone: 'raw', title: 'The Short Version', title_hi: 'Chhota Version', body: `The short version: I was selfish. You paid for it. That's not fair and I know it. I'm sorry. I owe you more than this sentence but the sentence is where I start.`, body_hi: `Chhota version: main swarth tha. Tumne iske liye chukaya. Insaaf nahi tha aur jaanta hoon. Maafi chahta hoon. Tumhara is jumle se zyada haq hai par jumle se hi shuru karta hoon.` },
  { id: 95, tone: 'raw', title: 'Still Here', title_hi: 'Abhi Bhi Hoon', body: `I'm still here. Didn't leave, didn't make excuses, didn't send someone else to say this. I'm here, saying: I was wrong, I'm sorry, I want to fix it. That's all I've got. Is it enough?`, body_hi: `Abhi bhi hoon. Nahi gaya, bahane nahi banaye, kissi aur ko nahi bheja yeh kehne ke liye. Yahan hoon, keh raha hoon: main galat tha, maafi chahta hoon, theek karna chahta hoon. Bas yahi mere paas hai. Kya kaafi hai?` },
  { id: 96, tone: 'raw', title: 'No More Waiting', title_hi: 'Ab Intezaar Nahi', body: `I've been waiting for the right moment and there isn't one, there's just now. So: I'm sorry. What I did was wrong. I don't expect you to say it's fine because it wasn't. I just needed you to hear it from me, clearly, without excuses.`, body_hi: `Sahi waqt ka intezaar kar raha tha aur koi nahi hai, sirf abhi hai. Toh: maafi chahta hoon. Jo kiya woh galat tha. Umeed nahi ki theek tha kahoge kyunki nahi tha. Bas zaroorat thi ki tumhe mere se sunna chahiye tha, saaph, bina bahane ke.` },
  { id: 97, tone: 'raw', title: 'The Part That Hurts', title_hi: 'Jo Hissa Dard Karta Hai', body: `The part that hurts most isn't what you said to me. It's knowing you were right. Knowing I made you feel that way. I'm sorry. You deserved a version of me that was better than what I gave you in that moment.`, body_hi: `Sabse zyada dard dene wala hissa woh nahi hai jo tumne mujhe kaha. Woh yeh jaanna hai ki tum sahi the. Yeh jaanna ki maine tumhe aisa feel karaya. Maafi chahta hoon. Tumhare laayak us pal mujhse behtar tha jo tumhein diya.` },
  { id: 98, tone: 'raw', title: 'Showing Up', title_hi: 'Haazir Hoon', body: `I could have disappeared. Made it easier on myself, convinced myself it would blow over. Instead I'm here. Showing up. Saying: I was wrong and I'm sorry and I'm not going anywhere until I've made it right, or at least tried.`, body_hi: `Ghaib ho sakta tha. Khud pe aasaan kar sakta tha, khud ko mana sakta tha guzar jayega. Iske bajaaye yahan hoon. Haazir hoon. Keh raha hoon: main galat tha aur maafi chahta hoon aur kahin nahi ja raha jab tak theek nahi kar deta, ya kam se kam koshish nahi kar leta.` },
  { id: 99, tone: 'raw', title: 'Dead Honest', title_hi: 'Bilkul Sachcha', body: `Dead honest: I hurt you to protect myself and I dressed it up as something else, and that second layer — the pretending — was worse than the first thing I did. I'm sorry for both. The act and the lie. All of it.`, body_hi: `Bilkul sachcha: tumhe dard diya khud ko bachane ke liye aur ise kuch aur bataya, aur woh doosri parat — woh dikhawa — pehle kiye se bhi bura tha. Dono ke liye maafi chahta hoon. Kaam aur jhooth. Sab kuch.` },
  { id: 100, tone: 'raw', title: 'One Hundred Ways to Say Sorry', title_hi: 'Maafi Maangne Ke Sau Tarike', body: `Out of a hundred ways to say sorry, all of them come down to this: I see what I did. I own it. You matter more than my pride. I'm sorry. Just that. Just completely sorry.`, body_hi: `Maafi maangne ke sau tareekon mein se, sab yahan aake milte hain: jo kiya woh dikh raha hai. Maanta hoon. Tum mere guroor se zyada maayane rakhte ho. Maafi chahta hoon. Bas itna. Poori tarah maafi.` },
]

// ── State ─────────────────────────────────────────────────────────
let activeFilter = 'all'
let activeCard = null
let cardsPremium = false

// ── Init cards on scene enter ─────────────────────────────────────
async function initCardsScene() {
  try {
    const profile = await getProfile()
    cardsPremium = profile?.is_premium ?? false
  } catch { cardsPremium = false }

  // Admin bhi cards dekh sakta hai
  if (window._adminUnlocked) cardsPremium = true

  const lock = document.getElementById('cards-lock')
  if (lock) lock.classList.toggle('hidden', cardsPremium)

  renderCards()
}

// ── Render cards ──────────────────────────────────────────────────
function renderCards() {
  const grid = document.getElementById('apology-grid')
  const query = document.getElementById('cards-search-input')?.value?.toLowerCase() ?? ''
  const lang = window.currentLang || 'en'

  // Tone label mapping
  const toneLabels = {
    en: { tender: 'Tender', passionate: 'Passionate', remorseful: 'Remorseful', hopeful: 'Hopeful', poetic: 'Poetic', raw: 'Raw' },
    hi: { tender: 'Naram', passionate: 'Jazbaati', remorseful: 'Pachtawa', hopeful: 'Umeed', poetic: 'Shayarana', raw: 'Sachcha' }
  }
  const tl = toneLabels[lang] || toneLabels.en
  const openText = lang === 'hi' ? 'Kholo ✦' : 'Open ✦'

  let cards = APOLOGY_CARDS
  if (activeFilter !== 'all') cards = cards.filter(c => c.tone === activeFilter)
  if (query) cards = cards.filter(c => {
    const title = (lang === 'hi' && c.title_hi) ? c.title_hi : c.title
    const body = (lang === 'hi' && c.body_hi) ? c.body_hi : c.body
    return title.toLowerCase().includes(query) ||
      body.toLowerCase().includes(query) ||
      c.tone.toLowerCase().includes(query)
  })

  if (!grid) return
  if (cards.length === 0) {
    grid.innerHTML = `<div class="no-results">${lang === 'hi' ? 'Koi card nahi mila' : 'No cards match your search'}</div>`
    return
  }

  grid.innerHTML = cards.map(c => {
    const title = (lang === 'hi' && c.title_hi) ? c.title_hi : c.title
    const body = (lang === 'hi' && c.body_hi) ? c.body_hi : c.body
    const toneBadge = tl[c.tone] || c.tone
    return `
    <div class="acard tone-${c.tone}" onclick="openCard(${c.id})" title="${title}">
      <div class="acard-num">#${String(c.id).padStart(3, '0')}</div>
      <div class="acard-title">${title}</div>
      <div class="acard-preview">${body}</div>
      <div class="acard-meta">
        <span class="acard-tone-badge badge-${c.tone}">${toneBadge}</span>
        <button class="acard-use-btn" onclick="event.stopPropagation();openCard(${c.id})">${openText}</button>
      </div>
    </div>
  `}).join('')
}

window.filterCards = function () { renderCards() }

window.setCardFilter = function (filter) {
  activeFilter = filter
  document.querySelectorAll('.filter-chip').forEach(b =>
    b.classList.toggle('active', b.dataset.filter === filter)
  )
  renderCards()
}

// ── Open / close modal ────────────────────────────────────────────
window.openCard = function (id) {
  const card = APOLOGY_CARDS.find(c => c.id === id)
  if (!card) return
  activeCard = card

  const lang = window.currentLang || 'en'
  const toneLabels = { en: { tender: 'Tender', passionate: 'Passionate', remorseful: 'Remorseful', hopeful: 'Hopeful', poetic: 'Poetic', raw: 'Raw' }, hi: { tender: 'Naram', passionate: 'Jazbaati', remorseful: 'Pachtawa', hopeful: 'Umeed', poetic: 'Shayarana', raw: 'Sachcha' } }
  const tl = toneLabels[lang] || toneLabels.en
  const toneName = tl[card.tone] || card.tone
  const title = (lang === 'hi' && card.title_hi) ? card.title_hi : card.title
  const body = (lang === 'hi' && card.body_hi) ? card.body_hi : card.body

  document.getElementById('modal-num').textContent = `Card #${String(id).padStart(3, '0')} · ${toneName}`
  document.getElementById('modal-title').textContent = title
  document.getElementById('modal-body').textContent = body

  document.getElementById('card-modal-backdrop').classList.add('open')
  document.body.style.overflow = 'hidden'
}

window.closeCardModal = function (e) {
  if (e.target === document.getElementById('card-modal-backdrop')) closeCardModalDirect()
}

window.closeCardModalDirect = function () {
  document.getElementById('card-modal-backdrop').classList.remove('open')
  document.body.style.overflow = ''
}

// ── Use card → fill create form ───────────────────────────────────
window.useCardInCreate = function () {
  if (!activeCard) return
  const msgArea = document.getElementById('f-msg')
  if (msgArea) {
    msgArea.value = activeCard.body
    // trigger char counter
    msgArea.dispatchEvent(new Event('input'))
  }
  // Set matching tone
  const toneBtn = document.querySelector(`.tone-btn[data-tone="${activeCard.tone}"]`)
  if (toneBtn) {
    document.querySelectorAll('.tone-btn').forEach(b => b.classList.remove('active'))
    toneBtn.classList.add('active')
    selectedTone = activeCard.tone
  }
  closeCardModalDirect()
  goScene(1)
  showToast(`✦ Card "${activeCard.title}" loaded — customize it!`)
}

// ── Copy card text ────────────────────────────────────────────────
window.copyCardText = async function () {
  if (!activeCard) return
  try {
    await navigator.clipboard.writeText(activeCard.body)
    showToast('✦ Card text copied to clipboard')
  } catch {
    showToast('Copy failed — select text manually')
  }
}

// ── Intercept goScene to init cards when entering scene 5 ─────────
const _origGoScene = window.goScene
window.goScene = function (idx) {
  _origGoScene(idx)
  if (idx === 5) setTimeout(initCardsScene, 400)
}