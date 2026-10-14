import { test } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "../js/state.js";
import { dayFacts } from "../js/digest.js";
import { busyMinutes, localMinute, workFacts, halftimeScore, halftimeWorth, letterFor, BREAKS } from "../js/worktime.js";
import { reviewFacts, gradeDay, fallbackReview, buildReviewMessages, checkReview } from "../js/review.js";
import { compose } from "../js/emails.js";
import { authorized } from "../api/cron.js";

const T = "2026-10-14"; // a Wednesday (school day)
const SAT = "2026-10-17";
const TZ = "America/New_York";
const CFG = { tz: TZ, morningHour: 7, middayHour: 14, eveningHour: 20, reviewHour: 22, workdayStart: 872, weekendStart: 540 };
// 4-6 PM EDT is 20:00-22:00 UTC.
// An end before the start is on the next UTC day (evening events in New York).
const ev = (title, startZ, endZ, extra = {}) => ({ title, start: `${T}T${startZ}:00Z`, end: `${endZ < startZ ? "2026-10-15" : T}T${endZ}:00Z`, allDay: false, ...extra });
const AGENDA = (events = [ev("Soccer practice", "20:00", "22:00")], tasks = {}) => ({
  day: T,
  tz: TZ,
  events,
  tasks: { open: [], doneToday: [], blocks: [], addedToday: { count: 0 }, ...tasks },
});
const ctx = (state, extra = {}) => ({ name: "Sam", appUrl: "https://www.arnavcalendar.online/goals", syncedAt: "Wed 6:10 PM", dayIndex: 3, state, workStart: "2:32 PM", ...extra });

function withDone(k, day = T) {
  const s = fresh();
  dayFacts(s, day).planLessons.slice(0, k).forEach((l) => (s.completed[l.id] = day));
  return s;
}

test("localMinute: local time of day, clamped to the day", () => {
  assert.equal(localMinute(`${T}T20:00:00Z`, TZ, T), 16 * 60);
  assert.equal(localMinute(`${T}T02:00:00Z`, TZ, T), 0, "10 PM the day before");
  assert.equal(localMinute("2026-10-15T12:00:00Z", TZ, T), 24 * 60, "tomorrow");
});

test("busyMinutes: overlaps counted once, clamped to the window, all-day ignored, no calendar = unknown", () => {
  const a = AGENDA([
    ev("Soccer", "20:00", "22:00"),
    ev("Team dinner", "21:30", "23:00"), // 5:30-7 PM, overlaps soccer
    ev("Early thing", "15:00", "19:00"), // 11 AM - 3 PM, only 2:32-3 PM is in the window
    { title: "Birthday", allDay: true, start: `${T}T04:00:00Z`, end: "2026-10-15T04:00:00Z" },
  ]);
  // 2:32-3:00 (28) + 4:00-7:00 (180)
  assert.equal(busyMinutes(a, T, TZ, 872, 1320), 28 + 180);
  assert.equal(busyMinutes(null, T, TZ, 872, 1320), null);
  assert.equal(busyMinutes(AGENDA([]), T, TZ, 872, 1320), 0);
});

test("workFacts: free time is the work day minus the calendar minus breaks", () => {
  const s = withDone(1);
  const F = dayFacts(s, T);
  const w = workFacts(F, AGENDA(), CFG, { day: T });
  assert.equal(w.school, true);
  assert.equal(w.start, 872);
  assert.equal(w.end, 1320);
  assert.equal(w.half, 1096, "6:16 PM");
  assert.equal(w.freeDay, 448 - 120 - BREAKS.school);
  assert.equal(w.workDone, F.doneToday[0].effort);
  assert.equal(w.workLeft, F.plan.targetMin - F.doneMin);
  // At halftime: 2:32-6:16 PM had soccer 4-6 and half the breaks.
  const h = workFacts(F, AGENDA(), CFG, { day: T, now: 1096 });
  assert.equal(h.freeSoFar, 224 - 120 - 30);
  assert.equal(h.freeLeft, 224 - 0 - 30);
  assert.equal(h.label.now, "6:16 PM");
  assert.equal(workFacts(F, null, CFG, { day: T }), null, "no calendar, no free-time claims");
  const sat = workFacts(dayFacts(fresh(), SAT), AGENDA([]), CFG, { day: SAT });
  assert.equal(sat.start, 540, "weekends start at 9 AM");
  assert.equal(sat.breaks, BREAKS.weekend);
});

