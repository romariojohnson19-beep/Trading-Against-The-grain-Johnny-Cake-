# Wingman — go-live checklist

Everything is built. The site runs in demo mode (browser-only) until you finish steps 1–3; each step switches on one more piece. Do them in order. Total time: about 45 minutes.

**Only `config.js` is ever edited.** Never paste a Supabase `service_role` key or a Stripe secret key into it.

## 1. Deploy the files (5 min)
Put this whole folder in your GitHub repo (keep the folder structure) and push. Vercel redeploys automatically.
Files: `index.html members.html admin.html auth.js cloud.js config.js vercel.json` + `supabase/`.

## 2. Supabase: accounts + database (15 min)
1. supabase.com → New project (any region, save the database password in your password manager).
2. SQL Editor → New query → paste all of `supabase/schema.sql` → Run. (Safe to run twice.)
3. Authentication → URL Configuration: Site URL = `https://smartmoneystore.com`, and add it under Redirect URLs.
4. Authentication → Providers → Email: keep "Confirm email" ON (recommended). Set a longer minimum password if you like.
5. Project Settings → API: copy **Project URL** and the **anon public** key into `config.js` (`supabaseUrl`, `supabaseAnonKey`). The anon key is meant to be public.
6. Push, open the live site, click **Join**, create YOUR account, confirm the email.
7. Back in SQL Editor run, with your email: `update public.profiles set role = 'admin' where email = 'YOU@EMAIL.COM';`
8. Open `/admin`, sign in. In **Settings** paste your Discord invite link. Done: sign-in, roster, schedule, files, broadcasts, inbox all run on the database.

## 3. Stripe: get paid (15 min)
Create three Payment Links (Stripe → Payment Links) and paste them into `config.js` → `links`:
- `weekly`: recurring, every 1 week, $200 (week-1 price). This is the seat.
- `daypass`: one-time payment.
- `ebook` is already set. In that link's settings, add a confirmation page with the PDF download link so buyers get the book instantly.
Turn on the Stripe customer portal (Settings → Billing → Customer portal) and paste its link into admin → Settings → Billing portal.

## 4. Auto-activate seats + loyalty pricing (optional, 15 min)
Without this, you approve each paid seat by hand in Inbox. With it, paying activates the seat automatically, every weekly renewal moves the member up the ladder ($200 → $180 → $160 → $140, +20 points from week 4), and a cancelled subscription pauses the seat.
1. Stripe: create three more weekly prices on the same product ($180, $160, $140) so you have four price ids.
2. Install the Supabase CLI, `supabase login`, `supabase link --project-ref YOUR_REF`.
3. `supabase functions deploy stripe-webhook --no-verify-jwt`
4. `supabase secrets set STRIPE_SECRET_KEY=sk_live_… STRIPE_WEBHOOK_SECRET=whsec_… PRICE_WEEK1=price_… PRICE_WEEK2=price_… PRICE_WEEK3=price_… PRICE_WEEK4=price_…`
5. Stripe → Developers → Webhooks → add endpoint `https://YOUR_REF.supabase.co/functions/v1/stripe-webhook` with events `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`, `invoice.payment_failed`. Copy its signing secret into step 4's `STRIPE_WEBHOOK_SECRET`.
Test with Stripe test mode first (use test-mode links, then swap to live).

## 5. Replay recordings (later)
Run sessions on Discord Stage, record with OBS, upload the recording as a file in admin → Files (≤ 25 MB) or paste a YouTube/Drive link.

## Known limits
- Free Supabase pauses a project after a week of no activity; the first paying member makes that moot, or upgrade.
- Messages and files are visible to all paying members; the "audience" filter (Week 4+, Day Pass) hides messages in the portal but is not a database-level wall.
- Day Pass buyers do not get an account. Mario confirms their slot from the payment email.
- Support email in `config.js` is `mariovsng@gmail.com`. Your handle is MarioVsNQ, so check that spelling.

## Challenge results (new)
1. Supabase → SQL Editor → paste `supabase/results.sql` → Run. (No Clerk, nothing to replace: it uses the same admin check as the rest of the site.)
2. Sign in as admin → **Results** tab → log a pass or fail. Add a screenshot if you want; the editor opens so you can **Hide** account numbers and crop before it uploads.
3. The public **Results** section on the landing page stays hidden until the first result exists.
4. The intro sentence says every attempt is logged, passes and fails. Keep that literally true, or edit it in `index.html`.
