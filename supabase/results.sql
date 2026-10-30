-- Challenge results. Run once: Supabase > SQL Editor > New query > paste > Run.
-- Uses the same admin check as the rest of the site (profiles.role = 'admin'). Everyone can read; only admins can write.
-- No Clerk, no placeholders to replace.

create table if not exists public.eval_results (
  id          uuid primary key default gen_random_uuid(),
  result      text not null check (result in ('pass', 'fail')),
  firm        text,
  occurred_on date not null default current_date,
  note        text,
  image_path  text,
  created_at  timestamptz not null default now()
);
alter table public.eval_results enable row level security;

drop policy if exists "public can read results" on public.eval_results;
create policy "public can read results" on public.eval_results for select to anon, authenticated using (true);
drop policy if exists "admin can write results" on public.eval_results;
create policy "admin can write results" on public.eval_results for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Public bucket for the (already edited) screenshots
insert into storage.buckets (id, name, public) values ('result-shots', 'result-shots', true) on conflict (id) do nothing;

drop policy if exists "public can view result shots" on storage.objects;
create policy "public can view result shots" on storage.objects for select to anon, authenticated using (bucket_id = 'result-shots');
drop policy if exists "admin can upload result shots" on storage.objects;
create policy "admin can upload result shots" on storage.objects for insert to authenticated
  with check (bucket_id = 'result-shots' and public.is_admin());
drop policy if exists "admin can delete result shots" on storage.objects;
create policy "admin can delete result shots" on storage.objects for delete to authenticated
  using (bucket_id = 'result-shots' and public.is_admin());
