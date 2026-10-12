import { test } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "../js/state.js";
import { dayFacts, reachedHalfway, zonedParts, LESSONS } from "../js/digest.js";
import { compose, composePartner } from "../js/emails.js";
import { dueSlots, nudgeAllowed, windows } from "../js/schedule.js";
import { parseList } from "../api/_lib/env.js";
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

test("reachedHalfway: 5 of 10 counts, by lessons or minutes", () => {
  const n = dayFacts(fresh(), T).planLessons.length;
  assert.ok(n >= 2, `plan has ${n} lessons`);
  assert.equal(reachedHalfway(dayFacts(withDone(0), T)), false);
  assert.equal(reachedHalfway(dayFacts(withDone(Math.ceil(n / 2)), T)), true);
  assert.equal(reachedHalfway(dayFacts(withDone(n), T)), true, "done counts too");
  assert.equal(reachedHalfway(dayFacts(withDone(0, { mode: "min" }), T)), false);
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
  assert.match(m.subject, /^Wednesday: \d+ lessons, ~/);
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

test("midday: zero done, halfway, and complete read differently", () => {
  const n = dayFacts(fresh(), T).planLessons.length;
  const zero = check(compose("midday", dayFacts(fresh(), T), ctx(fresh())));
  assert.match(zero.subject, /^0 of \d+ done/);
  const half = withDone(Math.ceil(n / 2));
  const h = check(compose("midday", dayFacts(half, T), ctx(half)));
  assert.match(h.subject, new RegExp(`^Halfway\\. ${Math.ceil(n / 2)} down, ${n - Math.ceil(n / 2)} to go`));
  const all = withDone(n);
  all.settings.bundle = "A 20 minute walk outside";
  const c = check(compose("midday", dayFacts(all, T), ctx(all)));
  assert.match(c.subject, /Reward unlocked: A 20 minute walk/);
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
