// "Where do I stand today", computed from the saved state alone.
// Pure: no DOM, no storage, no clock. The app's Today tab and the email
// server both call dayFacts(), so the plan in your inbox is the same plan
// the app shows, lesson for lesson.

import { allLessons, plannable, TRACK_START } from "./data.js";
import * as P from "./planner.js";
import * as H from "./habits.js";
import { habitFacts } from "./dailyhabits.js";

export const LESSONS = allLessons();
export const BY_ID = Object.fromEntries(LESSONS.map((l) => [l.id, l]));

// "YYYY-MM-DD", hour (0-23) and minute of the day of an instant in an IANA time zone. The email
// server runs in UTC; your day does not.
export function zonedParts(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const hour = Number(parts.hour) % 24;
  // min: minutes since local midnight (the schedule runs on minutes).
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour, min: hour * 60 + Number(parts.minute) };
}

// state: the app's saved state (already normalized).
// t: today's "YYYY-MM-DD" in the user's time zone.
// keyOf(ms): converts a timestamp to a day key in the same time zone.
export function dayFacts(state, t, keyOf = (ms) => P.dayKey(new Date(ms))) {
  const s = state.settings;
  const completed = state.completed || {};
  const isDone = (l) => !!completed[l.id];
  const lessons = plannable(LESSONS, s.includeOptional);
  const plan = P.planDay({ lessons, completed, today: t, settings: s });
  const byDay = P.minutesByDay(LESSONS, completed);
  const active = H.activeSet(completed);
  const remaining = lessons.filter((l) => !isDone(l)).length;
  const finishedOn = remaining === 0 ? [...active].sort().pop() || t : null;
  const ctx = { active, today: t, settings: s, trackStart: TRACK_START, finishedOn };
  const isRest = (k) => H.isRestDay(k, s);
  const c = state.contract || {};
  const signedDay = c.signedAt ? keyOf(c.signedAt) : null;
  const strikeDays = signedDay ? H.strikes(ctx, signedDay) : [];
  const unpaid = strikeDays.filter((d) => !(state.penaltyPaid || {})[d]);
  const planLessons = plan.ids.map((id) => BY_ID[id]).filter(Boolean);
  const dayLog = state.dayLog || {};
  const mode = dayLog[t]?.mode === "min" ? "min" : "full";
  const shownUp = [...active].filter((k) => k >= TRACK_START);
  const doneToday = LESSONS.filter((l) => completed[l.id] === t);
  const shownToday = active.has(t);
  const history = state.history || {};

  // Today's ring: share of the planned minutes done (bad-day mode is all or nothing).
  const planDone = planLessons.filter(isDone);
  const doneMin = P.sumEffort(planDone);
  const fullPct = plan.targetMin ? Math.min(100, Math.round((doneMin / plan.targetMin) * 100)) : 100;
  const pct = mode === "min" ? (shownToday ? 100 : 0) : fullPct;
  const complete = mode === "min" ? shownToday : planLessons.length > 0 && planLessons.every(isDone);

  // Weekend: a morning block and an afternoon block. Weekday (or bad-day
  // mode, which is one lesson): null, meaning one sitting, all in one go.
  const halves = mode === "min" ? null : P.splitSessions(planLessons, t);
  const block = (ls) => {
    const left = ls.filter((l) => !isDone(l));
    return { lessons: ls, min: P.sumEffort(ls), left, leftMin: P.sumEffort(left), done: left.length === 0 };
  };
  const sessions = halves ? { am: block(halves.am), pm: block(halves.pm) } : null;

  return {
    t, s, plan, planLessons, byDay, active, ctx, finishedOn, remaining, mode,
    next: planLessons.find((l) => !isDone(l)),
    planDone, doneMin, pct, complete, sessions,
    leftLessons: planLessons.filter((l) => !isDone(l)),
    doneToday, shownToday,
    finished: plan.lessonsRemaining === 0,
    rest: isRest(t),
    streak: P.streak(active, t, isRest),
    best: P.bestStreak(active, isRest),
    missRun: finishedOn ? 0 : H.missRun(ctx),
    allStrikes: H.strikes(ctx, P.addDays(TRACK_START, -1)),
    strikeDays, unpaid, signedDay,
    owed: unpaid.length * (Number(c.penaltyAmount) || 0),
    partner: (c.partners || []).find((p) => p?.name?.trim()),
    votes: Object.values(completed).filter((v) => v !== "pre").length,
    perfect: Object.keys(byDay).filter((k) => history[k] && byDay[k].min >= history[k]).length,
    minDays: shownUp.filter((k) => dayLog[k]?.mode === "min").length,
    shownUpDays: shownUp.length,
    phase: H.reinforcementPhase(shownUp.length),
    savings: H.savingsTotals(state.avoidLog, state.transferred),
    yesterday: dayLog[P.addDays(t, -1)] || {},
    habits: habitFacts(state, t),
  };
}

// When ticking a lesson sends the midday email early (instead of waiting for
// the mid-afternoon fallback):
// - Weekend: the moment the morning block is done. That email hands you the
//   afternoon block.
// - Weekday: one sitting, so no email interrupts it halfway. It fires once
//   the whole day is done.
// Bad-day mode is one lesson: done or not.
export function reachedHalfway(F) {
  if (F.finished || F.rest) return false;
  if (F.complete) return true;
  if (F.mode === "min") return false;
  return !!F.sessions?.am.done;
}
