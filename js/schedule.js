// When each daily email is due. Pure, so it's unit tested.
//
// Two clocks call this, and the email_log claim keeps them from sending
// anything twice:
//   - Supabase pg_cron, every minute (supabase/migrations/
//     20261015000100_goals_tick.sql), so "2:32 PM" means 2:32 PM.
//   - Vercel Cron, hourly (vercel.json, 24 daily jobs), as the backup if the
//     database clock stops. Those fire anywhere inside their hour.
// Every run asks "which email is due right now, in your time zone?", so the
// schedule follows GOALS_TZ and daylight saving with no code changes.
//
// The day is built around school. On school days (Mon-Fri) the work day
// starts when you get home (WORKDAY_START, default 14:32); on weekends it
// starts at WEEKEND_START (default 09:00). It ends at the review hour.
//
// Windows, in local minutes since midnight (half-open):
//   morning   [morningHour, min(morningHour + 5h, midday start))
//   midday    school day: [WORKDAY_START, halftime)   "work starts now"
//             weekend:    [middayHour, halftime)      the afternoon handoff
//             Either can also go early from /api/notify (weekend: morning
//             block done; weekday: whole sitting done).
//   halftime  [halfway between work start and review, eveningHour)
//             the graded halfway check (js/halftime.js)
//   evening   [eveningHour, reviewHour)
//   review    [reviewHour, 24:00)   the end-of-day review (js/review.js)
//   partner   same window as morning: yesterday's record, once it's final
//   weekly    same window as morning, Mondays only: last week's habit scorecard
// Each slot sends at most once per day (enforced by the email_log table).

export const DAY_MIN = 24 * 60;

// "14:32" -> 872. Anything else -> null.
export function parseHM(raw) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(raw ?? ""));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

// 872 -> "2:32 PM", 840 -> "2 PM".
export function clockLabel(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

// "YYYY-MM-DD" -> is it a school day (Monday to Friday)? Holidays aren't
// known; on a day off the "work starts" email still comes at 2:32 PM.
export function isSchoolDay(day) {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return dow >= 1 && dow <= 5;
}

export const DEFAULT_WORKDAY_START = 14 * 60 + 32;
export const DEFAULT_WEEKEND_START = 9 * 60;

// When the work day starts and ends, in local minutes.
export function workday(cfg, school) {
  const start = school ? cfg.workdayStart ?? DEFAULT_WORKDAY_START : cfg.weekendStart ?? DEFAULT_WEEKEND_START;
  const end = (cfg.reviewHour ?? 24) * 60;
  return { start, end, half: Math.round((start + end) / 2) };
}

export function windows(cfg, { school = true } = {}) {
  const { morningHour, middayHour, eveningHour, reviewHour = 24 } = cfg;
  const wd = workday(cfg, school);
  const evening = eveningHour * 60;
  // Custom hours with the evening wrap before you're even home: fall back
  // to the plain midday hour rather than an empty window.
  const middayStart = school && wd.start < evening ? wd.start : middayHour * 60;
  // A halftime that doesn't land between the midday email and the evening
  // wrap (odd custom hours) is dropped rather than squeezed in.
  const halftimeOk = wd.half > middayStart && wd.half < evening;
  const morning = [morningHour * 60, Math.min((morningHour + 5) * 60, middayStart)];
  return {
    morning,
    midday: [middayStart, halftimeOk ? wd.half : evening],
    halftime: halftimeOk ? [wd.half, evening] : [0, 0],
    evening: [evening, reviewHour * 60],
    review: [reviewHour * 60, DAY_MIN],
    partner: morning,
    weekly: morning,
  };
}

const inside = (m, [a, b]) => m >= a && m < b;

// clock: { min: local minutes since midnight, school: is it a school day }.
// The slots a run should send now (usually none or one). The partner report
// is only due when there are partners to send it to, the weekly kickoff only
// on the first day of the week (Monday).
export function dueSlots(clock, sent, cfg, { partners = false, weekStart = false } = {}) {
  const w = windows(cfg, clock);
  const slots = ["morning", "midday", "halftime", "evening", "review", ...(partners ? ["partner"] : []), ...(weekStart ? ["weekly"] : [])];
  return slots.filter((slot) => inside(clock.min, w[slot]) && !sent[slot]);
}

// Whether ticking lessons may trigger the midday email right now. Never
// before the morning email has gone out (or its window has passed), never
// once the evening window opens, and only once per day.
export function nudgeAllowed(clock, sent, cfg) {
  const w = windows(cfg, clock);
  if (sent.midday || sent.evening) return false;
  if (clock.min < w.morning[0] || clock.min >= w.evening[0]) return false;
  return !!sent.morning || clock.min >= w.morning[1];
}
