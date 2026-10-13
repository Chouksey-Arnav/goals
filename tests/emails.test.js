import { test } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "../js/state.js";
import { dayFacts, reachedHalfway, zonedParts, LESSONS } from "../js/digest.js";
import { compose, composePartner, composeBoost, boostPrinciple } from "../js/emails.js";
import { dueSlots, nudgeAllowed, windows } from "../js/schedule.js";
import { parseList, emailHours } from "../api/_lib/env.js";
import { isAuthError } from "../api/_lib/mailer.js";
import { hint, isStale, STALE_MIN } from "../api/_lib/supabase.js";
import { isAlertHour } from "../api/_lib/run.js";
import { PRINCIPLES, rotation, pickPrinciple } from "../js/principles.js";
import * as P from "../js/planner.js";

const T = "2026-10-14"; // a Wednesday
const ctx = (state) => ({ name: "Sam", appUrl: "https://goals.example", syncedAt: "Wed 7:02 AM", dayIndex: 3, state });

// State where today's plan is ticked `k` lessons deep.
function withDone(k, { day = T, mode } = {}) {
  const s = fresh();
  const F0 = dayFacts(s, day);
  F0.planLessons.slice(0, k).forEach((l) => (s.completed[l.id] = day));
  if (mode) s.dayLog[day] = { mode };
  return s;
}
// Show up on each listed day with one lesson that isn't in today's plan.
function showUp(s, days) {
  const spare = LESSONS.filter((l) => !s.completed[l.id]).reverse();
  days.forEach((d, i) => (s.completed[spare[i].id] = d));
  return s;
}

const CFG = { morningHour: 7, middayHour: 14, eveningHour: 20 };
const none = {};

test("zonedParts: same instant, different local day and hour", () => {
  const at = new Date("2026-10-15T02:30:00Z");
  assert.deepEqual(zonedParts(at, "America/New_York"), { day: "2026-10-14", hour: 22 });
  assert.deepEqual(zonedParts(at, "Asia/Kolkata"), { day: "2026-10-15", hour: 8 });
  assert.deepEqual(zonedParts(new Date("2026-10-15T04:00:00Z"), "America/New_York"), { day: "2026-10-15", hour: 0 });
});

test("dueSlots: one email per window, never twice", () => {
  const due = (h, sent, opts) => dueSlots(h, sent, CFG, opts);
  assert.deepEqual(due(6, none), []);
  assert.deepEqual(due(7, none), ["morning"]);
  assert.deepEqual(due(11, none), ["morning"], "a late cron still delivers the morning plan");
  assert.deepEqual(due(12, none), [], "after noon a morning plan is stale");
  assert.deepEqual(due(9, { morning: {} }), []);
  assert.deepEqual(due(14, { morning: {} }), ["midday"]);
  assert.deepEqual(due(15, { morning: {}, midday: {} }), [], "halfway nudge already sent it");
  assert.deepEqual(due(20, { morning: {}, midday: {} }), ["evening"]);
  assert.deepEqual(due(23, { morning: {}, midday: {}, evening: {} }), []);
  // The partner report rides the morning window, only when there are partners.
  assert.deepEqual(due(7, none, { partners: true }), ["morning", "partner"]);
  assert.deepEqual(due(8, { morning: {} }, { partners: true }), ["partner"], "a failed report retries next hour");
  assert.deepEqual(due(14, { morning: {} }, { partners: true }), ["midday"], "no stale report after the morning");
  // Morning window never overlaps midday, even with a late morning hour.
  assert.deepEqual(windows({ morningHour: 12, middayHour: 14, eveningHour: 20 }).morning, [12, 14]);
});

test("nudgeAllowed: after the morning email, before the evening one, once", () => {
  assert.equal(nudgeAllowed(6, none, CFG), false, "too early");
  assert.equal(nudgeAllowed(8, none, CFG), false, "morning email hasn't gone yet");
  assert.equal(nudgeAllowed(8, { morning: {} }, CFG), true);
  assert.equal(nudgeAllowed(13, none, CFG), true, "morning window passed without one (outage)");
  assert.equal(nudgeAllowed(16, { morning: {}, midday: {} }, CFG), false);
  assert.equal(nudgeAllowed(20, { morning: {} }, CFG), false, "evening window: the evening email covers it");
});

const SAT = "2026-10-17";
const SUN = "2026-10-18";

