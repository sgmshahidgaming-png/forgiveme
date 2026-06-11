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
import { autoFillMessage, generateStoryMessage } from './lib/ai.js'

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

  if (btn) {
    btn.textContent = '✦ AI is writing…'
    btn.disabled = true
    btn.classList.add('generating')
  }

  try {
    await autoFillMessage({
      recipientName: recipientName || 'them',
      senderName: senderName || 'me',
      tone: selectedTone,
      context,
      textareaId: 'f-msg'
    })
    showToast('✦ Your story has been written by AI')
  } catch (err) {
    showToast('AI generation failed — please write manually')
    console.error(err)
  } finally {
    isGeneratingAI = false
    if (btn) {
      btn.textContent = '✦ AI Write For Me'
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
      document.getElementById('memory-tape').appendChild(img)
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
      goScene(3)
      showToast('✦ Your free stories are used — upgrade to continue')
      return
    }

    document.getElementById('prev-to').textContent = recipientName
    document.getElementById('prev-from').textContent = senderName
    document.getElementById('prev-body').textContent = message
    document.getElementById('share-link').textContent = result.shareUrl
    currentShareUrl = result.shareUrl

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
    document.getElementById('admin-lock').style.display = 'none'
    document.getElementById('admin-panel').classList.add('visible')
    adminLog('✦ Logged in as admin')
    adminLoadRecentStories()
    adminLoadStats()
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
  { id: 1, tone: 'tender', title: 'The Weight of Silence', body: `I've been sitting with so many things I should have said to you — words that kept dissolving before I could speak them. This isn't about excuses. This is me, finally, holding open the door I kept closing. I'm sorry for every moment my silence made you feel alone when I was standing right there.` },
  { id: 2, tone: 'tender', title: 'Soft and Certain', body: `There are apologies that arrive like thunder, and there are ones like this — quiet, steady, certain. I was wrong. Not in the way that asks for your immediate forgiveness, but in the way that asks for the chance to be better. I'll wait as long as that takes. You're worth the patience.` },
  { id: 3, tone: 'tender', title: 'All the Small Things', body: `It wasn't one big thing. It was the small absences — the times I looked at my phone when you were talking, the sighs that said everything I shouldn't have, the way I made you feel smaller to make room for my own noise. I'm sorry for all of it. Every quiet wound.` },
  { id: 4, tone: 'tender', title: 'I Came Back', body: `I don't have flowers or speeches. I just have this: I thought about everything, and I came back. Not because it's easy, but because you matter more than my pride, more than my fear, more than the version of myself that doesn't know how to say I'm sorry.` },
  { id: 5, tone: 'tender', title: 'Your Name in My Chest', body: `Your name has been living in my chest like a bruise I keep pressing — not to hurt myself, but to remember what I'm missing. I miss you. I was wrong. And I'm learning, slowly, how to be someone who says that before it's too late.` },
  { id: 6, tone: 'tender', title: 'The Quiet After', body: `In the quiet after everything, I keep returning to the same truth: I let you down. Not because I stopped caring, but because I forgot to show it in ways that reached you. That's on me. I'm sorry, and I want to do better — if you'll let me.` },
  { id: 7, tone: 'tender', title: 'What I Should Have Said', body: `The thing I should have said, and didn't, was simple: I hear you. I see you. You're not too much — I just didn't know how to hold everything you were offering me. I'm sorry I made you feel like your feelings were a burden. They were never that.` },
  { id: 8, tone: 'tender', title: 'A Gentle Truth', body: `Here is a gentle truth: I was afraid. Afraid of saying the wrong thing, of making it worse — and in that fear, I made it worse anyway. I froze when you needed me to move. I'm sorry. Next time, I choose you over my own discomfort.` },
  { id: 9, tone: 'tender', title: 'The Space Between Us', body: `The space between us felt like a country I created. I built it from small dismissals and borrowed distances, and I'm sorry for every stone I laid there. I want to take them apart, one by one, if you'll show me which ones hurt the most.` },
  { id: 10, tone: 'tender', title: 'Held Breath', body: `I've been holding my breath since that day — waiting for the moment I could say this clearly, quietly, without drama: I'm sorry. You deserved more from me than what I gave, and I know that now in a way I didn't then. I'm breathing again. I hope you are too.` },
  { id: 11, tone: 'tender', title: 'The Version of Me You Deserve', body: `The version of me you fell for is still here. The one who listened, who showed up, who cared about the details — that person just got lost for a while. I'm finding my way back. Not for a second chance necessarily. Just to be, again, someone you can be proud of knowing.` },
  { id: 12, tone: 'tender', title: "The Way You Look When You're Hurt", body: `I memorized the way you look when you're hurt — and I've been carrying that image like a debt. I owe you more than this apology, but it's where I start. With honesty. With care. With the simple, unflinching admission that I hurt you, and I hate that I did.` },
  { id: 13, tone: 'tender', title: 'Still and True', body: `Apologies can be loud things — full of gestures and noise. This one is still and true: I was careless with something precious. You. And I'm sorry in the marrow-deep, before-sleep way that doesn't ask for anything back. Just offered, quietly, with both hands open.` },
  { id: 14, tone: 'tender', title: 'For What I Couldn\'t Say', body: `For every time I swallowed words that needed to come out — for every door I walked through alone when I should have held it open — for every glance I gave my fears instead of giving you my full self: I'm sorry. You never deserved to translate my silence.` },
  { id: 15, tone: 'tender', title: 'A Letter I Kept Rewriting', body: `I've written this a hundred times in my head and deleted it. Not because I didn't mean it, but because I was afraid the words would be wrong. They might still be. But I'd rather give you imperfect honesty than perfect silence: I miss you, I was wrong, and I'm sorry.` },
  { id: 16, tone: 'tender', title: 'The Same Heart', body: `It's the same heart that loved you then — just a little cracked from what I put it through when I chose badly. I'm not asking you to fix it. I'm just letting you know: it still beats for you, stubborn and steady, with something I can only call sorry.` },
  { id: 17, tone: 'tender', title: 'Morning Light', body: `In the morning light, things look clearer than they do in the dark of arguments and pride. I see clearly now: I was wrong. You gave me grace I didn't earn, and I repaid it with distance. I'm sorry. Today is the day I say that out loud, in the daylight, where it counts.` },

  // PASSIONATE (17 cards)
  { id: 18, tone: 'passionate', title: 'A Fire I Can\'t Put Out', body: `There's a fire in me that won't go out — it's everything I never said, all the "I'm sorry" I let burn instead of speak. I love you with a force that terrifies me, and I let that fear turn into cruelty. I'm done being a coward. I want you. I'm sorry. I choose you.` },
  { id: 19, tone: 'passionate', title: 'I Can\'t Let This Be the End', body: `I refuse to let this be the end of us. Not like this — not over something I could have prevented with honesty and courage. You are not replaceable. You are not forgettable. You are the thing I keep fighting my way back to, even when I'm the one who left. I'm sorry. Come back.` },
  { id: 20, tone: 'passionate', title: 'Raw and Relentless', body: `I'm not going to dress this up: I messed up. I knew what I was doing and I did it anyway and the moment it was done I knew I'd be chasing this feeling — this hollow, aching regret — forever. I don't want forever to feel like this. I want it to feel like you.` },
  { id: 21, tone: 'passionate', title: 'The Loudest Silence', body: `You went quiet and it was louder than anything you've ever said. I felt it in my bones — that silence that says I went too far, that silence I caused. I'm sorry with everything in me. I would unmake the moment if I could. Since I can't, I'm here, asking you to let me remake us.` },
  { id: 22, tone: 'passionate', title: 'Burning Through', body: `I'm burning through all my careful words because this isn't the time for careful. This is the time for: I was wrong, I was selfish, and losing you feels like losing the best version of the world. So here I am, uncareful and desperate, asking you to stay. Please.` },
  { id: 23, tone: 'passionate', title: 'No One Else', body: `I've tried imagining moving on. The math doesn't work — there's no version of my future that feels real without you in it. That's not pressure, it's truth. I love you with the kind of love that doesn't negotiate with regret. I'm sorry. I'm not going anywhere. Are you?` },
  { id: 24, tone: 'passionate', title: 'The Argument I Lost in My Head', body: `I had the argument with myself a hundred times: was I wrong? Should I apologize? And every single time, the answer came back the same: yes. You were right. I was protecting ego instead of protecting us. That ends now. I choose us. I always should have.` },
  { id: 25, tone: 'passionate', title: 'Your Name at 3am', body: `At 3am your name is the loudest thing in the room. It's the first thing I think and the last thing I fight against sleeping, because sleeping means another day without fixing this — without reaching you and saying: I was wrong, I love you, and I'm sorry for every moment I made you doubt that.` },
  { id: 26, tone: 'passionate', title: 'All of It', body: `I want all of it back — every stupid fight, every moment of grace you gave me that I didn't deserve, every time you laughed at something I said and I felt like the luckiest person alive. I want all of it back. I'm sorry I made you question whether it was worth it. It is. You are.` },
  { id: 27, tone: 'passionate', title: 'Too Much, Never Enough', body: `I was too much of the wrong things and not enough of the right ones. Too proud, not present enough. Too loud in the wrong moments, too silent in the ones that needed my voice. I'm sorry. The version of me you fell in love with is still here — fighting to be the one you see right now.` },
  { id: 28, tone: 'passionate', title: 'I Am Here', body: `I am here. Not strategically, not carefully — just here, with everything I have. With an apology that isn't performed but felt. With love that hasn't gone anywhere even when I made you question it. With the simple, overwhelming fact that you are worth fighting for. And I'm sorry I made you feel otherwise.` },
  { id: 29, tone: 'passionate', title: 'The Heart Remembers', body: `The heart remembers what the mind wants to protect. Mine keeps returning to you — every defense I built falls when I'm alone and honest. I was wrong. I was scared. I was selfish. But my heart, stripped of all that, still only knows one thing: you. I'm sorry I made you question that.` },
  { id: 30, tone: 'passionate', title: 'I Can Do Better', body: `I can do better. I know that now in a way I didn't before — in the aching, certain way of someone who has seen the alternative and rejected it completely. I don't want a world where I wasn't worth fighting for. I want to be worthy. I'm sorry. Let me prove it.` },
  { id: 31, tone: 'passionate', title: 'Unfinished Story', body: `We're not finished. I refuse that. Not when there's still so much I haven't shown you — so many mornings and arguments-turned-to-laughing and moments where I get it right. I haven't earned those yet. I'm still earning them. I'm sorry. Stay long enough to see who I'm becoming.` },
  { id: 32, tone: 'passionate', title: 'This Is Me Choosing', body: `This is me, standing here, choosing. Not the easy path of silence, not the prideful exit — choosing you. Choosing the hard work of repair, choosing honesty over ego, choosing this: I was wrong, I'm sorry, and I want us more than I've ever wanted anything comfortable.` },
  { id: 33, tone: 'passionate', title: 'What You Do to Me', body: `You should know what you do to me — the way I become more myself around you, and the specific ways losing that unmakes me. I became someone I don't recognize when I let my fear drive. I'm sorry. The real me — the one that loves you right — is here now. He's not leaving again.` },
  { id: 34, tone: 'passionate', title: 'The Distance I Made', body: `I made the distance. It wasn't fate or bad timing — I made it, choice by choice, silence by silence, and I watched it grow without stopping it. I'm stopping it now. Right here, right now, with everything I have: I love you, I'm sorry, and I'm done letting distance be the place I live.` },

  // REMORSEFUL (17 cards)
  { id: 35, tone: 'remorseful', title: 'No Defense Left', body: `I'm not here to defend myself. There is no defense — what I did was wrong, and every explanation I could offer would just be another way of not fully owning it. So here it is, without decoration: I hurt you. I'm responsible for that. And I'm truly, deeply sorry.` },
  { id: 36, tone: 'remorseful', title: 'The Weight of What I Did', body: `I sit with the weight of what I did every day. It doesn't get lighter. I don't want it to — not yet. Because the weight reminds me that I caused something real, that my actions had consequences I didn't have the right to ignore. I'm sorry. Not to feel better. Just because it's true.` },
  { id: 37, tone: 'remorseful', title: 'I Don\'t Expect Forgiveness', body: `I'm not writing this expecting forgiveness. I'm writing it because you deserve to hear — without my ego getting in the way — that what I did was wrong. You were right to be hurt. You were right to be angry. And I should have said this much sooner, without conditions or caveats.` },
  { id: 38, tone: 'remorseful', title: 'The Truth About What I Did', body: `The truth is I knew it was wrong when I did it. Not after — during. And I did it anyway, and that's the part that keeps me up at night. Not the consequences. The choice. I made a choice that hurt you, knowing it would. I'm sorry in the deepest, most uncomfortable way possible.` },
  { id: 39, tone: 'remorseful', title: 'Accountable', body: `I'm holding myself accountable — not because you asked me to, but because it's the only honest thing left to do. I failed you. I failed what we had. I failed my own standards. That's mine to carry. I just needed you to know that I see it clearly, and I'm sorry without conditions.` },
  { id: 40, tone: 'remorseful', title: 'The Moments I Can\'t Take Back', body: `There are moments I can't take back — I know that. I'm not asking you to pretend they didn't happen or that they don't matter. They do. They happened. And my apology doesn't erase them. It just says: I see them. I own them. They were wrong. And I'm sorry you had to live through them.` },
  { id: 41, tone: 'remorseful', title: 'What I Owe You', body: `What I owe you is not a performance of remorse — it's honesty. So here it is: I was selfish. I prioritized the wrong things. I dismissed what you were trying to tell me and called it "perspective" when really it was just my inability to hear anything that challenged my comfort. I'm sorry.` },
  { id: 42, tone: 'remorseful', title: 'I Was Wrong, Full Stop', body: `I was wrong. No "but", no "however", no "in fairness". Just: wrong. The kind of wrong that doesn't get mitigated by context or explanation or the good things I also did. This was wrong. You were hurt. That's the whole sentence. And I'm sorry for every word of it.` },
  { id: 43, tone: 'remorseful', title: 'Looking Back', body: `Looking back, I can trace every moment I chose myself over you and called it something else — called it protecting the relationship, called it honesty, called it space. It was selfishness dressed up in reasonable language. I know that now. I'm sorry it took me so long to stop dressing it up.` },
  { id: 44, tone: 'remorseful', title: 'The Apology You Should Have Had', body: `This is the apology you should have had weeks ago — the one that doesn't ask for anything in return, doesn't position me as the victim of my own mistakes, doesn't minimize what happened with context you didn't ask for. Just: I hurt you. That was wrong. I'm sorry.` },
  { id: 45, tone: 'remorseful', title: 'I Broke Something Precious', body: `I broke something precious, and the fact that I didn't mean to doesn't make it less broken. It just means I have to live with knowing that carelessness can cause the same damage as intention. I was careless with something irreplaceable. I'm sorry. That's real and it matters.` },
  { id: 46, tone: 'remorseful', title: 'No More Justifications', body: `I'm done justifying. Every justification I've ever offered you was just another way of making my comfort more important than your pain. It's not. You were right to feel what you felt. You're right to still feel it. And I'm sorry — clearly, completely, without the asterisk of explanation.` },
  { id: 47, tone: 'remorseful', title: 'The Cost', body: `I understand the cost now — not theoretically, but viscerally. The cost of what I did, the cost of my choices, the cost of prioritizing the wrong things at the wrong time. I wish I had understood it sooner. I'm sorry I needed the loss to see the value clearly.` },
  { id: 48, tone: 'remorseful', title: 'Owning It', body: `I'm owning it — every bit of it. Not because someone told me to, not because it's the "mature" thing. Because you deserve to hear it, once, clearly, without me flinching from the specifics: I was wrong to do that. It hurt you. I knew better and didn't do better. I'm sorry.` },
  { id: 49, tone: 'remorseful', title: 'What My Pride Cost Us', body: `My pride cost us something we can't get back, and I'm sitting with that. The specific shape of what we lost has my fingerprints on it — mine, not ours. I did that. And I'm sorry in the way that doesn't reach for the past or demand a future, just stands here, honest, in the present.` },
  { id: 50, tone: 'remorseful', title: 'I Hear You', body: `I hear you. I know I didn't before — not really — but I do now. I understand what you were trying to tell me, and I understand why it hurt when I didn't listen. You were right. I was wrong. And the only thing left that matters is that you know I finally, fully, hear you.` },
  { id: 51, tone: 'remorseful', title: 'A Better Accounting', body: `Here is a better accounting of what happened: you trusted me, I took that for granted, I made choices that broke that trust, and I let too much time pass before saying any of this. That's the true version. I'm sorry it took me this long to offer it to you plainly.` },

  // HOPEFUL (17 cards)
  { id: 52, tone: 'hopeful', title: 'Still Believing', body: `I still believe in what we built — not blindly, not ignoring what happened, but with the specific, stubborn faith of someone who has seen what we're capable of when we're at our best. I'm sorry for the ways I contributed to our worst. I believe we can find our way back. I'm holding the door.` },
  { id: 53, tone: 'hopeful', title: 'A Door I\'m Holding Open', body: `This apology isn't a closing statement — it's a door I'm holding open. I was wrong, and I'm sorry, and I believe that's not where the story has to end. There's a version of us on the other side of this moment that I'm still working toward. Are you?` },
  { id: 54, tone: 'hopeful', title: 'What Could Still Be', body: `I'm not trying to undo what happened. I'm asking you to help me build what could still be — something better, something we make consciously, with the specific knowledge of what we should have done differently. I'm sorry. And I'm hopeful, if that means anything.` },
  { id: 55, tone: 'hopeful', title: 'Growing Season', body: `They say some things have to break before they can grow — I'm hoping that's true for us. I'm sorry for the breaking. I've been doing the growing. And if you're willing to water this alongside me, I think we could become something neither of us has seen yet: what we were always supposed to be.` },
  { id: 56, tone: 'hopeful', title: 'The Morning After', body: `Every morning after a hard night, something small is possible again — coffee, sunlight, the beginning of a different conversation. I'm not asking for everything back at once. Just for the morning version: small, quiet, possible. I'm sorry. I'm still here. I'm still hoping.` },
  { id: 57, tone: 'hopeful', title: 'I\'ve Been Thinking', body: `I've been thinking about who I want to be — not just for you, but in general. And the person I want to be would have said this sooner: I was wrong. I'm sorry. And I want to build something new with you, if you're open to it. Not the same as before. Better. Chosen, this time, on purpose.` },
  { id: 58, tone: 'hopeful', title: 'Not the End', body: `I know it feels like an ending. But I've been watching closely — the way you still answer my messages, the way you still laugh at the things I say — and I think we both know this isn't over. I'm sorry for the damage I did. I believe the foundation is still there.` },
  { id: 59, tone: 'hopeful', title: 'The Life We Could Have', body: `Somewhere in the future, there's a version of our life I want us to actually live — not just imagine as a consolation. I want that future badly enough to be fully honest now: I was wrong, I'm sorry, and I'm willing to do the work to make it possible.` },
  { id: 60, tone: 'hopeful', title: 'Learning to Be Better', body: `I've been learning how to be better — not as a performance for you, but because I looked at myself clearly and didn't like what I saw. That process isn't finished. But it started because of you, because of this. I'm sorry. I'm grateful for the hard lesson. I want to show you the results.` },
  { id: 61, tone: 'hopeful', title: 'Still Possible', body: `There are things that are still possible between us, if we choose them. That's what I keep coming back to: choice. I made wrong ones. I'm choosing differently now — starting with honesty, starting with sorry, starting with the belief that we are still possible.` },
  { id: 62, tone: 'hopeful', title: 'I Changed', body: `I changed. I know that might sound hollow right now, but it's true — and I changed because losing you (or the possibility of you) showed me exactly what I was doing wrong. I'm sorry. The version of me that hurt you is still learning. But he's learning fast, and he hasn't stopped thinking about you.` },
  { id: 63, tone: 'hopeful', title: 'Repair', body: `I believe in repair. Not erasure — not pretending it didn't happen — but the specific work of looking at what broke and asking: can this be made better? I think it can. I think we can. I'm sorry for the breaking. I'm ready for the repair, if you are.` },
  { id: 64, tone: 'hopeful', title: 'A Different Kind of Start', body: `I don't want to start over — I want to start differently. With honesty from the beginning. With the kind of communication I should have had all along. I'm sorry for the learning curve. But I've learned. And I'm wondering if you'd let me show you what that looks like.` },
  { id: 65, tone: 'hopeful', title: 'Both of Us Together', body: `The thing that keeps bringing me back is this: none of the good things in my life feel as good without someone to share them with. And the person I want to share them with is you. I'm sorry for the distance I created. I want to close it. Together.` },
  { id: 66, tone: 'hopeful', title: 'Forward, Not Back', body: `I'm not asking us to go back — back to before, to the way things were. I'm asking us to go forward: toward the version of this where we've both grown, where I've proven I mean what I say, where the apology became real change. I'm sorry. I believe in forward.` },
  { id: 67, tone: 'hopeful', title: 'The Best Part of Knowing You', body: `The best part of knowing you has always been the possibility of more — more mornings, more honesty, more becoming. I almost threw that away. I'm sorry. I didn't fully see what I had until I started losing it. Now I see. And I want to spend whatever time you'll give me proving it.` },
  { id: 68, tone: 'hopeful', title: 'Slowly, If That\'s What It Takes', body: `Slowly — if that's what it takes. I'll take slowly. I'll take small steps and earned trust and the gradual rebuilding of something I damaged by moving too fast in the wrong direction. I'm sorry. Take all the time you need. I'll be here, working, hoping, growing. Slowly.` },

  // POETIC (16 cards)
  { id: 69, tone: 'poetic', title: 'The Space Between Stars', body: `Between stars, there is no void — there is only distance waiting to collapse. That's what I think of us: not nothing, but unresolved. I have been learning the language of my own wreckage, and the first fluent sentence is this: I was wrong. I am sorry. The distance between us was my making, and I want to unmake it.` },
  { id: 70, tone: 'poetic', title: 'Cartography of Regret', body: `I have mapped every point where I went wrong — a cartography of small disasters and large silences, each one marked in the ink of what I should have said. You deserved better navigation. You deserved a guide who didn't lose the way. I'm sorry. I'm learning to read the stars.` },
  { id: 71, tone: 'poetic', title: 'The River Remembers', body: `The river remembers every rock it has moved and every shore it has carved — it carries the evidence of everywhere it has been. I carry the evidence of you: of what I had, and what I wasted, and the specific shape of the apology I owe you. Consider this the river returning to its source.` },
  { id: 72, tone: 'poetic', title: 'Dusk Language', body: `There is a language spoken only at dusk — softer than day, more honest than night, the light that makes ordinary things look like what they always were: precious. In that light, I see you clearly. I see what I did. I see the sorry that was always there, waiting for me to be brave enough to say it.` },
  { id: 73, tone: 'poetic', title: 'After the Rain', body: `After rain, something opens — the earth exhales, the light changes, even the silences between sounds become different. That's what I want from this apology: not a sudden clearing, but a slow opening. An exhale. The beginning of a different kind of light between us.` },
  { id: 74, tone: 'poetic', title: 'What the Hands Know', body: `The hands know what the voice forgets: they reach toward warmth without being told, they remember touch without rehearsal. My hands remember you. And what they know — what they reach for, unconsciously, in the quiet — is the honest thing I keep failing to say aloud: I'm sorry. I miss you. Come back.` },
  { id: 75, tone: 'poetic', title: 'A Wound Shaped Like You', body: `I carry a wound shaped exactly like you — not because you hurt me, but because I hurt the possibility of you, and that absence has your outline. I am learning to stop pressing it. I am learning, instead, to speak it plainly: I was wrong. I'm sorry. You mattered.` },
  { id: 76, tone: 'poetic', title: 'The Other Shore', body: `I can see the other shore from here — the one where this apology is already given, already received, where we've both made sense of what happened and found, if not the same place as before, a new one. I'm building the bridge from my side. I hope you're still on yours.` },
  { id: 77, tone: 'poetic', title: 'Language of Return', body: `Every language has a word for coming home that means more than location — it means the specific relief of belonging restored, of displacement ended, of the world making sense again. This apology is that word, said in whatever language you need to hear: I was wrong. I'm sorry. I'm returning.` },
  { id: 78, tone: 'poetic', title: 'The Architecture of Us', body: `We built something real — I can still see the architecture of it when I close my eyes. I damaged a load-bearing wall through carelessness, through choosing ego over structure. But the foundation is still there. It's always been there. I'm sorry for the damage. Can we still make it whole?` },
  { id: 79, tone: 'poetic', title: 'Seasons of Regret', body: `Regret has seasons: the winter of denial, the slow thaw of truth, the spring that comes when you finally see yourself clearly. I'm in the spring of this. I see what I did. I see the cost. And with the particular clarity that comes after cold, I want to say: I'm sorry. I was wrong.` },
  { id: 80, tone: 'poetic', title: 'Ghost Light', body: `In theater, ghost light is the single bulb left burning after everyone leaves — not darkness, not performance, just presence. An acknowledgment that the stage still exists, that the story isn't over. This apology is my ghost light. The stage isn't dark. I'm still here, if you come back.` },
  { id: 81, tone: 'poetic', title: 'The Tide That Returns', body: `The tide doesn't apologize for leaving — but it always comes back. I'm not the tide. I'm the person who made a choice, and I'm choosing, now, return. Not as inevitability but as intention. I'm sorry for what I carried out with me when I left. I want to bring it back.` },
  { id: 82, tone: 'poetic', title: 'Before the First Word', body: `Before the first word of this, I sat with everything — with the weight of what happened, with the specific shape of your disappointment, with the version of me I want to be instead. And when I finally arrived at this page, this moment, the first word that came was: sorry. Every word after is just that, expanded.` },
  { id: 83, tone: 'poetic', title: 'What Light Does to Water', body: `Watch what light does to water: it doesn't just reflect — it refracts, bends, becomes something new in the meeting. That's what I want from honesty between us. Not just my sorry reflecting back unchanged. A refraction. Something new made from the meeting of truth and grace. I'm offering truth. I'm hoping for grace.` },
  { id: 84, tone: 'poetic', title: 'The Heart Has Its Own Grammar', body: `The heart has its own grammar, its own syntax of longing and regret, and mine keeps conjugating the same sentence: I should have known better. I should have loved better. I should have — and didn't — say this sooner. Sorry is the root word. Everything else is conjugation.` },

  // RAW (16 cards)
  { id: 85, tone: 'raw', title: 'No Frills', body: `No poetry. No setup. Just: I screwed up. I know exactly how and why and I'm not going to dress it up. I hurt you. I'm sorry. That's it.` },
  { id: 86, tone: 'raw', title: 'Eating Me Alive', body: `This is eating me alive. Every day I don't say this, it gets louder. So here: I was wrong. I know it. I knew it then. The fact that I still did it — that's on me, fully, no excuses. I'm sorry.` },
  { id: 87, tone: 'raw', title: 'I Don\'t Have the Words But Here It Is', body: `I don't have the words, but here it is anyway: I messed up bad. I saw the damage and I froze instead of fixing it, and that freezing made it worse. I'm sorry. I should have been braver.` },
  { id: 88, tone: 'raw', title: 'Say It Straight', body: `Let me say it straight: you deserved better. What I gave you wasn't good enough and I knew that and I kept giving it anyway because changing was hard. That's the ugly truth. I'm sorry. I'm trying to do the hard thing now.` },
  { id: 89, tone: 'raw', title: 'Gutted', body: `I'm gutted. By what I did and by what it cost. I don't know how to be eloquent about it — I just know that losing your good opinion of me is worse than any consequence I imagined. I'm sorry. Genuinely. Without agenda.` },
  { id: 90, tone: 'raw', title: 'No One to Blame', body: `I've tried blaming other things, other circumstances. It doesn't hold. At the end of every story I tell myself, I'm the one who made that choice. Me. I'm sorry. No one else to point to.` },
  { id: 91, tone: 'raw', title: 'I Knew Better', body: `I knew better. That's the thing. I knew better and I didn't do better and I've been trying to make peace with that gap ever since. I can't. So here: I'm sorry. I should have closed the gap when it mattered.` },
  { id: 92, tone: 'raw', title: 'Couldn\'t Sleep', body: `I couldn't sleep again. Kept thinking about your face when I said it — that split second before you went quiet. I did that. I'm sorry. I want to take it back and I can't, so the only thing left is: here I am, saying it, finally, out loud.` },
  { id: 93, tone: 'raw', title: 'Just This', body: `I don't have a plan or a speech. Just this: I'm sorry. I failed you. I want to do better. That's the whole thing. No footnotes.` },
  { id: 94, tone: 'raw', title: 'The Short Version', body: `The short version: I was selfish. You paid for it. That's not fair and I know it. I'm sorry. I owe you more than this sentence but the sentence is where I start.` },
  { id: 95, tone: 'raw', title: 'Still Here', body: `I'm still here. Didn't leave, didn't make excuses, didn't send someone else to say this. I'm here, saying: I was wrong, I'm sorry, I want to fix it. That's all I've got. Is it enough?` },
  { id: 96, tone: 'raw', title: 'No More Waiting', body: `I've been waiting for the right moment and there isn't one, there's just now. So: I'm sorry. What I did was wrong. I don't expect you to say it's fine because it wasn't. I just needed you to hear it from me, clearly, without excuses.` },
  { id: 97, tone: 'raw', title: 'The Part That Hurts', body: `The part that hurts most isn't what you said to me. It's knowing you were right. Knowing I made you feel that way. I'm sorry. You deserved a version of me that was better than what I gave you in that moment.` },
  { id: 98, tone: 'raw', title: 'Showing Up', body: `I could have disappeared. Made it easier on myself, convinced myself it would blow over. Instead I'm here. Showing up. Saying: I was wrong and I'm sorry and I'm not going anywhere until I've made it right, or at least tried.` },
  { id: 99, tone: 'raw', title: 'Dead Honest', body: `Dead honest: I hurt you to protect myself and I dressed it up as something else, and that second layer — the pretending — was worse than the first thing I did. I'm sorry for both. The act and the lie. All of it.` },
  { id: 100, tone: 'raw', title: 'One Hundred Ways to Say Sorry', body: `Out of a hundred ways to say sorry, all of them come down to this: I see what I did. I own it. You matter more than my pride. I'm sorry. Just that. Just completely sorry.` },
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

  let cards = APOLOGY_CARDS
  if (activeFilter !== 'all') cards = cards.filter(c => c.tone === activeFilter)
  if (query) cards = cards.filter(c =>
    c.title.toLowerCase().includes(query) ||
    c.body.toLowerCase().includes(query) ||
    c.tone.toLowerCase().includes(query)
  )

  if (!grid) return
  if (cards.length === 0) {
    grid.innerHTML = '<div class="no-results">No cards match your search</div>'
    return
  }

  grid.innerHTML = cards.map(c => `
    <div class="acard tone-${c.tone}" onclick="openCard(${c.id})" title="${c.title}">
      <div class="acard-num">#${String(c.id).padStart(3, '0')}</div>
      <div class="acard-title">${c.title}</div>
      <div class="acard-preview">${c.body}</div>
      <div class="acard-meta">
        <span class="acard-tone-badge badge-${c.tone}">${c.tone}</span>
        <button class="acard-use-btn" onclick="event.stopPropagation();openCard(${c.id})">Open ✦</button>
      </div>
    </div>
  `).join('')
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

  document.getElementById('modal-num').textContent = `Card #${String(id).padStart(3, '0')} · ${card.tone}`
  document.getElementById('modal-title').textContent = card.title
  document.getElementById('modal-body').textContent = card.body

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