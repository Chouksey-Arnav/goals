-- Minute-accurate daily emails. Safe to re-run.
--
-- Vercel's Hobby plan only allows daily cron jobs that fire anywhere inside
-- their hour, so "work starts at 2:32 PM" and "halftime at 6:16 PM" would
-- arrive up to 59 minutes late. The calendar app already uses the database
-- as its clock (calendarforarnav: 20261013000100_reminder_tick.sql); this
-- does the same for Goals: pg_cron runs every minute and pg_net calls
-- /api/cron?src=db. The endpoint decides what's due (js/schedule.js) and the
-- email_log claim keeps it exactly once. The 24 hourly Vercel crons stay as
-- the backup clock.
--
-- Secrets live in Supabase Vault, not in this file:
--   goals_cron_url   the goals project's own address, NOT the site's /goals
--                    path, so the clock doesn't depend on the site's rewrite:
--     select vault.create_secret('https://goals-taupe-six.vercel.app/api/cron?src=db', 'goals_cron_url');
--   cal_cron_secret  already there for the calendar's clock. Goals accepts it
--                    as CALENDAR_SECRET for this plain run only (no previews,
--                    no forced sends: api/cron.js, authorized()).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.goals_tick() returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u text;
  s text;
begin
  select decrypted_secret into u from vault.decrypted_secrets where name = 'goals_cron_url';
  select decrypted_secret into s from vault.decrypted_secrets where name = 'cal_cron_secret';
  if u is null or s is null then
    raise warning 'goals_tick: vault secrets goals_cron_url / cal_cron_secret are missing';
    return null;
  end if;
  return net.http_get(
    url := u,
    headers := jsonb_build_object('Authorization', 'Bearer ' || s),
    timeout_milliseconds := 55000
  );
end;
$$;
revoke all on function public.goals_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'goals-emails';
select cron.schedule('goals-emails', '* * * * *', 'select public.goals_tick()');
