-- Applied to the "Focus" project on 2026-10-12. Kept here so the schema is
-- reproducible. Safe to re-run.

-- One row per (recipient, local day, slot). Inserting the row is the claim:
-- whoever inserts first (cron or the midday nudge) sends, everyone else skips.
create table if not exists public.email_log (
  recipient  text        not null,
  day        date        not null,
  slot       text        not null check (slot in ('morning', 'midday', 'evening')),
  claimed_at timestamptz not null default now(),
  sent_at    timestamptz,
  subject    text,
  error      text,
  primary key (recipient, day, slot)
);
alter table public.email_log enable row level security;
revoke all on public.email_log from anon, authenticated;

-- Login-code throttle: at most one code per 45 seconds and 10 per day per email.
create table if not exists public.login_throttle (
  email   text        primary key,
  last_at timestamptz not null,
  day     date        not null,
  count   int         not null default 0
);
alter table public.login_throttle enable row level security;
revoke all on public.login_throttle from anon, authenticated;

create or replace function public.claim_login_send(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.login_throttle%rowtype;
begin
  select * into r from public.login_throttle where email = lower(p_email) for update;
  if not found then
    insert into public.login_throttle (email, last_at, day, count) values (lower(p_email), now(), current_date, 1);
    return true;
  end if;
  if r.last_at > now() - interval '45 seconds' then return false; end if;
  if r.day = current_date and r.count >= 10 then return false; end if;
  update public.login_throttle
     set last_at = now(),
         count   = case when r.day = current_date then r.count + 1 else 1 end,
         day     = current_date
   where email = lower(p_email);
  return true;
end;
$$;
revoke all on function public.claim_login_send(text) from public, anon, authenticated;
grant execute on function public.claim_login_send(text) to service_role;
