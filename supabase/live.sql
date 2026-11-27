-- Live room chat. Run once in Supabase → SQL Editor → New query → paste → Run. Safe to re-run.
-- Every message belongs to one live session (session_id), so each live has its own thread.
create table if not exists public.live_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null check (char_length(session_id) <= 60),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  author_name text not null default '' check (char_length(author_name) <= 100),
  body        text not null check (char_length(body) between 1 and 500),
  is_host     boolean not null default false,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists live_messages_session_idx on public.live_messages (session_id, created_at);
alter table public.live_messages enable row level security;

-- Any signed-in member can read (watching is free). Only seat holders / day pass / admin can post.
drop policy if exists live_select on public.live_messages;
create policy live_select on public.live_messages for select to authenticated using (true);
drop policy if exists live_insert on public.live_messages;
create policy live_insert on public.live_messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_member() and (not is_host or public.is_admin()) and not pinned);
drop policy if exists live_admin on public.live_messages;
create policy live_admin on public.live_messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
