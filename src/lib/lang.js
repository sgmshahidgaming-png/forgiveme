// ─── LANGUAGE FILE ────────────────────────────────────────────────
// Sirf yahi file edit karo language update karne ke liye!
// EN = English, HI = Roman Hindi

const LANG = {
  en: {
    // Nav
    nav_home: 'Home',
    nav_create: 'Create',
    nav_preview: 'Preview',
    nav_premium: 'Premium',
    nav_admin: 'Admin',

    // Landing
    landing_eyebrow: '✦ Some words need more than a text ✦',
    landing_sub: 'A cinematic space for apologies, love letters, and confessions that deserve to be felt.',
    landing_btn: '✦ Create Your Story',
    stat_emotions: 'Emotions',
    stat_tones: 'Tones',
    stat_link: 'Link',

    // Create
    create_title: 'Craft Your Story',
    create_sub: '✦ Every word, a world ✦',
    label_to: 'To',
    label_from: 'From',
    label_message: 'Your Message',
    label_tone: 'Tone',
    label_media: 'Add Media',
    placeholder_to: 'Their name…',
    placeholder_from: 'Your name…',
    placeholder_msg: 'Write what you\'ve been meaning to say…',
    btn_create: '✦ Create & Preview Story',

    // Tones
    tone_tender: 'Tender',
    tone_passionate: 'Passionate',
    tone_remorseful: 'Remorseful',
    tone_hopeful: 'Hopeful',
    tone_poetic: 'Poetic',
    tone_raw: 'Raw',

    // Preview
    story_to: 'A letter for',
    story_from: '— with love from',
    btn_share: '✦ Share This Story',
    btn_copy: 'Copy Link',
    btn_create_another: '← Create Another',

    // Premium
    premium_eyebrow: '✦ Unlock the Full Experience ✦',
    premium_title: 'Go Premium.<br>Create Without Limits.',
    premium_sub: 'Unlimited stories, priority support, all future features.',
    plan_monthly: 'Monthly',
    plan_annual: 'Annual — save 50%',
    plan_monthly_period: 'per month',
    plan_annual_period: 'per year — ₹83/mo',
    plan_badge: 'Best Value',
    btn_unlock_monthly: 'Unlock Monthly',
    btn_unlock_annual: 'Unlock Annual',
    feature_unlimited: 'Unlimited stories',
    feature_tones: 'All 6 tones',
    feature_media: 'Photo & audio uploads',
    feature_links: 'Custom share links',
    feature_everything: 'Everything in Monthly',
    feature_early: 'Early access features',
    feature_notif: 'Priority notifications',
    feature_admin: 'Admin gifting access',
  },

  hi: {
    // Nav
    nav_home: 'Home',
    nav_create: 'Banao',
    nav_preview: 'Dekho',
    nav_premium: 'Premium',
    nav_admin: 'Admin',

    // Landing
    landing_eyebrow: '✦ Kuch baatein sirf text se nahi kahi jaatin ✦',
    landing_sub: 'Maafi, pyaar ke khat, aur wo baatein jo dil tak pahunchni chahiye.',
    landing_btn: '✦ Apni Kahani Banao',
    stat_emotions: 'Jazbaatein',
    stat_tones: 'Andaaz',
    stat_link: 'Link',

    // Create
    create_title: 'Apni Kahani Likho',
    create_sub: '✦ Har shabd, ek duniya ✦',
    label_to: 'Kisko',
    label_from: 'Kisne',
    label_message: 'Apna Sandesh',
    label_tone: 'Andaaz',
    label_media: 'Media Jodo',
    placeholder_to: 'Unka naam…',
    placeholder_from: 'Apna naam…',
    placeholder_msg: 'Woh likho jo dil mein tha…',
    btn_create: '✦ Kahani Banao aur Dekho',

    // Tones
    tone_tender: 'Naram',
    tone_passionate: 'Jazbaati',
    tone_remorseful: 'Pachtawa',
    tone_hopeful: 'Umeed',
    tone_poetic: 'Shayarana',
    tone_raw: 'Sachcha',

    // Preview
    story_to: 'Ek khat',
    story_from: '— pyaar ke saath',
    btn_share: '✦ Yeh Kahani Share Karo',
    btn_copy: 'Link Copy Karo',
    btn_create_another: '← Ek Aur Banao',

    // Premium
    premium_eyebrow: '✦ Poora Anubhav Unlock Karo ✦',
    premium_title: 'Premium Lo.<br>Bina Kisi Seema Ke Banao.',
    premium_sub: 'Unlimited kahaniyan, priority support, aur sab future features.',
    plan_monthly: 'Mahina',
    plan_annual: 'Saal — 50% bachao',
    plan_monthly_period: 'prati maah',
    plan_annual_period: 'prati saal — ₹83/maah',
    plan_badge: 'Sabse Achha',
    btn_unlock_monthly: 'Monthly Unlock Karo',
    btn_unlock_annual: 'Yearly Unlock Karo',
    feature_unlimited: 'Unlimited kahaniyan',
    feature_tones: 'Saare 6 andaaz',
    feature_media: 'Photo aur audio upload',
    feature_links: 'Custom share links',
    feature_everything: 'Monthly wala sab',
    feature_early: 'Nayi features pehle',
    feature_notif: 'Priority notifications',
    feature_admin: 'Admin gifting access',
  }
}

// ─── LANG ENGINE ──────────────────────────────────────────────────
let currentLang = localStorage.getItem('lang') || 'hi'

function applyLang(lang) {
  currentLang = lang
  localStorage.setItem('lang', lang)
  const t = LANG[lang]

  // Nav
  document.querySelectorAll('[data-t]').forEach(el => {
    const key = el.dataset.t
    if (t[key] !== undefined) el.innerHTML = t[key]
  })

  // Lang toggle button
  const btn = document.getElementById('lang-toggle')
  if (btn) btn.textContent = lang === 'en' ? 'EN | HI' : 'HI | EN'

  // Placeholders
  document.querySelectorAll('[data-ph]').forEach(el => {
    const key = el.dataset.ph
    if (t[key] !== undefined) el.placeholder = t[key]
  })
}

window._toggleLang = function () {
  applyLang(currentLang === 'en' ? 'hi' : 'en')
}

// Apply on load
document.addEventListener('DOMContentLoaded', () => applyLang(currentLang))