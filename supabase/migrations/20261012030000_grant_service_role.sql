-- Applied to the "Focus" project on 2026-10-12.
--
-- This project has table auto-expose off, so new tables grant service_role
-- nothing beyond TRUNCATE/REFERENCES/TRIGGER. The server (secret key) got
-- "permission denied for table progress" (HTTP 403) on every read, so the
-- "Send me motivation" button and every scheduled email failed, and no row
-- ever reached email_log. service_role bypasses RLS, but still needs grants.
grant select, insert, update, delete on public.progress       to service_role;
grant select, insert, update, delete on public.email_log      to service_role;
grant select, insert, update, delete on public.login_throttle to service_role;

-- Future tables created by postgres get the same, so this can't recur.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
