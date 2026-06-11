/**
 * Forgivemе — AI Story Generation API
 * Vercel serverless function (api/ai-generate.js)
 * Proxies to Anthropic API so the API key stays server-side.
 */

const APP_URL = process.env.VITE_APP_URL || 'https://forgiveme.app'

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
  // CORS
  res.setHeader('Access-Control-Allow-Origin', APP_URL)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).end()

  const { recipientName, senderName, tone = 'tender', context = '' } = req.body

  const validTones = Object.keys(TONE_PROMPTS)
  const safeTone = validTones.includes(tone) ? tone : 'tender'

  const toneGuide   = TONE_PROMPTS[safeTone]
  const scenePool   = CINEMATIC_SCENES[safeTone]
  const scene       = scenePool[Math.floor(Math.random() * scenePool.length)]

  const systemPrompt = `You are a master of emotional, cinematic storytelling. You write deeply personal apology letters, love confessions, and heartfelt stories that feel cinematic, literary, and unforgettable. Your writing is never generic — every piece feels written for this specific person, this specific moment.

Style rules:
- Open with a specific sensory detail or image (do not start with "I")
- Use the present tense for immediacy, past tense for memory
- No clichés. No "words cannot express". No "from the bottom of my heart"
- Vary sentence length dramatically — long flowing sentences broken by short, sharp ones
- End with something that opens rather than closes — a question, a possibility, a held breath
- Length: 150–220 words. Never less, never more.`

  const userPrompt = `Write a ${safeTone} apology/love story message from ${senderName || 'someone who cares'} to ${recipientName || 'someone they love'}.

Cinematic motif to weave in: "${scene}"
Tone guide: ${toneGuide}
${context ? `Additional context from the person: "${context}"` : ''}

Return ONLY the message. No titles, no labels, no quotation marks wrapping the whole thing.`

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 400,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userPrompt }]
      })
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      console.error('Anthropic error:', errText)
      return res.status(502).json({ error: 'AI service unavailable', fallback: true })
    }

    const data    = await anthropicRes.json()
    const message = data.content?.[0]?.text?.trim()

    if (!message) return res.status(502).json({ error: 'Empty response', fallback: true })

    return res.status(200).json({ message, tone: safeTone, scene })

  } catch (err) {
    console.error('AI generate error:', err)
    return res.status(500).json({ error: err.message, fallback: true })
  }
}
