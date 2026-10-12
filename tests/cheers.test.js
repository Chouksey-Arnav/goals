import { test } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "../js/state.js";
import { dayFacts, LESSONS } from "../js/digest.js";
import { cheerContext, cheer, draw, memoryStore, FACTS, PUSHES, AM_DONE, BONUS, COMPLETE } from "../js/cheers.js";

const WED = "2026-10-14";
const SAT = "2026-10-17";
const leak = /undefined|NaN|null|\[object|""/;

// A seeded RNG, so a failure reproduces.
function rng(seed = 7) {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
}

// Tick today's plan in order, returning the context after each tick.
function tickThrough(day) {
  const s = fresh();
  const plan = dayFacts(s, day).planLessons;
  return plan.map((l) => {
    s.completed[l.id] = day;
    return { F: dayFacts(s, day), l, c: cheerContext(dayFacts(s, day), l) };
  });
}

test("pools are big enough to not feel canned", () => {
  assert.ok(FACTS.length >= 30, `${FACTS.length} facts`);
  assert.ok(PUSHES.length >= 30, `${PUSHES.length} pushes`);
  assert.ok(FACTS.length * PUSHES.length >= 1000, "over a thousand fact + push pairs");
  for (const pool of [FACTS, PUSHES, AM_DONE, BONUS, COMPLETE]) {
    assert.equal(new Set(pool.map((t) => t.id)).size, pool.length, "unique ids");
    assert.equal(new Set(pool.map((t) => t.text({ ...SAMPLE }))).size, pool.length, "no two say the same thing");
  }
});

const SAMPLE = {
  title: "Numpy Operations", effort: "22 min", actual: "25 min", inPlan: true, n: 10, done: 4, left: 6,
  leftMin: "1h 12m", leftMinRaw: 72, pct: 40, gain: 10, pctBefore: 30, next: "Pandas Series", first: false,
  streak: 5, votes: 40, daysLeft: 19, doneMin: "2h", complete: false, weekend: false, block: null,
  blockLeft: 0, blockLeftMin: "", amJustDone: false, pmLeft: 4, pmLeftMin: "1h", bundle: "",
};

test("numbers are real: minutes saved and percent closer come from the lesson you ticked", () => {
  const ticks = tickThrough(WED);
  for (const { F, l, c } of ticks) {
    assert.equal(typeof c.effort, "string");
    assert.equal(c.gain, Math.round((l.effort / F.plan.targetMin) * 100));
    assert.equal(c.left, F.leftLessons.length);
    assert.equal(c.pctBefore, Math.max(0, F.pct - c.gain));
  }
  const saved = FACTS.find((t) => t.id === "f-saved").text(ticks[0].c);
  assert.match(saved, /^You just saved \d+ min of your day\.|^You just saved \dh/);
  assert.equal(FACTS.find((t) => t.id === "f-closer").text(SAMPLE), "Congratulations, you're 10% closer to today's goal.");
  assert.equal(FACTS.find((t) => t.id === "f-more").text(SAMPLE), "Yes, let's go! 1h 12m more and today's done.");
  const pctFacts = FACTS.filter((t) => ["f-closer", "f-ring", "f-from-to"].includes(t.id));
  assert.equal(pctFacts.length, 3);
  assert.ok(pctFacts.every((t) => !t.when({ ...SAMPLE, gain: 2 }) && t.when({ ...SAMPLE, gain: 3 })), "no applause for a 1-2% tick");
});

test("a whole weekday and a whole weekend: every toast is clean and fits the moment", () => {
  for (const day of [WED, SAT]) {
    const store = memoryStore();
    const r = rng(day.length);
    let prev = "";
    for (const { c } of tickThrough(day)) {
      const msg = c.complete ? cheer(c, store, { kind: "complete", rng: r }) : cheer(c, store, { rng: r });
      assert.ok(msg && msg.length > 10, msg);
      assert.ok(!leak.test(msg), `no template leak: ${msg}`);
      assert.notEqual(msg, prev, "never the same toast twice in a row");
      if (c.left === 0) assert.ok(!/left|to go/.test(msg) || c.complete, `nothing "left" once done: ${msg}`);
      prev = msg;
    }
  }
});

test("weekend: finishing the morning block gets its own message", () => {
  const ticks = tickThrough(SAT);
  const k = ticks[0].F.sessions.am.lessons.length;
  const store = memoryStore();
  const at = ticks[k - 1].c;
  assert.equal(at.amJustDone, true);
  const msg = cheer(at, store);
  assert.ok(AM_DONE.map((t) => (!t.when || t.when(at) ? t.text(at) : null)).includes(msg), msg);
  assert.equal(ticks[k].c.amJustDone, false, "only the tick that closes it");
  assert.equal(ticks[k].c.block, "afternoon");
});

test("no repeats: every fitting message shows once before any comes back", () => {
  const store = memoryStore();
  const r = rng(3);
  for (const pool of [PUSHES, FACTS]) {
    const fits = pool.filter((t) => !t.when || t.when(SAMPLE));
    const round1 = fits.map(() => draw("x" + pool.length, pool, SAMPLE, store, r));
    assert.equal(new Set(round1).size, fits.length, "a full round, all distinct");
    const opener = draw("x" + pool.length, pool, SAMPLE, store, r);
    assert.notEqual(opener, round1.at(-1), "a new round never opens with the last one");
  }
});

test("a message that doesn't fit now waits its turn instead of being skipped forever", () => {
  const store = memoryStore();
  const r = rng(11);
  const oneLeft = { ...SAMPLE, left: 1, done: 9 };
  // Draw a whole round where "one lesson left" can't apply...
  const fits = FACTS.filter((t) => !t.when || t.when(SAMPLE)).length;
  for (let i = 0; i < fits; i++) draw("facts", FACTS, SAMPLE, store, r);
  // ...it's still in the deck, so it can come up the moment it fits.
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(draw("facts", FACTS, oneLeft, store, r));
  assert.ok([...seen].some((m) => /One lesson left|Last one/.test(m)));
  assert.ok(![...seen].some((m) => /6 to go|lessons left, and/.test(m)), "and never says something false");
});

test("bonus lessons, a set reward, and a broken store", () => {
  const s = fresh();
  const F = dayFacts(s, WED);
  const extra = LESSONS.find((l) => !s.completed[l.id] && !F.plan.ids.includes(l.id));
  s.completed[extra.id] = WED;
  const c = cheerContext(dayFacts(s, WED), extra);
  assert.equal(c.inPlan, false);
  assert.ok(BONUS.map((t) => t.text(c)).includes(cheer(c, memoryStore())));

  assert.equal(cheer({ ...SAMPLE, bundle: "A walk outside" }, memoryStore(), { kind: "complete" }), "Day complete. Reward unlocked: A walk outside");

  const junk = { get: () => ({ deck: ["gone", 42, null], last: "nope" }), set() {} };
  assert.ok(cheer(SAMPLE, junk).length > 10, "a corrupt saved deck just reshuffles");
});