test("reachedHalfway, weekday: one sitting, so only a finished day sends early", () => {
  const n = dayFacts(fresh(), T).planLessons.length;
  assert.ok(n >= 2, `plan has ${n} lessons`);
  assert.equal(dayFacts(fresh(), T).sessions, null, "weekdays are one sitting");
  assert.equal(reachedHalfway(dayFacts(withDone(0), T)), false);
  assert.equal(reachedHalfway(dayFacts(withDone(n - 1), T)), false, "never interrupts the sitting");
  assert.equal(reachedHalfway(dayFacts(withDone(n), T)), true, "done counts");
  assert.equal(reachedHalfway(dayFacts(withDone(0, { mode: "min" }), T)), false);
});

test("reachedHalfway, weekend: fires the moment the morning block is done", () => {
  const F0 = dayFacts(fresh(), SAT);
  const k = F0.sessions.am.lessons.length;
  assert.equal(reachedHalfway(dayFacts(withDone(k - 1, { day: SAT }), SAT)), false);
  assert.equal(reachedHalfway(dayFacts(withDone(k, { day: SAT }), SAT)), true);
  // Ticking afternoon lessons first doesn't count: the morning block isn't done.
  const s = fresh();
  F0.sessions.pm.lessons.forEach((l) => (s.completed[l.id] = SAT));
  assert.equal(reachedHalfway(dayFacts(s, SAT)), false);
});

test("splitSessions: weekends split the minutes in half, in plan order; weekdays never split", () => {
  for (const day of [SAT, SUN]) {
    const F = dayFacts(fresh(), day);
    const { am, pm } = F.sessions;
    assert.ok(am.lessons.length && pm.lessons.length, "both blocks have work");
    assert.deepEqual([...am.lessons, ...pm.lessons].map((l) => l.id), F.plan.ids, "order kept, nothing lost or repeated");
    assert.equal(am.min + pm.min, F.plan.targetMin);
    // No other cut point is closer to half the minutes.
    const half = F.plan.targetMin / 2;
    let acc = 0;
    const gaps = F.planLessons.slice(0, -1).map((l) => Math.abs((acc += l.effort) - half));
    assert.equal(Math.abs(am.min - half), Math.min(...gaps));
  }
  const ls = (...m) => m.map((effort, i) => ({ id: `x${i}`, effort }));
  assert.equal(P.splitSessions(ls(30, 30), T), null, "Wednesday: one sitting");
  assert.equal(P.splitSessions(ls(30), SAT), null, "one lesson can't be halved");
  assert.deepEqual(P.splitSessions(ls(30, 30), SAT).am.map((l) => l.id), ["x0"]);
  assert.deepEqual(P.splitSessions(ls(10, 20, 10), SAT).am.map((l) => l.id), ["x0", "x1"], "a tie gives the morning the extra");
  assert.deepEqual(P.splitSessions(ls(100, 10, 10, 10), SAT).am.map((l) => l.id), ["x0"], "minutes, not lesson count");
  assert.equal(dayFacts(withDone(0, { day: SAT, mode: "min" }), SAT).sessions, null, "bad-day mode is one lesson");
});

test("dayFacts matches the planner exactly", () => {
  const s = withDone(1);
  const F = dayFacts(s, T);
  const plan = P.planDay({ lessons: LESSONS.filter((l) => !l.optional), completed: s.completed, today: T, settings: s.settings });
  assert.deepEqual(F.plan.ids, plan.ids);
  assert.equal(F.planDone.length, 1);
  assert.equal(F.next.id, plan.ids[1]);
});