test("halftime score: judged against the halfway target of 50%", () => {
  const n = dayFacts(fresh(), T).planLessons.length;
  const zero = halftimeScore(dayFacts(fresh(), T), AGENDA());
  assert.equal(zero.pct, 0);
  assert.equal(zero.letter, "F");
  const all = halftimeScore(dayFacts(withDone(n), T), AGENDA());
  assert.equal(all.pct, 100);
  assert.equal(all.letter, "A");
  const some = dayFacts(withDone(Math.ceil(n / 3)), T);
  const sc = halftimeScore(some, AGENDA());
  assert.equal(sc.pct, some.pct, "only the course plan exists today");
  assert.equal(sc.ofTarget, Math.min(100, Math.round((some.pct / 50) * 100)));
  assert.equal(sc.letter, letterFor(sc.ofTarget));
  // A to-do due today counts as a third of the list; done ones count for you.
  const todo = halftimeScore(dayFacts(fresh(), T), AGENDA([], { open: [{ title: "Email Mr. Patel", due: T, overdue: false }], doneToday: [{ title: "Slip" }] }));
  assert.equal(todo.pct, Math.round((25 * 0.5 / 75) * 100));
  assert.equal(todo.open.length, 1);
  assert.equal(halftimeWorth(dayFacts(withDone(n), T)), false, "nothing left: no halftime email");
  assert.equal(halftimeWorth(dayFacts(fresh(), T)), true);
});

