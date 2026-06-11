---

## Step 1 — Local Setup

```bash
cd forgiveme
npm install
cp .env.example .env.local
# → Fill in all values in .env.local
```

---

## Step 2 — Supabase Setup

1. [supabase.com](https://supabase.com) pe project banao
2. Project URL aur anon key → `.env.local`
3. SQL Editor → `supabase/schema.sql` run karo
4. Authentication → Providers → Anonymous sign-in ON karo
5. Storage → 2 public buckets banao: `story-photos`, `story-audio`
6. service_role key → `.env.local` mein `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 3 — Razorpay Setup

1. [razorpay.com](https://razorpay.com) pe account banao
2. Settings → API Keys → Key ID aur Secret → `.env.local`
3. API deploy ke baad (Step 5) webhook add karo

---

## Step 4 — Firebase / FCM Setup

1. [console.firebase.google.com](https://console.firebase.google.com) pe project banao
2. Android app add karo → `google-services.json` → `android/app/`
3. iOS app add karo → `GoogleService-Info.plist` → `ios/App/App/`
4. Service Accounts → Generate private key → `FCM_SERVICE_ACCOUNT_JSON`

---

## Step 5 — Deploy API (Vercel)

```bash
npm install -g vercel
vercel
```

Vercel → Settings → Environment Variables mein add karo:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `RAZORPAY_KEY_ID` | Razorpay se |
| `RAZORPAY_KEY_SECRET` | Razorpay se |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook setup ke baad |
| `VITE_APP_URL` | `https://forgiveme.app` |

Phir Razorpay Dashboard → Webhooks:
- URL: `https://forgiveme.app/api/razorpay-webhook`
- Event: `payment.captured`

---

## Step 6 — Deploy Edge Functions

```bash
npm install -g supabase
supabase login
supabase link --project-ref fbonrxcgpvahabvvrgvb

supabase secrets set \
  SUPABASE_URL=https://fbonrxcgpvahabvvrgvb.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=sb_secret_... \
  FCM_PROJECT_ID=your-firebase-id \
  FCM_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' \
  FUNCTION_SECRET=your_random_secret

supabase functions deploy send-notification
supabase functions deploy on-story-viewed
supabase functions deploy on-story-created
```

Supabase Dashboard → Database → Webhooks:

| Name | Table | Event | URL |
|------|-------|-------|-----|
| on_story_viewed | stories | UPDATE | `.../on-story-viewed` |
| on_story_created | stories | INSERT | `.../on-story-created` |

Header add karo: `Authorization: Bearer YOUR_FUNCTION_SECRET`

---

## Step 7 — Capacitor Init

```bash
npx cap init "Forgiveme" "app.forgiveme.www" --web-dir dist
npm run sync:android
npm run sync:ios
npm run open:android
npm run open:ios
```

---

## Step 8 — Android Build

```bash
keytool -genkey -v -keystore ~/.android/forgiveme-release.keystore \
  -alias forgiveme -keyalg RSA -keysize 2048 -validity 10000

cd android && ./gradlew bundleRelease
```

---

## Step 9 — iOS Build

1. [developer.apple.com](https://developer.apple.com) enroll karo
2. App ID `app.forgiveme.www` banao
3. Xcode mein open karo → Archive → App Store Connect

---

## Admin Access

App mein Admin scene pe jao. Default password: `forgive2024admin`
**Ship karne se pehle `src/main.js` mein change karo!**

---

## Environment Variables Reference

| Variable | Where | Description |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | Client | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Client | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | RLS bypass — never expose |
| `VITE_RAZORPAY_KEY_ID` | Client | Razorpay Key ID |
| `RAZORPAY_KEY_SECRET` | Server only | Razorpay Secret |
| `RAZORPAY_WEBHOOK_SECRET` | Server only | Webhook secret |
| `FCM_PROJECT_ID` | Edge Functions | Firebase project ID |
| `FCM_SERVICE_ACCOUNT_JSON` | Edge Functions | Firebase service account |
| `FUNCTION_SECRET` | Edge Functions | Internal auth secret |
| `VITE_API_URL` | Client | Vercel API URL |
| `VITE_APP_URL` | Client + Server | App domain |