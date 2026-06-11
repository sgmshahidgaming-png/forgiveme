/**
 * Forgivemе — AI Story Generation
 * Calls /api/ai-generate (server-side Anthropic proxy) for production.
 * Falls back to built-in curated messages if the API is unavailable.
 */

const API_BASE = import.meta.env.VITE_API_URL || ''

// Get current language
function getCurrentLang() {
  return localStorage.getItem('lang') || 'hi'
}

/**
 * Generate an AI story message
 */
export async function generateStoryMessage({ recipientName, senderName, tone = 'tender', context = '' }) {
  const lang = getCurrentLang()
  try {
    const res = await fetch(`${API_BASE}/api/ai-generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ recipientName, senderName, tone, context, lang })
    })

    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = await res.json()
    if (data.error && data.fallback) throw new Error(data.error)
    return data.message
  } catch (err) {
    console.warn('AI API unavailable, using curated fallback:', err.message)
    return fallbackMessage(tone, recipientName, senderName, lang)
  }
}

/**
 * Auto-fill the message textarea with AI-generated content
 */
export async function autoFillMessage({ recipientName, senderName, tone, context, textareaId = 'f-msg' }) {
  const textarea = document.getElementById(textareaId)
  if (!textarea) return

  const lang = getCurrentLang()
  textarea.value       = ''
  textarea.placeholder = lang === 'hi' ? 'AI aapki kahani likh raha hai…' : 'AI is crafting your story…'
  textarea.disabled    = true

  textarea.style.transition  = 'border-color .4s'
  textarea.style.borderColor = 'rgba(124,58,237,.5)'

  try {
    const message = await generateStoryMessage({ recipientName, senderName, tone, context })

    textarea.placeholder = lang === 'hi' ? 'Woh likho jo dil mein tha…' : 'Write what you\'ve been meaning to say…'
    textarea.style.borderColor = 'rgba(212,168,92,.4)'

    let i = 0
    const chars = message.split('')
    function typeNext() {
      if (i < chars.length) {
        textarea.value += chars[i++]
        const charCount = document.getElementById('char-count')
        if (charCount) charCount.textContent = `${textarea.value.length} chars`
        setTimeout(typeNext, Math.random() * 8 + 2)
      } else {
        textarea.style.borderColor = ''
      }
    }
    typeNext()
  } catch (err) {
    textarea.placeholder   = lang === 'hi' ? 'Generate nahi hua — khud likho' : 'Could not generate — please write manually'
    textarea.style.borderColor = ''
    console.error('autoFillMessage error:', err)
  } finally {
    textarea.disabled = false
  }
}

// ─── CURATED FALLBACK MESSAGES ─────────────────────────────────────
function fallbackMessage(tone, recipientName, senderName, lang) {
  const name = recipientName || (lang === 'hi' ? 'aap' : 'you')
  const from = senderName   || (lang === 'hi' ? 'main' : 'me')

  if (lang === 'hi') {
    const fallbacksHi = {
      tender: `${name}, kuch baatein dil mein itni gehri hoti hain ki unhe alfaazon mein dhaalna mushkil lagta hai. Par aaj main koshish karta/karti hoon.\n\nMujhse galti hui. Us waqt bhi pata tha, par main ruk nahi saka/saki. Aaj, jab peeche mudke dekhta/dekhti hoon, toh sirf yahi ehsaas hota hai ki tumhara dil dukha.\n\nYeh maafi nahi maang raha/rahi hoon apne liye. Yeh isliye keh raha/rahi hoon kyunki tum itne khaas ho ki sach sunne ke haqdaar ho.\n\n— ${from}`,

      passionate: `${name} — main tumhe bhoolne ki koshish kar raha/rahi hoon, par har jagah tumhari yaad aa jaati hai.\n\nMujhse galat hua. Poori tarah se. Bina kisi bahane ke. Yeh baat meri chhaati mein ek bojh ki tarah thi, ab aur nahi chhupa sakta/sakti.\n\nMain abhi bhi yahan hoon.\n\n— ${from}`,

      remorseful: `${name} — maine tumhe dukh diya. Yeh jaante hue bhi main ruka/ruki nahi. Iske liye koi safai nahi hai.\n\nMain maafi chahta/chahti hoon — sirf ek lafz ki tarah nahi, balki poore dil se.\n\n— ${from}`,

      hopeful: `${name}, kuch cheezein doori se zyada saaf dikhti hain. Ab mujhe saaf dikh raha hai ki jo kuch bhi toota, woh jo main feel karta/karti hoon use nahi toda.\n\nEk naya mauka chahta/chahti hoon — reset ke liye nahi, balki kuch behtar likhne ke liye.\n\n— ${from}`,

      poetic: `${name}, tum mere zehan mein ek manzil ki tarah ho jahan main baar baar pahunchta/pahunchti hoon bina irade ke.\n\nGalat hua mujhse. Dil ki gehraai se jaanta/jaanti hoon. Bas itna keh sakta/sakti hoon — tum isse behtar ke haqdaar the/thi.\n\n— ${from}`,

      raw: `${name}. Galat hua mujhse. Seedha.\n\nMaafi chahta/chahti hoon. Bas itna.\n\nTum isse behtar ke haqdaar the/thi.\n\n— ${from}`
    }
    return fallbacksHi[tone] || fallbacksHi.tender
  }

  const fallbacks = {
    tender: `There's a particular kind of afternoon light that still makes me think of you, ${name}. I've been sitting with this for a long time now.\n\nI was wrong. In the ways that count, in the moments that mattered, I chose poorly when you deserved better.\n\nYou were worth more than how I showed it.\n\n— ${from}`,
    passionate: `I keep reaching for my phone to tell you things. ${name}, I miss you in a way that doesn't fit neatly anywhere.\n\nI was wrong. Fully, completely, without caveat.\n\nI'm still here.\n\n— ${from}`,
    remorseful: `${name} — I hurt you. I knew I was hurting you and I kept going anyway.\n\nYou deserved more than what I gave. I'm sorry — not as punctuation, but as the whole sentence.\n\n— ${from}`,
    hopeful: `Some things get clearer with distance, ${name}. What's clearer to me now is this: whatever broke between us, it didn't break what I feel.\n\nIf you're open to it, I'd like to try again.\n\n— ${from}`,
    poetic: `${name}, what I keep finding, at the end of every road, is your name. Not as blame. As geography.\n\nI was wrong in ways that mattered.\n\n— ${from}`,
    raw: `${name}. I messed up. I'm sorry. That's the whole thing.\n\nYou didn't deserve it.\n\n— ${from}`
  }
  return fallbacks[tone] || fallbacks.tender
}
