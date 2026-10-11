import { test } from "node:test";
import assert from "node:assert/strict";
import * as H from "../js/habits.js";
import * as P from "../js/planner.js";

const S = { deadline: "2026-10-31", bufferDays: 2, weekdayMin: 150, weekendMin: 240 };
const NO_WEEKENDS = { ...S, weekendMin: 0 };
const ctx = (active, today, settings = S, extra = {}) => ({
  active: new Set(active), today, settings, trackStart: "2026-10-11", ...extra,
});

test("dayStatus: before, done, today, future, rest, missed, finished", () => {
  const c = ctx(["2026-10-12"], "2026-10-15", NO_WEEKENDS);
  assert.equal(H.dayStatus("2026-10-10", c), "before");
  assert.equal(H.dayStatus("2026-10-11", c), "rest"); // Sunday, no weekend capacity
  assert.equal(H.dayStatus("2026-10-12", c), "done");
  assert.equal(H.dayStatus("2026-10-13", c), "missed");
  assert.equal(H.dayStatus("2026-10-15", c), "today");
  assert.equal(H.dayStatus("2026-10-16", c), "future");
  const f = ctx(["2026-10-12"], "2026-10-15", S, { finishedOn: "2026-10-12" });
  assert.equal(H.dayStatus("2026-10-13", f), "finished", "no misses after the work is done");
});

test("activeSet ignores pre-done lessons", () => {
  assert.deepEqual([...H.activeSet({ a: "pre", b: "2026-10-12", c: "2026-10-12", d: "2026-10-13" })].sort(), ["2026-10-12", "2026-10-13"]);
});

test("missRun: once is an accident, twice is a habit, rest days are skipped", () => {
  assert.equal(H.missRun(ctx(["2026-10-13"], "2026-10-14")), 0);
  assert.equal(H.missRun(ctx(["2026-10-12"], "2026-10-14")), 1);
  assert.equal(H.missRun(ctx(["2026-10-11"], "2026-10-14")), 2);
  // Fri Oct 16 done, Sat/Sun rest, Mon Oct 19 is today: nothing missed.
  assert.equal(H.missRun(ctx(["2026-10-16"], "2026-10-19", NO_WEEKENDS)), 0);
  // Thu done, Fri missed, weekend rest, Mon missed, Tue today: missed twice across a weekend.
  assert.equal(H.missRun(ctx(["2026-10-15"], "2026-10-20", NO_WEEKENDS)), 2);
  assert.equal(H.missRun(ctx([], "2026-10-11")), 0, "day one cannot have misses");
});

test("strikes: only after signing, never for today, one per extra missed day", () => {
  const c = ctx(["2026-10-11"], "2026-10-16");
  // Missed 12, 13, 14, 15. Strikes on 13, 14, 15.
  assert.deepEqual(H.strikes(c, "2026-10-11"), ["2026-10-13", "2026-10-14", "2026-10-15"]);
  // Signed on the 13th: only 14 and 15 count, and 14 is the first miss after signing.
  assert.deepEqual(H.strikes(c, "2026-10-13"), ["2026-10-15"]);
  // A single miss is never a strike.
  assert.deepEqual(H.strikes(ctx(["2026-10-11", "2026-10-13"], "2026-10-14"), "2026-10-10"), []);
  // Today in progress is not judged.
  assert.deepEqual(H.strikes(ctx(["2026-10-11"], "2026-10-13"), "2026-10-10"), []);
  // Rest days between two misses still make it "twice".
  const wk = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"];
  assert.deepEqual(H.strikes(ctx(wk, "2026-10-20", NO_WEEKENDS), "2026-10-10"), ["2026-10-19"]);
});