test("halftime email: grade, where the first half went, whether the rest fits", () => {
  const s = withDone(1);
  const F = dayFacts(s, T);
  const work = workFacts(F, AGENDA([]), CFG, { day: T, now: 1096 });
  const mail = compose("halftime", F, ctx(s, { work, halftime: halftimeScore(F, AGENDA([])) }));
  assert.match(mail.subject, /^Halftime · [A-F]\. \d+% done, and half the day is gone\.$/);
  assert.match(mail.text, /It's 6:16 PM\. Your work day runs 2:32 PM to 10 PM/);
  assert.match(mail.text, /Halfway means 50%/);
  assert.match(mail.text, /went somewhere else\. That was a choice\./, "free afternoon, little logged");
  assert.match(mail.text, /Free until 10 PM: about/);
  assert.match(mail.text, /phone in another room/i);
  assert.doesNotMatch(mail.text, /!/);
  // A packed afternoon: no "that was a choice", and the numbers say it doesn't fit.
  const busy = AGENDA([ev("Practice", "18:32", "22:00"), ev("Tutoring", "22:16", "01:30")]);
  const w2 = workFacts(F, busy, CFG, { day: T, now: 1096 });
  const m2 = compose("halftime", F, ctx(s, { work: w2, halftime: halftimeScore(F, busy) }));
  assert.doesNotMatch(m2.text, /That was a choice/);
  assert.match(m2.text, /It doesn't fit anymore: you're .* short/);
  // Ahead of the target.
  const n = F.planLessons.length;
  const ahead = withDone(n - 1);
  const Fa = dayFacts(ahead, T);
  const m3 = compose("halftime", Fa, ctx(ahead, { work: workFacts(Fa, AGENDA([]), CFG, { day: T, now: 1096 }), halftime: halftimeScore(Fa, AGENDA([])) }));
  assert.match(m3.subject, /Keep the lead\.$/);
  // No calendar: still sends, says why there's no time math.
  const m4 = compose("halftime", F, ctx(s, { work: null, halftime: halftimeScore(F, null) }));
  assert.match(m4.text, /calendar wasn't reachable/);
});

test("review: free time decides whether a miss was a choice", () => {
  const s = withDone(1);
  const F = dayFacts(s, T);
  const free = reviewFacts(F, s, { agenda: AGENDA([]), cfg: CFG }).facts.find((f) => f.area === "time");
  assert.equal(free.status, "missed");
  assert.equal(free.flag, "slack");
  assert.match(free.text, /The time was there; it went to something else\./);
  assert.match(free.text, /between 2:32 PM and 10 PM/);
  // Overbooked: the plan needs fixing, not an accusation.
  const packed = AGENDA([ev("Game", "18:32", "02:00")]); // 2:32 PM to 10 PM
  const over = reviewFacts(F, s, { agenda: packed, cfg: CFG }).facts.find((f) => f.area === "time");
  assert.equal(over.status, "info");
  assert.match(over.text, /overbooked/);
  // No calendar or no cfg: no time fact at all.
  assert.equal(reviewFacts(F, s, { agenda: null, cfg: CFG }).facts.some((f) => f.area === "time"), false);
  assert.equal(reviewFacts(F, s, { agenda: AGENDA([]) }).facts.some((f) => f.area === "time"), false);
  // The time fact doesn't change the grade (it explains it).
  const a = gradeDay(reviewFacts(F, s, { agenda: AGENDA([]), cfg: CFG }).facts);
  const b = gradeDay(reviewFacts(F, s, { agenda: AGENDA([]) }).facts);
  assert.deepEqual(a, b);
});

test("review without Groq: 'you had the time' first, tomorrow starts at the work start", () => {
  const s = withDone(1);
  const F = dayFacts(s, T);
  const { facts } = reviewFacts(F, s, { agenda: AGENDA([]), cfg: CFG });
  const r = fallbackReview({ facts, grade: gradeDay(facts), workStart: "2:32 PM" });
  assert.match(r.verdict, /^You had the time\. You chose something else\./);
  assert.match(r.pattern, /wasn't a scheduling problem/);
  assert.equal(r.missed[0].fact, facts.find((f) => f.flag === "slack").id, "the time miss leads");
  assert.match(r.tomorrow[0], /^2:32 PM: phone in another room, YouTube closed, open “/);
});

test("review prompt: more ruthless, never insulting", () => {
  const s = withDone(1);
  const F = dayFacts(s, T);
  const { facts, tomorrow } = reviewFacts(F, s, { agenda: AGENDA([]), cfg: CFG });
  const grade = gradeDay(facts);
  const [sys, user] = buildReviewMessages({ day: T, weekday: "Wednesday", grade, facts, tomorrow, name: "Sam", workStart: "2:32 PM" });
  assert.match(sys.content, /more ruthless/);
  assert.match(sys.content, /You had the time\. You chose something else\./);
  assert.match(sys.content, /no name-calling/);
  assert.match(user.content, /TOMORROW'S WORK START: 2:32 PM\./);
  const slack = facts.find((f) => f.flag === "slack");
  const out = checkReview(
    {
      headline: `${grade.letter}. You had the time and didn't use it.`,
      verdict: "You had the time. You chose something else. That's lazy.",
      did: [],
      missed: [{ fact: slack.id, line: "You're a loser for skipping it." }],
      pattern: "",
      tomorrow: [{ order: "2:32 PM: phone in another room, open the next lesson.", fact: null }],
      question: "What will you close before 2:32 PM?",
    },
    { facts, grade, tomorrow }
  );
  assert.equal(out.verdict, "You had the time. You chose something else.", "the insult is cut, the point stays");
  assert.equal(out.missed.find((m) => m.fact === slack.id).line, slack.text, "an insulting line is replaced by the record's words");
});

test("cron auth: CRON_SECRET does anything; the calendar's secret only runs the minute clock", () => {
  const cfg = { cronSecret: "goals-secret", calendarSecret: "cal-secret" };
  const req = (url, key) => ({ url, headers: key ? { authorization: `Bearer ${key}` } : {} });
  assert.equal(authorized(req("/api/cron?utc=14", "goals-secret"), cfg), true);
  assert.equal(authorized(req("/api/cron?slot=review&dry=1", "goals-secret"), cfg), true);
  assert.equal(authorized(req("/api/cron?src=db", "cal-secret"), cfg), true);
  assert.equal(authorized(req("/api/cron?src=db&slot=evening&force=1", "cal-secret"), cfg), false, "no forced sends");
  assert.equal(authorized(req("/api/cron?src=db&status=1", "cal-secret"), cfg), false, "no status dump");
  assert.equal(authorized(req("/api/cron", "cal-secret"), cfg), false, "only as the minute clock");
  assert.equal(authorized(req("/api/cron?src=db", "wrong"), cfg), false);
  assert.equal(authorized(req("/api/cron?src=db", ""), { cronSecret: "x", calendarSecret: "" }), false, "an unset secret never matches");
});
