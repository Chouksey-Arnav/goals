-- Applied to the "Focus" project on 2026-10-11 (copied from its migration
-- history so the schema is reproducible).

-- One row per user: the tracker's whole state as JSON.
create table if not exists public.progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  -- Guard against abuse: the real state is a few KB.
  constraint progress_state_size check (pg_column_size(state) < 262144)
);

alter table public.progress enable row level security;

-- Auto-expose is off, so grant explicitly: signed-in users only, no deletes,
-- nothing at all for anonymous visitors. (The server's service_role grant
-- was missing here; see 20261012030000_grant_service_role.sql.)
revoke all on table public.progress from anon, authenticated;
grant select, insert, update on table public.progress to authenticated;

drop policy if exists "read own progress" on public.progress;
create policy "read own progress" on public.progress
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "insert own progress" on public.progress;
create policy "insert own progress" on public.progress
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "update own progress" on public.progress;
create policy "update own progress" on public.progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