test("comebacks count showing up right after a miss", () => {
  assert.equal(H.comebacks(ctx(["2026-10-11", "2026-10-13"], "2026-10-14")), 1);
  assert.equal(H.comebacks(ctx(["2026-10-11", "2026-10-12"], "2026-10-14")), 0);
  assert.equal(H.comebacks(ctx(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19"], "2026-10-20", NO_WEEKENDS)), 0, "a weekend off is not a miss");
});

test("streaks skip rest days instead of breaking", () => {
  const a = new Set(["2026-10-15", "2026-10-16", "2026-10-19"]);
  const rest = (k) => H.isRestDay(k, NO_WEEKENDS);
  assert.equal(P.streak(a, "2026-10-19", rest), 3);
  assert.equal(P.streak(a, "2026-10-19"), 1, "without rest days the weekend breaks it");
  assert.equal(P.bestStreak(a, rest), 3);
  assert.equal(P.streak(new Set(), "2026-10-19", rest), 0);
  assert.equal(P.streak(new Set(["2026-10-17"]), "2026-10-19", () => true), 1, "all-rest calendar terminates");
});

test("reinforcement phase moves from rewards to identity", () => {
  assert.equal(H.reinforcementPhase(0).key, "spark");
  assert.equal(H.reinforcementPhase(7).key, "bridge");
  assert.equal(H.reinforcementPhase(21).key, "identity");
  assert.ok(H.reinforcementPhase(3).pct > 0 && H.reinforcementPhase(3).pct < 1);
});

test("rewardConflict flags rewards that fight the identity", () => {
  assert.equal(H.rewardConflict("a bowl of ice cream"), "ice cream");
  assert.ok(H.rewardConflict("30 min of TikTok"));
  assert.equal(H.rewardConflict("a walk outside"), null);
  assert.equal(H.rewardConflict(""), null);
  for (const r of H.ALIGNED_REWARDS) assert.equal(H.rewardConflict(r), null, r);
});

test("perceivedValue falls with delay", () => {
  assert.equal(H.perceivedValue(100, 0), 100);
  assert.ok(H.perceivedValue(100, 120) < 10);
  assert.ok(H.perceivedValue(100, 30) > H.perceivedValue(100, 60));
});

test("parseAvoid reads 'name = amount' lines with stable ids", () => {
  const items = H.parseAvoid("Skip coffee out = 5\nNo energy drinks | $3.50\n\nNo phone in study block\nSkip coffee out = 9");
  assert.deepEqual(items, [
    { id: "skip-coffee-out", name: "Skip coffee out", amount: 5 },
    { id: "no-energy-drinks", name: "No energy drinks", amount: 3.5 },
    { id: "no-phone-in-study-block", name: "No phone in study block", amount: 0 },
  ]);
  assert.equal(H.parseAvoid(H.formatAvoid(items)).length, 3, "round trips");
});

test("savingsTotals uses the amount logged at the time and caps transfers", () => {
  const log = {
    "2026-10-11": { coffee: { s: "avoided", amt: 5 }, phone: { s: "slipped", amt: 0 } },
    "2026-10-12": { coffee: { s: "avoided", amt: 6 } },
    "2026-10-13": { coffee: { s: "slipped", amt: 6 } },
  };
  const t = H.savingsTotals(log, 4);
  assert.equal(t.saved, 11);
  assert.equal(t.slipped, 6);
  assert.equal(t.transferred, 4);
  assert.equal(t.pending, 7);
  assert.equal(H.savingsTotals(log, 999).pending, 0);
  assert.equal(H.savingsTotals(undefined).saved, 0);
});

test("calibration needs samples and compares real time to the estimate", () => {
  const byId = { a: { effort: 30 }, b: { effort: 30 }, c: { effort: 40 } };
  assert.equal(H.calibration({ a: 40 }, byId).ratio, null);
  const c = H.calibration({ a: 45, b: 45, c: 60, zz: 10 }, byId);
  assert.equal(c.samples, 3);
  assert.equal(c.ratio, 1.5);
});

test("speed ticks: long lessons ticked within 3 minutes", () => {
  const long = { kind: "video", effort: 30 };
  assert.equal(H.looksLikeSpeedTick(long, 1000, 1000 + 60000), true);
  assert.equal(H.looksLikeSpeedTick(long, 1000, 1000 + 10 * 60000), false);
  assert.equal(H.looksLikeSpeedTick({ kind: "quiz", effort: 5 }, 1000, 2000), false);
  assert.equal(H.looksLikeSpeedTick(long, null, 2000), false);
});

test("intrinsicTrend compares early vs recent check-ins", () => {
  const ci = { "2026-10-11": { focus: 2 }, "2026-10-12": { focus: 2 }, "2026-10-13": { focus: 4 }, "2026-10-14": { focus: 4 } };
  const t = H.intrinsicTrend(ci);
  assert.equal(t.focus.delta, 2);
  assert.equal(t.energy.delta, null);
});

test("milestones are earned from stats", () => {
  const base = { votes: 0, best: 0, perfect: 0, comebacks: 0, minDays: 0, notes: 0, saved: 0, signed: false, finished: false };
  assert.deepEqual(H.earnedMilestones(base), []);
  const got = H.earnedMilestones({ ...base, votes: 1, best: 7, comebacks: 1 });
  assert.deepEqual(got, ["vote-1", "streak-3", "streak-7", "comeback"]);
  const keys = H.MILESTONES.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("reportText and contactLink build a partner message", () => {
  const txt = H.reportText({
    dateLabel: "Mon, Oct 12", status: "done", lessons: 3, minutes: 140, streak: 2, daysLeft: 20,
    owed: 20, partner: "Sam", money: (x) => `$${x}`, nsv: "Understood backprop",
  });
  assert.match(txt, /3 lessons/);
  assert.match(txt, /owe Sam \$20/);
  assert.match(txt, /Win today: Understood backprop/);
  assert.match(H.contactLink("sam@example.com", "hi"), /^mailto:sam%40example\.com\?subject=/);
  assert.match(H.contactLink("+1 (555) 123-4567", "hi"), /^sms:\+15551234567/);
  assert.equal(H.contactLink("Sam", "hi"), null);
});
