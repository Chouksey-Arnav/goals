// When each of the three daily emails is due. Pure, so it's unit tested.
//
// Vercel's free plan only allows daily cron jobs, each firing somewhere in
// its hour. So vercel.json registers 24 of them (one per UTC hour) and every
// run asks "which email is due right now, in your time zone?". That makes the
// schedule follow GOALS_TZ and daylight saving with no code changes.
//
// Windows (local hours, half-open):
//   morning  [morningHour, min(morningHour + 5, middayHour))
//   midday   [middayHour, eveningHour)   fallback if /api/notify didn't send it
//            early (weekends: morning block done; weekdays: whole sitting done)
//   evening  [eveningHour, 24)
//   partner  same window as morning: yesterday's record, once it's final
//   weekly   same window as morning, Mondays only: last week's habit scorecard
// Each slot sends at most once per day (enforced by the email_log table).

export function windows({ morningHour, middayHour, eveningHour }) {
  return {
    morning: [morningHour, Math.min(morningHour + 5, middayHour)],
    midday: [middayHour, eveningHour],
    evening: [eveningHour, 24],
    partner: [morningHour, Math.min(morningHour + 5, middayHour)],
    weekly: [morningHour, Math.min(morningHour + 5, middayHour)],
  };
}

const inside = (h, [a, b]) => h >= a && h < b;

// The slots a cron run should send now (usually none or one).
// The partner report is only due when there are partners to send it to,
// the weekly kickoff only on the first day of the week (Monday).
export function dueSlots(hour, sent, cfg, { partners = false, weekStart = false } = {}) {
  const w = windows(cfg);
  const slots = ["morning", "midday", "evening", ...(partners ? ["partner"] : []), ...(weekStart ? ["weekly"] : [])];
  return slots.filter((slot) => inside(hour, w[slot]) && !sent[slot]);
}

// Whether ticking lessons may trigger the midday email right now. Never
// before the morning email has gone out (or its window has passed), never
// once the evening window opens, and only once per day.
export function nudgeAllowed(hour, sent, cfg) {
  const w = windows(cfg);
  if (sent.midday || sent.evening) return false;
  if (hour < w.morning[0] || hour >= w.evening[0]) return false;
  return !!sent.morning || hour >= w.morning[1];
}