function check(mail) {
  assert.ok(mail, "an email");
  assert.ok(mail.subject.length > 8 && mail.subject.length < 110, `subject length ok: ${mail.subject}`);
  assert.ok(!/undefined|NaN|null|\[object/.test(mail.subject + mail.text + mail.html), "no template leaks");
  assert.ok(mail.html.includes("https://goals.example/#today"), "links back to the app");
  assert.ok(/Atomic Habits/i.test(mail.text), "teaches one idea");
  return mail;
}

test("morning: plan, next lesson, idea, pace", () => {
  const s = showUp(fresh(), ["2026-10-11", "2026-10-12", "2026-10-13"]);
  const F = dayFacts(s, T);
  const m = check(compose("morning", F, ctx(s)));
  assert.match(m.subject, /^Wednesday: \d+ lessons, ~.*, one sitting\. Start with/);
  assert.match(m.text, /in one go/);
  assert.match(m.text, /Today's checklist · one sitting/);
  assert.ok(m.text.includes(F.next.title), "names the exact next lesson");
  assert.ok(m.text.includes("Good morning, Sam."));
  assert.ok(m.text.includes("You've got this"));
  assert.ok(m.text.includes("chain is at 3 days"));
});

test("morning after days of nothing: one lesson breaks it", () => {
  const m = check(compose("morning", dayFacts(fresh(), T), ctx(fresh())));
  assert.match(m.subject, /^3 days missed\. Break it today with one lesson/);
});

test("morning after a miss: never miss twice", () => {
  const s = showUp(fresh(), ["2026-10-12"]);
  const F = dayFacts(s, T);
  assert.equal(F.missRun, 1);
  const m = check(compose("morning", F, ctx(s)));
  assert.match(m.subject, /^Never miss twice/);
  assert.match(m.text, /Never miss twice/);
});

test("morning with an unpaid contract breach leads with it", () => {
  const s = showUp(fresh(), ["2026-10-11"]);
  s.contract = { ...s.contract, signedAt: new Date(2026, 9, 11, 9).getTime(), signer: "Sam Lee", penaltyAmount: 10, partners: [{ name: "Alex", contact: "" }, { name: "", contact: "" }] };
  const F = dayFacts(s, T);
  assert.deepEqual(F.unpaid, ["2026-10-13"]);
  const m = check(compose("morning", F, ctx(s)));
  assert.match(m.text, /You owe Alex \$10/);
});

test("midday, weekday: one sitting, not started / mid-sitting / complete", () => {
  const n = dayFacts(fresh(), T).planLessons.length;
  const zero = check(compose("midday", dayFacts(fresh(), T), ctx(fresh())));
  assert.match(zero.subject, /^Today: \d+ lessons, ~.*, one sitting\. Prime it now\./);
  const half = withDone(Math.ceil(n / 2));
  const h = check(compose("midday", dayFacts(half, T), ctx(half)));
  assert.match(h.subject, new RegExp(`^${Math.ceil(n / 2)} of ${n} done\\. Same sitting: ${n - Math.ceil(n / 2)} to go`));
  assert.match(h.text, /in one go/);
  const all = withDone(n);
  all.settings.bundle = "A 20 minute walk outside";
  const c = check(compose("midday", dayFacts(all, T), ctx(all)));
  assert.match(c.subject, /Reward unlocked: A 20 minute walk/);
});

// Saturday with a 6-day chain behind it, k lessons into today's plan.
function sat(k) {
  const s = showUp(fresh(), ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
  dayFacts(s, SAT).planLessons.slice(0, k).forEach((l) => (s.completed[l.id] = SAT));
  return s;
}

test("weekend emails: morning plan in two blocks, afternoon handoff, block-aware push", () => {
  const c = { ...ctx(sat(0)), middayHour: 14 };
  const F0 = dayFacts(sat(0), SAT);
  const { am, pm } = F0.sessions;
  const m = check(compose("morning", F0, c));
  assert.match(m.subject, new RegExp(`^Saturday: ${am.lessons.length} lessons? this morning, ${pm.lessons.length} this afternoon\\.`));
  assert.match(m.text, /Morning block · ~.* · done by 2 pm:/);
  assert.match(m.text, /Afternoon block · ~/);
  assert.ok(m.text.indexOf(am.lessons[0].title) < m.text.indexOf(pm.lessons[0].title));

  const z = check(compose("midday", F0, c));
  assert.match(z.subject, /^0 of \d+ done\. Start the morning block now/);
  assert.match(z.text, /was due by 2 pm/);

  const mid = sat(1);
  const p = check(compose("midday", dayFacts(mid, SAT), c));
  assert.match(p.subject, /^Morning block: \d+ lessons? left\. Finish it, then the afternoon\./);

  const amDone = sat(am.lessons.length);
  const Fa = dayFacts(amDone, SAT);
  const h = check(compose("midday", Fa, { ...c, state: amDone }));
  assert.match(h.subject, new RegExp(`^Morning block done\\. Afternoon block: ${pm.lessons.length} lessons?, ~`));
  assert.ok(h.text.includes(pm.lessons[0].title), "hands over the first afternoon lesson");

  const b = composeBoost(Fa, c, 1);
  assert.match(b.subject, /^⚡ Afternoon block: /);
  const b0 = composeBoost(dayFacts(mid, SAT), c, 1);
  assert.match(b0.subject, /^⚡ Morning block: /);
  const e = check(compose("evening", dayFacts(amDone, SAT), { ...c, state: amDone }));
  assert.match(e.text, /what's left is the afternoon block/);
});

test("evening: chain warning, partial, and wrap with tomorrow's plan", () => {
  const s = showUp(fresh(), ["2026-10-12", "2026-10-13"]);
  const e0 = check(compose("evening", dayFacts(s, T), ctx(s)));
  assert.match(e0.subject, /2-day chain breaks at midnight/);
  const part = withDone(1);
  const e1 = check(compose("evening", dayFacts(part, T), ctx(part)));
  assert.match(e1.subject, /left, ~/);
  const n = dayFacts(fresh(), T).planLessons.length;
  const done = withDone(n);
  const e2 = check(compose("evening", dayFacts(done, T), ctx(done)));
  assert.match(e2.subject, /^Day complete\. Vote #\d+/);
  assert.match(e2.text, /Tomorrow: \d+ lessons/);
});

test("evening after a miss with a signed contract names the cost", () => {
  const s = showUp(fresh(), ["2026-10-12"]);
  s.contract = { ...s.contract, signedAt: new Date(2026, 9, 11, 9).getTime(), penaltyAmount: 15, partners: [{ name: "Alex", contact: "" }, { name: "", contact: "" }] };
  const e = check(compose("evening", dayFacts(s, T), ctx(s)));
  assert.match(e.text, /contract breach and you owe Alex \$15/);
});

test("rest days: one calm morning email, no midday or evening noise", () => {
  const s = fresh();
  s.settings.weekendMin = 0;
  const sat = "2026-10-17";
  const F = dayFacts(s, sat);
  assert.equal(F.rest, true);
  assert.match(compose("morning", F, ctx(s)).subject, /rest day/);
  assert.equal(compose("midday", F, ctx(s)), null);
  assert.equal(compose("evening", F, ctx(s)), null);
});

test("finished: celebrate once, then go quiet", () => {
  const s = fresh();
  for (const l of LESSONS) if (!s.completed[l.id]) s.completed[l.id] = "2026-10-20";
  assert.match(compose("morning", dayFacts(s, "2026-10-21"), ctx(s)).subject, /Both courses are done/);
  assert.equal(compose("morning", dayFacts(s, "2026-10-25"), ctx(s)), null);
  assert.equal(compose("evening", dayFacts(s, "2026-10-21"), ctx(s)), null);
});

test("html escapes user text", () => {
  const s = fresh();
  s.settings.identity = `<script>alert(1)</script>`;
  s.settings.when = `"7pm" & later`;
  const m = compose("morning", dayFacts(s, T), ctx(s));
  assert.ok(!m.html.includes("<script>"));
  assert.ok(m.html.includes("&quot;7pm&quot; &amp; later"));
});

test("principles: rotation visits every idea, every action renders", () => {
  const seen = new Set();
  for (let i = 0; i < PRINCIPLES.length; i++) seen.add(rotation(i, "morning").id);
  assert.equal(seen.size, PRINCIPLES.length, "no idea is skipped or repeated within a cycle");
  assert.equal(new Set(PRINCIPLES.map((p) => p.id)).size, PRINCIPLES.length, "unique ids");
  const F = dayFacts(fresh(), T);
  for (const p of PRINCIPLES) {
    const a = p.action(F);
    assert.ok(typeof a === "string" && a.length > 20 && !/undefined|NaN/.test(a), `${p.id}: ${a}`);
  }
  assert.equal(pickPrinciple({ ...F, missRun: 1 }, "morning", 0).id, "never-miss-twice");
  assert.equal(pickPrinciple({ ...F, missRun: 0, shownUpDays: 3, shownToday: false, complete: false }, "midday", 0).id, "two-minute");
});

test("principles: the three emails of a day never repeat an idea", () => {
  const base = dayFacts(fresh(), T);
  const variants = [
    base,
    { ...base, missRun: 0, shownToday: true, pct: 60, complete: false, streak: 4 },
    { ...base, missRun: 1, shownToday: false },
    { ...base, missRun: 0, complete: true, shownToday: true },
  ];
  for (let d = 0; d < 60; d++)
    for (const F of variants) {
      const ids = ["morning", "midday", "evening"].map((sl) => pickPrinciple(F, sl, d).id);
      assert.equal(new Set(ids).size, 3, `day ${d}: ${ids}`);
    }
});

// ---------- recipients and the partner report

test("parseList: commas, semicolons, spaces; deduped; owner removed", () => {
  assert.deepEqual(parseList(" A@x.com, b@y.com;c@z.com  a@x.com me@gmail.com ", ["ME@gmail.com"]), ["a@x.com", "b@y.com", "c@z.com"]);
  assert.deepEqual(parseList(undefined), []);
});

const pctx = (state, name = "Sam") => ({ name, state });
const Y = "2026-10-13";
// Partner report as sent on the morning of T, about Y.
const report = (s, name) => composePartner(dayFacts(s, Y), dayFacts(s, T), pctx(s, name));

test("partner report: a full day reads as 100%", () => {
  const s = fresh();
  dayFacts(s, Y).planLessons.forEach((l) => (s.completed[l.id] = Y));
  s.dayLog[Y] = { nsv: "Finally got the chain rule" };
  const r = check2(report(s));
  assert.match(r.subject, /^Sam's check-in, Tue, Oct 13: ✅ 100%/);
  assert.match(r.text, /Finally got the chain rule/);
});

test("partner report: misses in a row and money owed are stated plainly", () => {
  const s = showUp(fresh(), ["2026-10-11"]);
  s.contract = { ...s.contract, signedAt: new Date(2026, 9, 10, 9).getTime(), penaltyAmount: 10, partners: [{ name: "Alex", contact: "" }, { name: "", contact: "" }] };
  const r = check2(report(s));
  assert.match(r.subject, /❌ missed \(2 days in a row\)/);
  assert.match(r.text, /owes Alex \$10/);
  assert.match(r.text, /saw you missed/);
});

test("partner report: no name falls back cleanly; nothing before tracking or on rest days", () => {
  const s = fresh();
  dayFacts(s, Y).planLessons.slice(0, 1).forEach((l) => (s.completed[l.id] = Y));
  const r = check2(report(s, ""));
  assert.match(r.subject, /^Goals check-in, /);
  assert.ok(!/Your friend owes|they owes/.test(r.text));
  assert.equal(composePartner(dayFacts(s, "2026-10-10"), dayFacts(s, "2026-10-11"), pctx(s)), null);
  s.settings.weekendMin = 0;
  assert.equal(composePartner(dayFacts(s, "2026-10-17"), dayFacts(s, "2026-10-18"), pctx(s)), null);
});

function check2(mail) {
  assert.ok(mail, "an email");
  assert.ok(!/undefined|NaN|null|\[object/.test(mail.subject + mail.text + mail.html), "no template leaks");
  assert.ok(!mail.html.includes("#today"), "partners get no app links (they can't sign in)");
  return mail;
}

test("emailHours: out-of-order or invalid hours fall back loudly, never to an empty window", () => {
  const w = [];
  assert.deepEqual(emailHours({}, w), { morningHour: 7, middayHour: 14, eveningHour: 20 });
  assert.deepEqual(emailHours({ EMAIL_MORNING_HOUR: "6", EMAIL_EVENING_HOUR: "21" }, w), { morningHour: 6, middayHour: 14, eveningHour: 21 });
  assert.equal(w.length, 0);
  assert.deepEqual(emailHours({ EMAIL_MORNING_HOUR: "8", EMAIL_MIDDAY_HOUR: "7" }, w), { morningHour: 7, middayHour: 14, eveningHour: 20 });
  assert.match(w[0], /morning < midday < evening/);
  assert.deepEqual(emailHours({ EMAIL_EVENING_HOUR: "8pm" }, w).eveningHour, 20);
  assert.match(w[1], /"8pm" is not a whole hour/);
  for (const env of [{}, { EMAIL_MORNING_HOUR: "12", EMAIL_MIDDAY_HOUR: "13", EMAIL_EVENING_HOUR: "14" }]) {
    for (const [a, b] of Object.values(windows(emailHours(env)))) assert.ok(a < b, "every window is non-empty");
  }
});

// ---------- "Send me motivation"

test("boost: reads the moment (not started, partway, done, rest)", () => {
  const c = { ...ctx(fresh()), dayIndex: 3 };
  const steady = showUp(fresh(), ["2026-10-11", "2026-10-12", "2026-10-13"]); // so the morning email didn't already use the two-minute rule
  const notYet = check(composeBoost(dayFacts(steady, T), c, 1));
  assert.match(notYet.subject, /^⚡ Right now: open ".+"\. Just 2 minutes\./);
  assert.match(notYet.text, /The two-minute rule/);
  const n = dayFacts(fresh(), T).planLessons.length;
  const part = withDone(2);
  assert.match(check(composeBoost(dayFacts(part, T), c, 1)).subject, new RegExp(`^⚡ ${n - 2} lessons left, ~`));
  assert.match(check(composeBoost(dayFacts(withDone(n), T), c, 1)).subject, /already done/);
  const rest = fresh();
  rest.settings.weekendMin = 0;
  assert.match(check(composeBoost(dayFacts(rest, "2026-10-17"), c, 1)).subject, /Rest day/);
});

test("boost: 8 presses, 8 different ideas, none repeating this morning's", () => {
  for (const s of [fresh(), withDone(2)]) {
    for (let d = 0; d < 30; d++) {
      const F = dayFacts(s, T);
      const morning = pickPrinciple(F, "morning", d).id;
      const ids = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => boostPrinciple(F, d, n, F.shownToday ? undefined : "two-minute").id);
      assert.equal(new Set(ids).size, 8, `day ${d}: ${ids}`);
      assert.ok(!ids.includes(morning), `day ${d} repeats the morning idea ${morning}`);
    }
  }
});

test("failures: auth errors aren't retried, outages alert only at window starts, 403s explain the fix", () => {
  assert.equal(isAuthError({ code: "EAUTH", message: "Invalid login: 535-5.7.8 Username and Password not accepted" }), true);
  assert.equal(isAuthError({ code: "ETIMEDOUT", message: "Connection timeout" }), false, "timeouts get the retry");
  assert.equal(isAuthError({ code: "EENVELOPE", message: "421 4.7.0 Try again later" }), false);
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => isAlertHour(CFG, h));
  assert.deepEqual(hours, [7, 14, 20], "at most three alerts a day");
  assert.match(hint(403, "permission denied for table progress"), /grant_service_role\.sql/);
  assert.match(hint(401, "Invalid API key"), /SUPABASE_SERVICE_ROLE_KEY/);
  assert.equal(hint(500, "boom"), "");
  // A run that died between claiming and sending frees the slot after STALE_MIN.
  const now = Date.parse("2026-10-12T20:30:00Z");
  const ago = (m) => new Date(now - m * 60_000).toISOString();
  assert.equal(isStale({ claimed_at: ago(STALE_MIN + 1), sent_at: null }, now), true);
  assert.equal(isStale({ claimed_at: ago(1), sent_at: null }, now), false, "in flight: leave it alone");
  assert.equal(isStale({ claimed_at: ago(600), sent_at: ago(599) }, now), false, "sent is sent");
  assert.ok(STALE_MIN * 60 > 60, "longer than a function can run (maxDuration 60s)");
});

test("morning email: today's calendar from the calendar app", () => {
  const agenda = {
    appUrl: "https://cal.example",
    events: [
      { title: "TEDx club monthly meeting", location: "Room 204", allDay: false, time: "11:30 AM – 12:30 PM", url: "https://cal.example/#event=1" },
      { title: "Volunteering <b>", location: "", allDay: true, time: "All day", url: "https://cal.example/#event=2" },
    ],
    tasks: { open: [{ title: "Email Mr. Patel", overdue: true }], doneToday: [] },
  };
  const m = compose("morning", dayFacts(fresh(), T), { ...ctx(fresh()), agenda });
  assert.match(m.text, /TODAY ON YOUR CALENDAR\n  11:30 AM  TEDx club monthly meeting \(Room 204\)\n  All day  Volunteering <b>/);
  assert.match(m.text, /To-do: Email Mr\. Patel \(overdue\)/);
  assert.match(m.html, /Volunteering &lt;b&gt;/);
  assert.doesNotMatch(m.html, /Volunteering <b>/);
  // No agenda (calendar not configured or down): no section, nothing breaks.
  const plain = compose("morning", dayFacts(fresh(), T), ctx(fresh()));
  assert.doesNotMatch(plain.text, /TODAY ON YOUR CALENDAR/);
  // Empty day: says so.
  const empty = compose("morning", dayFacts(fresh(), T), { ...ctx(fresh()), agenda: { events: [], tasks: { open: [] } } });
  assert.match(empty.text, /Nothing else scheduled/);
});
