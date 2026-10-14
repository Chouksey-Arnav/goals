// Time math for the halftime check and the end-of-day review: how much free
// time the work day had, how much of it turned into logged work, and whether
// what's left still fits. Pure: no DOM, no storage, no clock (callers pass
// "now" in local minutes).
//
// "Free" means: the work day (js/schedule.js, school days from 14:32, weekends
// from 09:00, until the review hour), minus timed events on your calendar,
// minus a flat allowance for dinner and breaks (they aren't on the calendar,
// and pretending they don't exist would make every number unfair).
// Without the calendar there is no free-time number at all: the review never
// accuses you of free time it can't see.

import { workday, isSchoolDay, clockLabel } from "./schedule.js";

// The one letter scale for the review and halftime: share of the target kept.
export function letterFor(pct) {
  return pct >= 90 ? "A" : pct >= 75 ? "B" : pct >= 60 ? "C" : pct >= 40 ? "D" : "F";
}

// Dinner and breaks, in minutes, per work day.
export const BREAKS = { school: 60, weekend: 120 };

// Local minutes since midnight of an instant, clamped to `day`: an event that
// started yesterday counts from 0, one that ends tomorrow until 24:00.
export function localMinute(iso, tz, day) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value])
  );
  const d = `${p.year}-${p.month}-${p.day}`;
  if (d < day) return 0;
  if (d > day) return 24 * 60;
  return (Number(p.hour) % 24) * 60 + Number(p.minute);
}

// Minutes inside [from, to) covered by timed calendar events (overlaps
// counted once). null when there's no calendar to read.
export function busyMinutes(agenda, day, tz, from, to) {
  if (!agenda || to <= from) return agenda ? 0 : null;
  const zone = agenda.tz || tz;
  const spans = (agenda.events || [])
    .filter((e) => !e.allDay && e.start && e.end)
    .map((e) => [Math.max(from, localMinute(e.start, zone, day)), Math.min(to, localMinute(e.end, zone, day))])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let end = from;
  for (const [a, b] of spans) {
    if (b <= end) continue;
    total += b - Math.max(a, end);
    end = b;
  }
  return total;
}

// The work day as numbers. now: local minutes (null = the day is over).
// F: dayFacts(). Returns null without a calendar.
export function workFacts(F, agenda, cfg, { day = F.t, now = null, tz = cfg.tz } = {}) {
  if (!agenda) return null;
  const school = isSchoolDay(day);
  const wd = workday(cfg, school);
  const at = now == null ? wd.end : Math.max(wd.start, Math.min(wd.end, now));
  const breaks = school ? BREAKS.school : BREAKS.weekend;
  const len = wd.end - wd.start;
  // Breaks are spread evenly over the day, so the first half gets half.
  const share = (a, b) => Math.round((breaks * (b - a)) / Math.max(1, len));
  const free = (a, b) => Math.max(0, b - a - busyMinutes(agenda, day, tz, a, b) - share(a, b));
  const workDone = F.doneToday.reduce((s, l) => s + (l.effort || 0), 0);
  const lessonsLeft = F.finished || F.rest ? 0 : Math.max(0, F.plan.targetMin - F.doneMin);
  return {
    school,
    start: wd.start,
    end: wd.end,
    half: wd.half,
    now: at,
    breaks,
    // The whole day, and before / after "now".
    freeDay: free(wd.start, wd.end),
    freeSoFar: free(wd.start, at),
    freeLeft: free(at, wd.end),
    // Real-work estimates of every lesson ticked today (planned or extra).
    workDone,
    // Real-work estimate of the planned lessons still open.
    workLeft: lessonsLeft,
    planMin: F.finished || F.rest ? 0 : F.plan.targetMin,
    label: { start: clockLabel(wd.start), end: clockLabel(wd.end), now: clockLabel(at) },
  };
}

// ---------- halftime: are you through half of today's list?

// Share of today's commitments done right now, weighted like the review's
// grade: course plan 50, habits 25, calendar to-dos 25, renormalized over
// whatever exists today. Then judged against the halfway target of 50%:
// 50% done at halftime is an A; 25% is 50% of the target, a D.
export function halftimeScore(F, agenda) {
  const parts = [];
  const coursesOn = !F.finished && !F.rest && F.planLessons.length > 0;
  if (coursesOn) parts.push({ w: 50, s: F.mode === "min" ? (F.shownToday ? 1 : 0) : F.pct / 100 });
  const due = F.habits.due;
  if (due.length) parts.push({ w: 25, s: due.reduce((a, x) => a + (x.status === "full" ? 1 : x.status === "min" ? 0.5 : 0), 0) / due.length });
  const done = agenda?.tasks?.doneToday || [];
  const open = (agenda?.tasks?.open || []).filter((x) => x.due === F.t || x.overdue);
  if (done.length + open.length) parts.push({ w: 25, s: done.length / (done.length + open.length) });
  if (!parts.length) return null;
  const total = parts.reduce((a, p) => a + p.w, 0);
  const pct = Math.round((parts.reduce((a, p) => a + p.w * p.s, 0) / total) * 100);
  const ofTarget = Math.min(100, Math.round((pct / 50) * 100));
  return { pct, ofTarget, letter: letterFor(ofTarget), open };
}

// Worth a halftime email? Not when everything is already done (the "day
// complete" email covered it), and not when there's nothing to judge.
export function halftimeWorth(F) {
  const coursesOpen = !F.finished && !F.rest && F.planLessons.length > 0 && !F.complete;
  return coursesOpen || F.habits.open.length > 0;
}
