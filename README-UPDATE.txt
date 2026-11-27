STEP 3 UPDATE (no config.js inside; yours stays as is)

ROOT of repo (replace/add):
 index.html universe.html pricing.html faq.html   <- your newest Johnny & Daev landing, with Store links added
 members.html admin.html auth.js login.html store.html store-data.js live.js
 pro.css lessons-data.js johnny.css johnny.js

media/ folder (add, all files in this zip's media folder): characters for landing, lessons, widget.

Database (run in Supabase > SQL Editor, copy the file text, paste, Run). Not uploaded to the site:
 1. supabase/store.sql   (storefront: products, purchases)
 2. supabase/live.sql    (live room chat)
Optional functions:
 supabase/functions/stripe-webhook/index.ts  (auto-record store purchases)
 supabase/functions/live-to-discord/index.ts (mirror site chat into a Discord channel)

Then: Admin > Storefront (add products + Stripe links), Admin > Live Room (paste YouTube link, Go live).
Educational only. Not financial advice.
