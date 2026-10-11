import { test } from "node:test";
import assert from "node:assert/strict";
import { COURSES, allLessons, EFFORT } from "../js/data.js";
import * as P from "../js/planner.js";

const L = allLessons();
const S = { deadline: "2026-10-31", bufferDays: 2, weekdayMin: 150, weekendMin: 240 };
const pre = () => Object.fromEntries(COURSES.flatMap((c) => (c.preDone || []).map((n) => [`${c.id}-${n}`, "pre"])));

test("data: ids unique, every lesson has a known kind and positive minutes", () => {
  const ids = L.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const l of L) {
    assert.ok(EFFORT[l.kind], `unknown kind ${l.kind} on ${l.id}`);
    assert.ok(l.min > 0 && l.effort > 0, l.id);
  }
});

test("data: lesson numbers are contiguous within each course", () => {
  for (const c of COURSES) {
    const ns = L.filter((l) => l.course === c.id && typeof l.n === "number").map((l) => l.n);
    ns.forEach((n, i) => i && assert.equal(n, ns[i - 1] + 1, `${c.id} gap before ${n}`));
  }
});

test("data: section totals match the Udemy sidebar", () => {
  const secMin = (cid, title) => L.filter((l) => l.course === cid && l.section.startsWith(title)).reduce((a, l) => a + l.min, 0);
  // Sidebar rounds, so allow a few minutes of drift.
  const near = (a, b) => assert.ok(Math.abs(a - b) <= Math.max(3, b * 0.02), `${a} vs ${b}`);
  near(secMin("krohn", "Section 9:"), 190);
  near(secMin("krohn", "Section 10:"), 64);
  near(secMin("krohn", "Section 11:"), 50);
  near(secMin("portilla", "Section 6:"), 103);
  near(secMin("portilla", "Section 9:"), 82);
  near(secMin("portilla", "Section 13:"), 79);
  near(secMin("portilla", "Section 15:"), 52);
  near(secMin("portilla", "Section 17:"), 67);
  near(secMin("portilla", "Section 18:"), 41);
  near(secMin("portilla", "Section 19:"), 45);
  near(secMin("portilla", "Section 20:"), 35);
  near(secMin("portilla", "Section 21:"), 37);
  near(secMin("portilla", "Section 22:"), 20);
  near(secMin("portilla", "Section 23:"), 31);
  near(secMin("portilla", "Section 24:"), 79);
  near(secMin("portilla", "Section 25:"), 302);
  near(secMin("portilla", "Section 26:"), 102);
});

test("data: section item counts match the sidebar", () => {
  const count = (title) => L.filter((l) => l.course === "portilla" && l.section.startsWith(title)).length;
  assert.equal(count("Section 19:"), 5);
  assert.equal(count("Section 24:"), 6);
  assert.equal(count("Section 25:"), 31);
  assert.equal(count("Section 26:"), 12);
  assert.equal(count("Section 27:"), 1);
  assert.ok(L.find((l) => l.id === "portilla-quiz1"), "unnumbered quiz gets a stable id");
});

