# DentalSeller

Track UK dental patients travelling to Antalya for treatment, and the commission earned from each.

## Stack

Next.js (App Router) · Tailwind CSS · Supabase (Postgres + Auth + RLS) · Recharts · Vercel

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/schema.sql` from this repo — creates `patients` and `settings` tables with Row Level Security so each user only sees their own data.
3. In **Project Settings → API**, copy the **Project URL** and **anon public key**.
4. In **Authentication → Providers**, make sure **Email** is enabled. Under **Authentication → Settings**, you can disable "Confirm email" for faster local testing (re-enable for production if you want email verification).

## 2. Local setup

```bash
npm install
cp .env.local.example .env.local
# edit .env.local with your Supabase URL + anon key
npm run dev
```

Visit `http://localhost:3000` — you'll be redirected to `/login`. Sign up with an email/password to create your account.

## 3. Deploy to Vercel

```bash
npx vercel
```

Or connect the GitHub repo in the Vercel dashboard. Either way, set these environment variables in the Vercel project settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — from **Project Settings → API**, needed by the exchange-rate cron job
- `CRON_SECRET` — any random string; also authorizes the cron job (Vercel sends it automatically as a bearer token to `vercel.json` crons once set)

- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — see **Telegram reminders** below

Then deploy. `vercel.json` registers two daily crons:
- `/api/cron/exchange-rate` (06:00 UTC) — fetches GBP/USD/EUR → TRY rates, stores in `exchange_rates`.
- `/api/cron/visit-reminders` (08:00 UTC) — checks patients for visit1/visit2 arrivals 7 days or 1 day out, and departures 1 day out; sends a Telegram digest if anything matches.

No other config needed — the app is fully server-rendered per request (auth-gated), so no static export step.

## Telegram reminders

1. Message [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot`, follow the prompts. You get a bot token like `123456:ABC-DEF...`.
2. Message your new bot anything (e.g. "hi") so it can see your chat.
3. Visit `https://api.telegram.org/bot<your-token>/getUpdates` in a browser — find `"chat":{"id":...}` in the response, that's your `TELEGRAM_CHAT_ID`.
4. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in Vercel env vars (production).

## Data model

- **Patient**: name, treatment, confirmation date, two visits (date / expected payment / actual payment / status), notes. Every row has a `user_id` and is protected by RLS.
- **Settings**: per-user commission threshold + rates + currency, editable from the Settings page.
- **exchange_rates**: shared (not per-user) daily history of `base`/TRY rates, written by the cron job, readable by any signed-in user. Powers the rate history chart on Settings.

## Commission logic

All patient payments (visit 1 + visit 2) are grouped by the calendar month of the visit date. Within a month:

- Total ≤ threshold (default £70,000) → low rate (default 3%)
- Total > threshold → high rate (default 4%)
- Commission = month total × that rate, applied to the full total (flat, not marginal)

This is calculated twice per month — once from **actual** payments received, once from **expected** payments for scheduled visits — so confirmed vs. projected earnings stay separate throughout the app.
