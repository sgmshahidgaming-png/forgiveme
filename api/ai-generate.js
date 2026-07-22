/**
 * Forgiveme — AI Story Generation API
 * Vercel serverless function — uses Groq API (llama-3.3-70b)
 */

const TONE_PROMPTS = {
  tender:     'Write in a warm, gentle, vulnerable tone — soft yet deeply sincere. Like a whisper that holds everything.',
  passionate: 'Write with fire and urgency — unrestrained, emotionally raw, intense. No holding back.',
  remorseful: 'Write with deep accountability — no excuses, no minimizing. Pure ownership of pain caused.',
  hopeful:    'Write with a forward-looking warmth — this is a door being held open, full of belief in what can be.',
  poetic:     'Write with literary beauty — rich metaphors, lyrical rhythm, unexpected imagery. Prose that sings.',
  raw:        'Write stripped bare — no flowery language. Short, direct, gut-punch honest. Every word counts.'
}

const CINEMATIC_SCENES = {
  tender:     ['dusk light through curtains', 'a familiar song on a quiet street', 'an old photograph discovered'],
  passionate: ['a thunderstorm at midnight', 'an airport goodbye that lasted too long', 'a fire that refuses to die'],
  remorseful: ['a letter written and rewritten', 'an empty chair at a dinner table', 'rain against a window at 3am'],
  hopeful:    ['sunrise over a familiar rooftop', 'a single flower pushing through concrete', 'two cups of tea going cold'],
  poetic:     ['light refracting through water', 'stars visible only when the city sleeps', 'the space between two people on a park bench'],
  raw:        ['a cracked phone screen with their name on it', 'the last text message re-read a hundred times', 'silence where their voice used to be']
}

export default async function handler(req, res) {
  // CORS — allow all origins
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).end()

  const { recipientName, senderName, tone = 'tender', context = '', lang = 'hi' } = req.body
  const isHindi = lang === 'hi'

  const validTones = Object.keys(TONE_PROMPTS)
  const safeTone   = validTones.includes(tone) ? tone : 'tender'
  const toneGuide  = TONE_PROMPTS[safeTone]
  const scenePool  = CINEMATIC_SCENES[safeTone]
  const scene      = scenePool[Math.floor(Math.random() * scenePool.length)]
  const uniqueId   = Math.random().toString(36).slice(2, 8)

  const systemPrompt = isHindi
    ? `Tum ek emotional, cinematic kahani likhne wale expert ho. Tumhara kaam hai dil ko chu jaane wali maafi ki kahaniyan likhna.\n\nStyle rules:\n- Roman Hindi mein likho (Hindi alfaaz English letters mein jaise "Maafi chahta hoon", "Tumse pyaar hai")\n- Devanagari script bilkul mat use karo\n- Sensory detail ya image se shuru karo, "I" ya "Main" se shuru mat karo\n- Cliche mat use karo\n- 120-180 words\n- Unique ID: ${uniqueId} — isliye har baar alag story likho`
    : `You are a master of emotional, cinematic storytelling. Write deeply personal apology letters that feel cinematic and unforgettable.\n\nStyle rules:\n- Open with a specific sensory detail (do not start with "I")\n- No cliches. No "words cannot express"\n- Vary sentence length dramatically\n- 150-200 words\n- Unique ID: ${uniqueId} — write something completely different every time`

  const userPrompt = isHindi
    ? `${recipientName || 'unhe'} ke liye ${senderName || 'main'} ki taraf se ek ${safeTone} maafi ka khat likho.\n\nCinematic motif: "${scene}"\nTone: ${toneGuide}\n${context ? `Khaas baat: "${context}"` : ''}\n\nSirf kahani text return karo. Koi title, label ya quotes mat lagao.`
    : `Write a ${safeTone} apology story from ${senderName || 'someone'} to ${recipientName || 'someone they love'}.\n\nCinematic motif: "${scene}"\nTone guide: ${toneGuide}\n${context ? `Context: "${context}"` : ''}\n\nReturn ONLY the message. No titles, no labels.`

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model:      'llama-3.3-70b-versatile',
        max_tokens: 400,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt }
        ]
      })
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      console.error('Groq error:', errText)
      return res.status(502).json({ error: 'AI service unavailable', fallback: true })
    }

    const data    = await groqRes.json()
    const message = data.choices?.[0]?.message?.content?.trim()

    if (!message) return res.status(502).json({ error: 'Empty response', fallback: true })

    return res.status(200).json({ message, tone: safeTone, scene, lang })

  } catch (err) {
    console.error('Groq AI error:', err)
    return res.status(500).json({ error: err.message, fallback: true })
  }
}