test("dates: addDays crosses months and DST safely", () => {
  assert.equal(P.addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(P.addDays("2026-11-01", 1), "2026-11-02"); // US DST ends Nov 1 2026
  assert.equal(P.diffDays("2026-10-11", "2026-10-31"), 20);
  assert.equal(P.isWeekend("2026-10-11"), true); // Sunday
  assert.equal(P.isWeekend("2026-10-12"), false);
});

test("plan: first day starts at Krohn 77 and Portilla 17, both courses every day", () => {
  const p = P.planDay({ lessons: L, completed: pre(), today: "2026-10-11", settings: S });
  assert.equal(p.ids[0], "krohn-77");
  assert.ok(p.ids.includes("portilla-17"));
  assert.ok(!p.ids.includes("portilla-18"), "pre-done lessons are never planned");
  assert.ok(p.onTrack);
});

test("plan: ticking lessons today does not change today's plan", () => {
  const c = pre();
  const p1 = P.planDay({ lessons: L, completed: c, today: "2026-10-11", settings: S });
  for (const id of p1.ids.slice(0, 3)) c[id] = "2026-10-11";
  const p2 = P.planDay({ lessons: L, completed: c, today: "2026-10-11", settings: S });
  assert.deepEqual(p2.ids, p1.ids);
});

test("plan: missing days makes later days heavier, never lighter", () => {
  const p1 = P.planDay({ lessons: L, completed: pre(), today: "2026-10-13", settings: S });
  const p2 = P.planDay({ lessons: L, completed: pre(), today: "2026-10-20", settings: S });
  assert.ok(p2.targetMin > p1.targetMin);
  assert.ok(p2.requiredAvg > p1.requiredAvg);
});

test("plan: following the plan every day finishes everything by planEnd", () => {
  const c = pre();
  let k = "2026-10-11";
  for (; k <= "2026-10-29"; k = P.addDays(k, 1)) {
    const p = P.planDay({ lessons: L, completed: c, today: k, settings: S });
    for (const id of p.ids) c[id] = k;
  }
  const left = L.filter((l) => !c[l.id]);
  assert.equal(left.length, 0, `left: ${left.map((l) => l.id).join(",")}`);
});

test("plan: past the deadline everything lands on today", () => {
  const p = P.planDay({ lessons: L, completed: pre(), today: "2026-11-05", settings: S });
  assert.equal(p.lessonsRemaining, p.ids.length);
});

test("plan: zero capacity is flagged off track instead of crashing", () => {
  const p = P.planDay({ lessons: L, completed: pre(), today: "2026-10-11", settings: { ...S, weekdayMin: 0, weekendMin: 0 } });
  assert.equal(p.finishAtCapacity, null);
  assert.equal(p.onTrack, false);
});

test("plan: low capacity projects a finish after the deadline", () => {
  const p = P.planDay({ lessons: L, completed: pre(), today: "2026-10-11", settings: { ...S, weekdayMin: 30, weekendMin: 60 } });
  assert.equal(p.onTrack, false);
  assert.ok(p.finishAtCapacity > S.deadline);
});

test("streaks and never-miss-twice", () => {
  const a = new Set(["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-15"]);
  assert.equal(P.streak(a, "2026-10-15"), 1);
  assert.equal(P.streak(a, "2026-10-14"), 3, "today in progress keeps yesterday's streak");
  assert.equal(P.bestStreak(a), 3);
  assert.equal(P.missedYesterday(a, "2026-10-15", "2026-10-11"), false);
  assert.equal(P.missedYesterday(new Set(["2026-10-11"]), "2026-10-13", "2026-10-11"), true);
  assert.equal(P.missedYesterday(new Set(), "2026-10-11", "2026-10-11"), false, "no warning on day one");
});

test("optional: off-syllabus lessons are never planned by default", async () => {
  const { plannable } = await import("../js/data.js");
  const c = pre();
  let k = "2026-10-11";
  const planned = new Set();
  for (; k <= "2026-10-29"; k = P.addDays(k, 1)) {
    const p = P.planDay({ lessons: plannable(L), completed: c, today: k, settings: S });
    for (const id of p.ids) (planned.add(id), (c[id] = k));
  }
  for (const l of L.filter((l) => l.optional)) assert.ok(!planned.has(l.id), `${l.id} should not be planned`);
  assert.ok(L.filter((l) => !l.optional).every((l) => c[l.id]), "every core lesson still gets planned");
});

test("optional: AWS setup stays out even when optional lessons are included", async () => {
  const { plannable } = await import("../js/data.js");
  const ids = new Set(plannable(L, true).map((l) => l.id));
  for (const n of [157, 158, 159, 160, 161]) assert.ok(!ids.has(`portilla-${n}`));
  assert.ok(ids.has("portilla-163"), "Spark watch-only lessons come back when included");
});
