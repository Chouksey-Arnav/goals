-- "Send me motivation": at most one per 60 seconds and 8 per day per email.
-- Shares the login_throttle table under a "boost:" key. Returns the day's
-- count after this send (1..8), or 0 when throttled.
create or replace function public.claim_boost_send(p_email text, p_day date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := 'boost:' || lower(p_email);
  r public.login_throttle%rowtype;
begin
  select * into r from public.login_throttle where email = k for update;
  if not found then
    insert into public.login_throttle (email, last_at, day, count) values (k, now(), p_day, 1);
    return 1;
  end if;
  if r.last_at > now() - interval '60 seconds' then return 0; end if;
  if r.day = p_day and r.count >= 8 then return 0; end if;
  update public.login_throttle
     set last_at = now(),
         count   = case when r.day = p_day then r.count + 1 else 1 end,
         day     = p_day
   where email = k;
  return case when r.day = p_day then r.count + 1 else 1 end;
end;
$$;
revoke all on function public.claim_boost_send(text, date) from public, anon, authenticated;
grant execute on function public.claim_boost_send(text, date) to service_role;
