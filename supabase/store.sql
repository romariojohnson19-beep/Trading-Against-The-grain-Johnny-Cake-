-- Storefront. Run once in Supabase → SQL Editor → New query → paste → Run. Safe to re-run.
-- Adds: products (public catalog), product_delivery (private, shown only to buyers), purchases (who owns what).

create table if not exists public.products (
  id           text primary key,
  kind         text not null default 'other' check (kind in ('book','indicator','course','room','other')),
  title        text not null check (char_length(title) <= 120),
  blurb        text not null default '' check (char_length(blurb) <= 600),
  price_label  text not null default '' check (char_length(price_label) <= 40),
  badge        text not null default '' check (char_length(badge) <= 30),
  buy_url      text not null default '' check (char_length(buy_url) <= 400),   -- Stripe Payment Link
  payment_link text not null default '' check (char_length(payment_link) <= 80), -- plink_… id, used to match purchases
  sort         int  not null default 100,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.product_delivery (
  product_id text primary key references public.products(id) on delete cascade,
  url        text not null default '' check (char_length(url) <= 600),
  note       text not null default '' check (char_length(note) <= 1500)
);

create table if not exists public.purchases (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  product_id        text not null references public.products(id) on delete restrict,
  stripe_session_id text unique,
  source            text not null default 'stripe' check (source in ('stripe','admin')),
  created_at        timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table public.products         enable row level security;
alter table public.product_delivery enable row level security;
alter table public.purchases        enable row level security;

drop policy if exists products_select on public.products;
create policy products_select on public.products for select to anon, authenticated using (active or public.is_admin());
drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists delivery_select on public.product_delivery;
create policy delivery_select on public.product_delivery for select to authenticated using (
  public.is_admin() or exists (select 1 from public.purchases p where p.product_id = product_delivery.product_id and p.user_id = auth.uid()));
drop policy if exists delivery_admin_write on public.product_delivery;
create policy delivery_admin_write on public.product_delivery for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists purchases_select on public.purchases;
create policy purchases_select on public.purchases for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists purchases_admin_write on public.purchases;
create policy purchases_admin_write on public.purchases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Members cannot insert purchases. Only the Stripe webhook (service role) and the admin can.

-- Starting catalog from your existing links. Edit everything from Admin → Storefront afterwards.
insert into public.products (id, kind, title, blurb, price_label, buy_url, sort) values
  ('book', 'book', 'Trading the Grain', 'The plain-spoken NQ futures playbook. Educational only.', '', '', 10)
on conflict (id) do nothing;
