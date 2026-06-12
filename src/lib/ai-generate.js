/**
 * Forgivemе — AI Story Generation API
 * Vercel serverless function (api/ai-generate.js)
 */

const APP_URL = process.env.VITE_APP_URL || 'https://forgiveme.app'

const TONE_PROMPTS = {
  tender: 'warm, gentle, vulnerable — soft yet deeply sincere',
  passionate: 'fire and urgency — unrestrained, emotionally raw, intense',
  remorseful: 'deep accountability — no excuses, pure ownership of pain caused',
  hopeful: 'forward-looking warmth — a door held open, belief in what can be',
  poetic: 'literary beauty — rich metaphors, lyrical rhythm, unexpected imagery',
  raw: 'stripped bare — short, direct, gut-punch honest. Every word counts'
}

const CINEMATIC_SCENES = {
  tender: ['dusk light through curtains', 'a familiar song on a quiet street', 'an old photograph discovered', 'two cups of tea going cold', 'rain on a window at dawn'],
  passionate: ['a thunderstorm at midnight', 'an airport goodbye that lasted too long', 'a fire that refuses to die', 'the last train leaving the station', 'hands that reach and miss'],
  remorseful: ['a letter written and rewritten', 'an empty chair at a dinner table', 'rain against a window at 3am', 'a cracked mirror', 'a road that leads back'],
  hopeful: ['sunrise over a familiar rooftop', 'a single flower pushing through concrete', 'the first warm day after winter', 'an open window in spring', 'a new notebook, first page blank'],
  poetic: ['light refracting through water', 'stars visible only when the city sleeps', 'the space between two people on a park bench', 'a candle in an empty room', 'footprints in sand'],
  raw: ['a cracked phone screen with their name on it', 'the last text message re-read a hundred times', 'silence where their voice used to be', 'an unanswered door', 'a stopped clock']
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { recipientName, senderName, tone = 'tender', context = '', lang = 'hi' } = req.body

  const validTones = Object.keys(TONE_PROMPTS)
  const safeTone = validTones.includes(tone) ? tone : 'tender'
  const scenePool = CINEMATIC_SCENES[safeTone]
  const scene = scenePool[Math.floor(Math.random() * scenePool.length)]
  const uniqueId = Math.random().toString(36).slice(2, 8)

  const isHindi = lang === 'hi'

  const systemPrompt = isHindi
    ? `Tum ek emotional, cinematic kahani likhne wale expert ho. Tumhara kaam hai dil ko chu jaane wali maafi ki kahaniyan likhna.

Style rules:
- Roman Hindi mein likho (Hindi alfaaz English letters mein — jaise "Maafi chahta hoon", "Tumse pyaar hai", "Dil se sorry hoon")
- Devanagari script bilkul mat use karo
- Sensory detail ya image se shuru karo — "I" ya "Main" se shuru mat karo
- Cliche mat use karo
- 120–180 words
- Unique ID: ${uniqueId} — isliye har baar alag story likho`
    : `You are a master of emotional, cinematic storytelling. Write deeply personal apology letters that feel cinematic and unforgettable.

Style rules:
- Open with a specific sensory detail (do not start with "I")
- No clichés. No "words cannot express"
- Vary sentence length dramatically
- 150–200 words
- Unique ID: ${uniqueId} — write something completely different every time`

  const userPrompt = isHindi
    ? `${recipientName || 'unhe'} ke liye ${senderName || 'main'} ki taraf se ek ${safeTone} maafi ka khat likho.

Cinematic motif: "${scene}"
Tone: ${TONE_PROMPTS[safeTone]}
${context ? `Khaas baat jo address karni hai: "${context}"` : ''}

Sirf kahani text return karo. Koi title, label ya quotes mat lagao.`
    : `Write a ${safeTone} apology story from ${senderName || 'someone'} to ${recipientName || 'someone they love'}.

Cinematic motif: "${scene}"
Tone guide: ${TONE_PROMPTS[safeTone]}
${context ? `Context: "${context}"` : ''}

Return ONLY the message. No titles, no labels.`

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 400,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      console.error('Groq error:', errText)
      return res.status(502).json({ error: 'AI service unavailable', fallback: true })
    }

    const data = await groqRes.json()
    const message = data.choices?.[0]?.message?.content?.trim()

    if (!message) return res.status(502).json({ error: 'Empty response', fallback: true })

    return res.status(200).json({ message, tone: safeTone, scene, lang })

  } catch (err) {
    console.error('AI generate error:', err)
    return res.status(500).json({ error: err.message, fallback: true })
  }
}