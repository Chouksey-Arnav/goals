// Pure planning logic. No DOM, no storage, so it can be unit tested in Node.
//
// Core idea: today's plan is a function of (lessons finished BEFORE today,
// settings, today's date). Lessons ticked today do not shrink today's plan,
// so the list stays stable all day. If you miss a day, tomorrow's plan grows
// automatically because the same remaining work is spread over fewer days.

// ---------- dates (local time, "YYYY-MM-DD" keys sort correctly as strings)

export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d, 12); // noon avoids DST edge cases
}

export function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function diffDays(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

export function isWeekend(k) {
  const g = parseKey(k).getDay();
  return g === 0 || g === 6;
}

export function capacityFor(k, settings) {
  return isWeekend(k) ? settings.weekendMin : settings.weekdayMin;
}

// ---------- completion helpers
// completed: { [lessonId]: "YYYY-MM-DD" | "pre" }   "pre" = done before tracking

export function doneBefore(completed, id, k) {
  const v = completed[id];
  return v === "pre" || (typeof v === "string" && v < k);
}

export function sumEffort(lessons) {
  return lessons.reduce((a, l) => a + l.effort, 0);
}

// ---------- the plan

export function planDay({ lessons, completed, today, settings }) {
  const rem = lessons.filter((l) => !doneBefore(completed, l.id, today));
  const total = sumEffort(rem);

  // Aim to finish bufferDays before the deadline. Plans slip; slack is the
  // difference between "finished Oct 31" and "finished Nov 4".
  let end = addDays(settings.deadline, -settings.bufferDays);
  if (end < today) end = settings.deadline < today ? today : settings.deadline;

  const days = [];
  for (let k = today; k <= end; k = addDays(k, 1)) days.push(k);
  let weights = days.map((k) => capacityFor(k, settings));
  if (weights.every((w) => w <= 0)) weights = days.map(() => 1);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const rawTarget = total === 0 ? 0 : (total * weights[0]) / sumW;

  // Split today's target across courses in proportion to what each has left,
  // so both courses finish together instead of one starving.
  const ids = [];
  for (const courseId of [...new Set(rem.map((l) => l.course))]) {
    const list = rem.filter((l) => l.course === courseId);
    const quota = (rawTarget * sumEffort(list)) / total;
    let taken = 0;
    for (const l of list) {
      const first = taken === 0 && quota > 0;
      if (first || taken + l.effort / 2 <= quota) {
        ids.push(l.id);
        taken += l.effort;
      } else break;
    }
  }

  const targetMin = sumEffort(lessons.filter((l) => ids.includes(l.id)));
  const finishAtCapacity = projectFinish(total, today, settings);

  return {
    ids,
    targetMin,
    totalRemaining: total,
    lessonsRemaining: rem.length,
    daysLeft: diffDays(today, settings.deadline) + 1,
    planEnd: end,
    requiredAvg: Math.ceil(total / Math.max(1, days.length)),
    capacityToday: capacityFor(today, settings),
    finishAtCapacity,
    onTrack: finishAtCapacity !== null && finishAtCapacity <= settings.deadline,
  };
}

// How a day's plan is worked. Weekdays are one sitting: everything in one go.
// Weekends are two blocks: about half the minutes in the morning, the rest in
// the afternoon. The cut keeps plan order (math first) and picks the split
// point closest to half the minutes; a tie gives the morning the extra,
// while you're fresh. Fewer than two lessons can't be halved: one sitting.
export function splitSessions(lessons, k) {
  if (!isWeekend(k) || lessons.length < 2) return null;
  const total = sumEffort(lessons);
  let best = 1;
  let bestGap = Infinity;
  let acc = 0;
  for (let i = 1; i < lessons.length; i++) {
    acc += lessons[i - 1].effort;
    const gap = Math.abs(acc - total / 2);
    if (gap < bestGap || (gap === bestGap && i > best)) {
      best = i;
      bestGap = gap;
    }
  }
  return { am: lessons.slice(0, best), pm: lessons.slice(best) };
}

// If you study exactly your stated capacity every day, when do you finish?
export function projectFinish(total, today, settings, horizon = 365) {
  if (total <= 0) return today;
  let acc = 0;
  for (let i = 0, k = today; i < horizon; i++, k = addDays(k, 1)) {
    acc += capacityFor(k, settings);
    if (acc >= total) return k;
  }
  return null;
}

// Next not-done lessons outside today's plan, for "get ahead" mode.
export function aheadLessons({ lessons, completed, planIds, n = 3 }) {
  const out = [];
  for (const courseId of [...new Set(lessons.map((l) => l.course))]) {
    const next = lessons.find(
      (l) => l.course === courseId && !completed[l.id] && !planIds.includes(l.id)
    );
    if (next) out.push(next);
  }
  return out.slice(0, n);
}

// ---------- history, streaks

export function minutesByDay(lessons, completed) {
  const byId = Object.fromEntries(lessons.map((l) => [l.id, l]));
  const map = {};
  for (const [id, k] of Object.entries(completed)) {
    if (k === "pre" || !byId[id]) continue;
    map[k] = map[k] || { min: 0, count: 0 };
    map[k].min += byId[id].effort;
    map[k].count += 1;
  }
  return map;
}

// A day "counts" if you showed up (finished at least one lesson).
// Streak = consecutive counted days ending today, or yesterday if today
// is still in progress. Rest days (isRest) neither add to nor break it.
export function streak(activeDays, today, isRest = () => false) {
  if (!activeDays.size) return 0;
  const first = [...activeDays].sort()[0];
  let k = activeDays.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (k >= first) {
    if (activeDays.has(k)) n++;
    else if (!isRest(k)) break;
    k = addDays(k, -1);
  }
  return n;
}

export function bestStreak(activeDays, isRest = () => false) {
  const keys = [...activeDays].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of keys) {
    let joined = false;
    if (prev) {
      let g = addDays(prev, 1);
      while (g < k && isRest(g)) g = addDays(g, 1);
      joined = g === k;
    }
    run = joined ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

// "Never miss twice": yesterday was missed and today has nothing yet.
export function missedYesterday(activeDays, today, trackStart) {
  const y = addDays(today, -1);
  return y >= trackStart && !activeDays.has(y) && !activeDays.has(today);
}
