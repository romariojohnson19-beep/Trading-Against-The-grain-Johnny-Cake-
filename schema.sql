-- Wingman database. Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to re-run: every statement is idempotent.

create extension if not exists pgcrypto;

-- ───────────── tables ─────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '' check (char_length(name) <= 100),
  email       text not null default '',
  discord     text not null default '' check (char_length(discord) <= 60),
  role        text not null default 'member' check (role in ('member','admin')),
  created_at  timestamptz not null default now()
);

create table if not exists public.roster (
  user_id                 uuid primary key references public.profiles(id) on delete cascade,
  week                    int  not null default 1 check (week >= 1),
  status                  text not null default 'pending' check (status in ('pending','active','paused','trial')),
  points                  int  not null default 0 check (points >= 0),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  cancel_requested        boolean not null default false,
  joined                  timestamptz not null default now()
);

create table if not exists public.events (
  id          text primary key,
  date        date not null,
  sess_type   text not null,
  label       text not null default '',
  instruments text[] not null default '{}',
  start_time  text not null default '',
  end_time    text not null default '',
  notes       text not null default ''
);

create table if not exists public.files (
  id         text primary key,
  label      text not null default '',
  descr      text not null default '',
  name       text not null default '',
  kind       text not null default 'file',
  size       text not null default '',
  file_date  date not null default current_date,
  url        text,
  path       text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id          text primary key,
  type        text not null default 'update',
  audience    text not null default 'all',
  body        text not null check (char_length(body) <= 5000),
  attachments jsonb not null default '[]',
  created_at  timestamptz not null default now()
);

create table if not exists public.requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null,
  type       text not null check (type in ('redeem','cancel','daypass','bootcamp')),
  detail     text not null default '' check (char_length(detail) <= 500),
  name       text not null default '' check (char_length(name) <= 100),
  email      text not null default '' check (char_length(email) <= 200),
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  key        text primary key,
  value      jsonb,
  visibility text not null default 'members' check (visibility in ('public','members'))
);
insert into public.settings (key, value, visibility) values
  ('status', '"offline"', 'public'),
  ('seats',  '12',        'public')
on conflict (key) do nothing;

-- ───────────── helper functions ─────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_active_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.roster where user_id = auth.uid() and status in ('active','trial'));
$$;

-- new auth user → profile + roster row (status 'pending' until payment/approval)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, discord)
  values (new.id,
          left(coalesce(new.raw_user_meta_data->>'name',''), 100),
          coalesce(new.email,''),
          left(coalesce(new.raw_user_meta_data->>'discord',''), 60))
  on conflict (id) do nothing;
  insert into public.roster (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- members spend points / ask to cancel through these (they cannot edit roster directly)
create or replace function public.redeem_item(item text) returns int
language plpgsql security definer set search_path = public as $$
declare cost int; cur int; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  cost := case item when 'ebook' then 20 when 'indicator' then 80 when 'freeweek' then 100 else null end;
  if cost is null then raise exception 'unknown item'; end if;
  select points into cur from public.roster
    where user_id = uid and status in ('active','trial') for update;
  if cur is null or cur < cost then raise exception 'not enough points'; end if;
  update public.roster set points = points - cost where user_id = uid;
  insert into public.requests (user_id, type, detail, name, email)
    select uid, 'redeem', item || ' (' || cost || ' pts)', p.name, p.email from public.profiles p where p.id = uid;
  return cur - cost;
end $$;

create or replace function public.request_cancel() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.roster set cancel_requested = true where user_id = uid;
  insert into public.requests (user_id, type, detail, name, email)
    select uid, 'cancel', 'Cancellation requested', p.name, p.email from public.profiles p where p.id = uid;
end $$;

revoke all on function public.redeem_item(text)  from public, anon;
revoke all on function public.request_cancel()   from public, anon;
grant execute on function public.redeem_item(text) to authenticated;
grant execute on function public.request_cancel()  to authenticated;

-- ───────────── row level security ─────────────
alter table public.profiles enable row level security;
alter table public.roster   enable row level security;
alter table public.events   enable row level security;
alter table public.files    enable row level security;
alter table public.messages enable row level security;
alter table public.requests enable row level security;
alter table public.settings enable row level security;

-- profiles: read own (admin reads all); members may edit name/discord only, never role
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant  update (name, discord) on public.profiles to authenticated;

-- roster: member reads own row; only admin (or the Stripe webhook, service role) writes
drop policy if exists roster_select on public.roster;
create policy roster_select on public.roster for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists roster_admin_write on public.roster;
create policy roster_admin_write on public.roster for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- schedule: any signed-in user can read; admin writes
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated using (true);
drop policy if exists events_admin_write on public.events;
create policy events_admin_write on public.events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- files + messages: paying members and admin only
drop policy if exists files_select on public.files;
create policy files_select on public.files for select to authenticated using (public.is_active_member());
drop policy if exists files_admin_write on public.files;
create policy files_admin_write on public.files for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (public.is_active_member());
drop policy if exists messages_admin_write on public.messages;
create policy messages_admin_write on public.messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- requests: visitors may submit day-pass / bootcamp leads; only admin reads or edits
drop policy if exists requests_lead_insert on public.requests;
create policy requests_lead_insert on public.requests for insert to anon, authenticated
  with check (user_id is null and type in ('daypass','bootcamp') and done = false);
drop policy if exists requests_admin_all on public.requests;
create policy requests_admin_all on public.requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant insert on public.requests to anon;

-- settings: 'public' rows (status, seats) readable by everyone; 'members' rows (Discord/billing links) only by paying members
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select to anon, authenticated
  using (visibility = 'public' or public.is_active_member());
drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.settings to anon;

-- ───────────── private file storage ─────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('member-files', 'member-files', false, 26214400)   -- 25 MB per file
on conflict (id) do nothing;

drop policy if exists "member files read" on storage.objects;
create policy "member files read" on storage.objects for select to authenticated
  using (bucket_id = 'member-files' and public.is_active_member());
drop policy if exists "member files admin insert" on storage.objects;
create policy "member files admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'member-files' and public.is_admin());
drop policy if exists "member files admin delete" on storage.objects;
create policy "member files admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'member-files' and public.is_admin());

-- ───────────── make yourself admin (run AFTER you create your account on the site) ─────────────
-- update public.profiles set role = 'admin' where email = 'YOUR_EMAIL_HERE';
