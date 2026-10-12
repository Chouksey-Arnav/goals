-- The nightly-record partner report gets its own once-a-day slot.
alter table public.email_log drop constraint if exists email_log_slot_check;
alter table public.email_log add constraint email_log_slot_check check (slot in ('morning', 'midday', 'evening', 'partner'));
