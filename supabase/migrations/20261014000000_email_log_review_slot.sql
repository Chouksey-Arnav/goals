-- The end-of-day review email (js/review.js). Safe to re-run.
--
-- email_log gets one more daily slot, 'review', so the review is sent exactly
-- once a day like the other daily emails (inserting the row is the claim).
alter table public.email_log drop constraint if exists email_log_slot_check;
alter table public.email_log add constraint email_log_slot_check check (
  slot in ('morning', 'midday', 'evening', 'review', 'partner', 'weekly')
  or slot ~ '^(done|habit|new):[a-z0-9_.-]{1,64}$'
);
