# 🚀 Forgiveme — Complete Setup Guide

## Step 1: Supabase Setup

### 1a. SQL Schema Run Karo
Supabase Dashboard → SQL Editor → New Query
Copy-paste karo: `supabase/schema.sql` → Run karo

### 1b. Authentication Enable Karo
- Supabase Dashboard → Authentication → Providers
- **Anonymous** sign-in ON karo

### 1c. Storage Buckets Banao
- Supabase Dashboard → Storage → New bucket
  - Name: `story-photos` | Public: ✅ YES
  - Name: `story-audio`  | Public: ✅ YES

### 1d. Service Role Key Lo
- Supabase Dashboard → Settings → API
- `service_role` key copy karo
- `.env.local` mein `SUPABASE_SERVICE_ROLE_KEY` mein paste karo

---

## Step 2: Razorpay Setup

### 2a. API Keys Lo
- Razorpay Dashboard → Settings → API Keys
- Key ID → `VITE_RAZORPAY_KEY_ID`
- Key Secret → `RAZORPAY_KEY_SECRET`

### 2b. Webhook Setup Karo
- Razorpay Dashboard → Webhooks → Add New Webhook
- URL: `https://forgiveme.app/api/razorpay-webhook`
- Event: `payment.captured` tick karo
- Secret rakho → `RAZORPAY_WEBHOOK_SECRET`

---

## Step 3: Vercel Deploy

```bash
npm install -g vercel
vercel login
vercel --prod
```

Vercel → Settings → Environment Variables mein add karo:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | `https://fbonrxcgpvahabvvrgvb.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase se service role key |
| `RAZORPAY_KEY_ID` | Razorpay se |
| `RAZORPAY_KEY_SECRET` | Razorpay se |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook setup ke baad |
| `VITE_APP_URL` | `https://forgiveme.app` |

---

## Step 4: Supabase Edge Functions Deploy

```bash
supabase secrets set SUPABASE_URL=https://fbonrxcgpvahabvvrgvb.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=apka_service_role_key
supabase secrets set FCM_PROJECT_ID=apka_firebase_project_id
supabase secrets set FCM_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
supabase secrets set FUNCTION_SECRET=random_secret

supabase functions deploy send-notification
supabase functions deploy on-story-created
supabase functions deploy on-story-viewed
```

---

## Step 5: Local Development

```bash
npm install
npm run dev



## Project Structure

forgiveme/
├── src/
│   ├── main.js
│   ├── index.html
│   └── lib/
│       ├── supabase.js
│       ├── payment.js   ← Razorpay checkout
│       ├── auth.js
│       ├── storage.js
│       └── stories.js
├── api/
│   ├── create-order.js      ← Razorpay order create
│   └── razorpay-webhook.js  ← Payment events handle
├── supabase/
│   ├── schema.sql
│   └── functions/
├── .env.local
└── SETUP_GUIDE.md
---

## Step 6: Anthropic API (AI Story Generation)

### 6a. Get API Key
- [console.anthropic.com](https://console.anthropic.com) → API Keys → Create
- Copy the key

### 6b. Add to Vercel
- Vercel → Settings → Environment Variables
- Add: `ANTHROPIC_API_KEY` = your key

This powers the **✦ AI Write For Me** button in the Create scene.
The key is NEVER exposed to the client — all generation happens via `/api/ai-generate`.

---

## New Files Added (Continuation)

| File | Purpose |
|------|---------|
| `src/lib/ai.js` | AI generation client + typewriter reveal + fallbacks |
| `api/ai-generate.js` | Server-side Anthropic proxy (key stays secure) |

### AI Generation Flow
1. User clicks **✦ AI Write For Me** on Create scene
2. Client calls `/api/ai-generate` with: `recipientName`, `senderName`, `tone`, `context`
3. Vercel function calls Anthropic API (key is server-only)
4. Response streams back and typewriter-reveals in the textarea
5. If API fails → curated fallback message used silently

### Admin Panel Additions
- **Platform Stats**: total stories, active stories, premium user count
- **Recent Stories**: last 20 stories with remove button
- **Action Log**: timestamped admin actions

