-- Habits and completion emails. Safe to re-run.
--
-- email_log gets three kinds of per-item rows next to the daily slots, so
-- each one is sent exactly once (inserting the row is the claim):
--   done:<lesson id>   a lesson you ticked that day
--   habit:<habit id>   a habit you did that day
--   new:<habit id>     a habit you created that day (its "make it stick" plan)
-- and 'weekly', the Monday kickoff with last week's habit scorecard.
alter table public.email_log drop constraint if exists email_log_slot_check;
alter table public.email_log add constraint email_log_slot_check check (
  slot in ('morning', 'midday', 'evening', 'partner', 'weekly')
  or slot ~ '^(done|habit|new):[a-z0-9_.-]{1,64}$'
);
