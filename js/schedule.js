// When each of the three daily emails is due. Pure, so it's unit tested.
//
// Vercel's free plan only allows daily cron jobs, each firing somewhere in
// its hour. So vercel.json registers 24 of them (one per UTC hour) and every
// run asks "which email is due right now, in your time zone?". That makes the
// schedule follow GOALS_TZ and daylight saving with no code changes.
//
// Windows (local hours, half-open):
//   morning  [morningHour, min(morningHour + 5, middayHour))
//   midday   [middayHour, eveningHour)   fallback if halfway never triggered it
//   evening  [eveningHour, 24)
// Each slot sends at most once per day (enforced by the email_log table).

export function windows({ morningHour, middayHour, eveningHour }) {
  return {
    morning: [morningHour, Math.min(morningHour + 5, middayHour)],
    midday: [middayHour, eveningHour],
    evening: [eveningHour, 24],
  };
}

const inside = (h, [a, b]) => h >= a && h < b;

// The slot a cron run should send now, or null.
export function dueSlot(hour, sent, cfg) {
  const w = windows(cfg);
  for (const slot of ["morning", "midday", "evening"]) if (inside(hour, w[slot]) && !sent[slot]) return slot;
  return null;
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
