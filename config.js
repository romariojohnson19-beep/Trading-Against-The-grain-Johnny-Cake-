/* Wingman — the ONLY file you edit to go live. Everything here is safe to be public
   (the Supabase anon key is designed to be public; access is enforced by the database rules in
   supabase/schema.sql). NEVER paste a Supabase service_role key or a Stripe secret key here. */
window.WM_CONFIG = {
  // 1) Supabase → Project Settings → API. Leave both empty to run in browser-only demo mode.
  supabaseUrl: 'https://yqnoabrmbhuotlowvlzs.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxbm9hYnJtYmh1b3Rsb3d2bHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNjg5OTAsImV4cCI6MjEwODY0NDk5MH0.XQTGBSLEN-pTtFBB7ucd2iLaZH6SW5D-uKTbnavwAmE',

  // 2) Where "email Mario" fallbacks go when a payment link or backend is not set up yet.
  contactEmail: 'mariovsng@gmail.com',

  // 3) Stripe Payment Links (Stripe Dashboard → Payment Links). Empty = that button falls back to email.
  links: {
    ebook: 'https://buy.stripe.com/28EdR95TD3xz4os4ccgnK04', // Trading the Grain
    weekly: 'https://buy.stripe.com/8x2cN55TDfgh6wAdMMgnK05',   // Wingman weekly seat (subscription, $200 week-1 price)
    daypass: '',  // Day Pass (one-time payment)
    discord: '',  // fallback Discord invite if you have not set one in admin → Settings
    billingPortal: '' // fallback Stripe customer-portal link
  }
};
