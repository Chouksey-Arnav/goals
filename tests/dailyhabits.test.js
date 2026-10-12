import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fresh, normalize } from "../js/state.js";
import { dayFacts, BY_ID } from "../js/digest.js";
import * as DH from "../js/dailyhabits.js";
import { compose, composePartner, composeDone, composeHabitNew, composeWeekly } from "../js/emails.js";
import { dueSlots } from "../js/schedule.js";
import { sendEvents, MAX_EVENT_ROWS } from "../api/_lib/run.js";

const MON = "2026-10-12";
const WED = "2026-10-14";
const SAT = "2026-10-17";
const mailCtx = (state) => ({ name: "Sam", appUrl: "https://goals.example", syncedAt: "Wed 7:02 AM", dayIndex: 3, state, middayHour: 14 });

function habit(over = {}, created = MON) {
  const r = DH.makeHabit({ ...DH.TEMPLATES[0], ...over }, { today: created, now: 1, id: over.id || "h1" });
  assert.ok(r.habit, r.error);
  return r.habit;
}
function withHabits(list, log = {}) {
  const s = fresh();
  s.habits = list;
  s.habitLog = log;
  return normalize(s);
}

// ---------- the model

test("makeHabit: validates and fills the two-minute version", () => {
  assert.match(DH.makeHabit({ name: "x" }, { today: MON }).error, /Name the habit/);
  assert.match(DH.makeHabit({ name: "Read", days: [] }, { today: MON }).error, /at least one day/);
  const { habit: h } = DH.makeHabit({ name: "  Read   Atomic Habits ", days: [4, 0, 0, 9] }, { today: MON, now: 5, id: "hx" });
  assert.equal(h.name, "Read Atomic Habits", "whitespace collapsed");
  assert.deepEqual(h.days, [0, 4], "deduped, sorted, out of range dropped");
  assert.match(h.twoMin, /two minutes/i);
  assert.equal(h.created, MON);
  assert.equal(h.archived, null);
});

test("intention and stack read as sentences", () => {
  const h = habit();
  assert.equal(DH.intention(h), "I will read Atomic Habits (10 pages) at 9:30 pm in bed, phone in the other room, every day.");
  assert.equal(DH.stack(h), "After I brush my teeth, I will read Atomic Habits.");
  const ap = habit({ ...DH.TEMPLATES[1], days: [0, 1, 2, 3, 4] });
  assert.match(DH.intention(ap), /^I will read my AP World History book .* at my desk, weekdays\.$/);
  assert.equal(DH.daysLabel([5, 6]), "weekends");
  assert.equal(DH.daysLabel([0, 2, 4]), "Mon, Wed, Fri");
});

test("normalize: old saves get empty habits; malformed habits are dropped", () => {
  const s = normalize({ completed: {} });
  assert.deepEqual(s.habits, []);
  assert.deepEqual(s.habitLog, {});
  const n = DH.normalizeHabits([habit(), { id: "BAD ID", name: "x", created: MON }, { id: "h2", name: "ok", created: "nope" }, habit()]);
  assert.equal(n.length, 1, "bad id, bad date and the duplicate are dropped");
});

test("schedule: days of week, creation day and archiving", () => {
  const h = habit({ days: [0, 2, 4] }); // Mon Wed Fri
  assert.equal(DH.isScheduled(h, MON), true);
  assert.equal(DH.isScheduled(h, "2026-10-13"), false, "Tuesday");
  assert.equal(DH.isScheduled(h, "2026-10-11"), false, "before it was created");
  const a = { ...h, archived: WED };
  assert.equal(DH.isScheduled(a, MON), true);
  assert.equal(DH.isScheduled(a, WED), false, "archived from that day on");
});

test("streak, best and misses: unscheduled days neither add nor break", () => {
  const h = habit({ days: [0, 2, 4] }, "2026-10-05"); // Mon Wed Fri from Mon Oct 5
  const log = { "2026-10-05": { h1: "full" }, "2026-10-07": { h1: "full" }, "2026-10-09": { h1: "min" }, "2026-10-12": { h1: "full" } };
  const s = withHabits([h], log);
  assert.equal(DH.habitStreak(s, h, "2026-10-13"), 4, "Tue (unscheduled) doesn't break it, the min day counts");
  assert.equal(DH.habitStreak(s, h, WED), 4, "today still open: the chain is intact");
  assert.equal(DH.habitMissRun(s, h, WED), 0);
  assert.equal(DH.habitMissRun(s, h, "2026-10-17"), 2, "missed Wed and Fri");
  assert.equal(DH.habitStreak(s, h, "2026-10-17"), 0);
  assert.equal(DH.habitBest(s, h, "2026-10-17"), 4);
  const bonus = withHabits([h], { ...log, "2026-10-13": { h1: "full" } });
  assert.equal(DH.habitStreak(bonus, h, "2026-10-13"), 5, "doing it on an off day counts");
});

test("week and habitFacts: due, open, all done, last week", () => {
  const a = habit({ id: "ha" }, "2026-10-05");
  const b = habit({ id: "hb", name: "Read my AP World History book", days: [0, 1, 2, 3, 4] }, "2026-10-05");
  const log = { [WED]: { ha: "full" }, "2026-10-06": { ha: "full", hb: "full" }, "2026-10-07": { hb: "full" } };
  const s = withHabits([a, b], log);
  const H = DH.habitFacts(s, WED);
  assert.equal(H.due.length, 2);
  assert.deepEqual(H.open.map((x) => x.h.id), ["hb"]);
  assert.equal(H.allDone, false);
  const w = H.list.find((x) => x.h.id === "ha").week;
  assert.equal(w.start, MON);
  assert.equal(w.scheduled, 7);
  assert.equal(w.done, 1);
  assert.equal(w.due, 3, "Mon to Wed");
  assert.deepEqual(H.lastWeek.map((x) => [x.h.id, x.week.done, x.week.scheduled]), [["ha", 1, 7], ["hb", 2, 5]]);
  s.habitLog[WED].hb = "min";
  assert.equal(DH.habitFacts(s, WED).allDone, true);
  assert.equal(DH.habitFacts(s, SAT).due.length, 1, "AP World is weekdays only");
});

// ---------- what triggers an email

test("completionEvents: today's ticks in tick order, today's habits; slots fit the database", () => {
  const s = withHabits([habit({ id: "ha" }), habit({ id: "hz", archived: null }, "2026-10-20")], { [WED]: { ha: "full", hz: "full" } });
  const ids = Object.keys(BY_ID).filter((id) => !s.completed[id]).slice(0, 3);
  s.completed[ids[0]] = WED;
  s.completed[ids[1]] = WED;
  s.completed[ids[2]] = "2026-10-13";
  s.tickAt[ids[0]] = 200;
  s.tickAt[ids[1]] = 100;
  const ev = DH.completionEvents(s, WED, BY_ID);
  assert.deepEqual(ev.map((e) => e.slot), [`done:${ids[1]}`, `done:${ids[0]}`, "habit:ha"], "hz isn't live yet; yesterday's tick isn't today's");
  // Mirror of the check constraint in supabase/migrations/20261013000000_email_log_events.sql
  const sql = readFileSync(new URL("../supabase/migrations/20261013000000_email_log_events.sql", import.meta.url), "utf8");
  assert.match(sql, /\^\(done\|habit\|new\):\[a-z0-9_\.-\]\{1,64\}\$/);
  const re = /^(done|habit|new):[a-z0-9_.-]{1,64}$/;
  for (const id of Object.keys(BY_ID)) assert.match(DH.doneSlot(id), re);
  assert.match(DH.newSlot(`h${Date.now().toString(36)}`), re);
});

test("newHabitEvents: created today, not archived", () => {
  const s = withHabits([habit({ id: "ha" }, WED), habit({ id: "hb" }, MON), { ...habit({ id: "hc" }, WED), archived: WED }]);
  assert.deepEqual(DH.newHabitEvents(s, WED).map((e) => e.slot), ["new:ha"]);
});

test("dueSlots: the weekly kickoff only on the first day of the week, in the morning window", () => {
  const CFG = { morningHour: 7, middayHour: 14, eveningHour: 20 };
  assert.deepEqual(dueSlots(8, {}, CFG, { weekStart: true }), ["morning", "weekly"]);
  assert.deepEqual(dueSlots(8, {}, CFG, { weekStart: false }), ["morning"]);
  assert.deepEqual(dueSlots(15, { morning: {} }, CFG, { weekStart: true }), ["midday"], "no stale kickoff in the afternoon");
  assert.equal(DH.dowOf(MON), 0);
  assert.equal(DH.dowOf("2026-10-18"), 6);
});

// ---------- the emails

test("daily emails list today's habits with the two-minute version", () => {
  const s = withHabits([habit()]);
  const m = compose("morning", dayFacts(s, WED), mailCtx(s));
  assert.match(m.text, /Your habits today · 0\/1/);
  assert.match(m.text, /bad day\? Open the book and read one page/);
  s.habitLog[WED] = { h1: "full" };
  const e = compose("evening", dayFacts(s, WED), mailCtx(s));
  assert.match(e.text, /\[x\] Read Atomic Habits/);
});

test("habits keep their emails on course rest days and after the courses end", () => {
  const s = withHabits([habit()]);
  s.settings.weekendMin = 0; // weekends are course rest days
  const F = dayFacts(s, SAT);
  assert.equal(F.rest, true);
  assert.match(compose("morning", F, mailCtx(s)).text, /Your habits still run today/);
  const eve = compose("evening", F, mailCtx(s));
  assert.ok(eve, "evening reminder exists because a habit is open");
  assert.match(eve.subject, /1 habit still open/);
  s.habitLog[SAT] = { h1: "full" };
  assert.equal(compose("evening", dayFacts(s, SAT), mailCtx(s)), null, "nothing open, no evening email on a rest day");
  const none = withHabits([]);
  none.settings.weekendMin = 0;
  assert.equal(compose("evening", dayFacts(none, SAT), mailCtx(none)), null, "no habits, rest day: silence");
});

test("composeDone: one lesson, the last lesson, one habit, several", () => {
  const s = withHabits([habit()]);
  const plan = dayFacts(s, WED).planLessons;
  s.completed[plan[0].id] = WED;
  let F = dayFacts(s, WED);
  const one = composeDone(F, [{ kind: "lesson", lesson: plan[0] }], mailCtx(s));
  assert.match(one.subject, new RegExp(`^✓ .*${plan.length - 1} left today`));
  assert.match(one.text, /NEXT, RIGHT NOW/);
  assert.match(one.text, /Your habits today · 0\/1/);
  for (const l of plan) s.completed[l.id] = WED;
  F = dayFacts(s, WED);
  assert.match(composeDone(F, [{ kind: "lesson", lesson: plan.at(-1) }], mailCtx(s)).subject, /Day complete/);
  s.habitLog[WED] = { h1: "min" };
  F = dayFacts(s, WED);
  const h = composeDone(F, [{ kind: "habit", habit: s.habits[0], mode: "min" }], mailCtx(s));
  assert.match(h.subject, /Read Atomic Habits \(two-minute version\)\. 1 day in a row, 1\/7 this week/);
  assert.match(h.text, /still showed up/);
  const many = composeDone(F, [{ kind: "lesson", lesson: plan[0] }, { kind: "habit", habit: s.habits[0], mode: "full" }], mailCtx(s));
  assert.match(many.subject, /^✓ 2 done:/);
  assert.equal(composeDone(F, [], mailCtx(s)), null);
});

test("composeHabitNew: the implementation plan, law by law", () => {
  const s = withHabits([habit({}, WED)]);
  const m = composeHabitNew(dayFacts(s, WED), s.habits[0], mailCtx(s));
  assert.match(m.subject, /^New habit: Read Atomic Habits\. Here's how to make it stick\.$/);
  for (const re of [/YOUR IMPLEMENTATION INTENTION\nI will read Atomic Habits/, /After I brush my teeth/, /1 · MAKE IT OBVIOUS/, /3 · MAKE IT EASY[\s\S]*read one page/, /never miss twice/i, /First rep: today at 9:30 pm/]) assert.match(m.text, re);
  assert.doesNotMatch(m.html, /undefined|null/);
});

test("composeWeekly: scorecard, the weakest habit, and a nudge when there are none", () => {
  const a = habit({ id: "ha" }, "2026-10-05");
  const log = {};
  for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) log[d] = { ha: "full" };
  const s = withHabits([a], log);
  const m = composeWeekly(dayFacts(s, MON), mailCtx(s));
  assert.match(m.subject, /^Last week: 3\/7 habit reps \(43%\)/);
  assert.match(m.text, /Fix this one first: Read Atomic Habits \(3\/7\)/);
  const none = composeWeekly(dayFacts(withHabits([]), MON), mailCtx(s));
  assert.match(none.subject, /Put your habits in/);
});

test("partner report mentions yesterday's habits", () => {
  const s = withHabits([habit({ id: "ha" }, "2026-10-05")], { "2026-10-13": { ha: "full" } });
  const spare = Object.keys(BY_ID).find((id) => !s.completed[id]);
  s.completed[spare] = "2026-10-13";
  const r = composePartner(dayFacts(s, "2026-10-13"), dayFacts(s, WED), { name: "Sam", state: s });
  assert.match(r.text, /Daily habits: Read Atomic Habits ✓ \(1\/1\)/);
});

// ---------- delivery: exactly once, through a fake email log

function fakeIO({ failSends = 0, lose = [] } = {}) {
  const rows = new Map();
  const outbox = [];
  let fails = failSends;
  return {
    rows,
    outbox,
    io: {
      db: {
        slotsSent: async () => Object.fromEntries([...rows].map(([k, v]) => [k, v])),
        claimSlot: async (_c, _r, _d, slot) => {
          if (rows.has(slot) || lose.includes(slot)) return false;
          rows.set(slot, { claimed_at: "now", sent_at: null });
          return true;
        },
        releaseSlot: async (_c, _r, _d, slot) => void rows.delete(slot),
        markSent: async (_c, _r, _d, slot, patch) => void rows.set(slot, { ...rows.get(slot), ...patch }),
      },
      send: async (_cfg, mail) => {
        if (fails-- > 0) throw new Error("Connection timeout");
        outbox.push(mail);
        return `id${outbox.length}`;
      },
    },
  };
}
const CFG = { to: "me@example.com", cc: ["copy@example.com"], partners: [], appUrl: "https://goals.example", name: "", morningHour: 7, middayHour: 14, eveningHour: 20 };
const dayCtx = (state, day = WED, hour = 9) => ({ day, hour, state, F: dayFacts(state, day), Fy: dayFacts(state, "2026-10-13"), syncedAt: "now" });

test("sendEvents: every completion emails once, never twice", async () => {
  const s = withHabits([habit({}, MON)]);
  const plan = dayFacts(s, WED).planLessons;
  s.completed[plan[0].id] = WED;
  const f = fakeIO();
  let r = await sendEvents(CFG, dayCtx(s), { io: f.io });
  assert.equal(f.outbox.length, 1);
  assert.equal(f.outbox[0].to, "me@example.com");
  assert.deepEqual(f.outbox[0].bcc, ["copy@example.com"], "copies go to EMAIL_CC as BCC");
  assert.ok(f.rows.get(`done:${plan[0].id}`).sent_at);
  r = await sendEvents(CFG, dayCtx(s), { io: f.io });
  assert.equal(f.outbox.length, 1, "second run: nothing new, nothing sent");
  assert.deepEqual(r, []);
  s.habitLog[WED] = { h1: "full" };
  s.completed[plan[1].id] = WED;
  await sendEvents(CFG, dayCtx(s), { io: f.io });
  assert.equal(f.outbox.length, 2, "two things synced together share one email");
  assert.match(f.outbox[1].subject, /^✓ 2 done/);
});

test("sendEvents: a failed send gives the claims back and the next run retries", async () => {
  const s = withHabits([habit({}, MON)], { [WED]: { h1: "full" } });
  const f = fakeIO({ failSends: 1 }); // (Gmail's own one retry lives in sendMail, outside this fake)
  const r = await sendEvents(CFG, dayCtx(s), { io: f.io });
  assert.equal(r[0].sent, false);
  assert.match(r[0].error, /timeout/);
  assert.equal(f.rows.size, 0, "claim released");
  await sendEvents(CFG, dayCtx(s), { io: f.io });
  assert.equal(f.outbox.length, 1, "retried and delivered");
});

test("sendEvents: a racing run that already claimed an item wins; we don't double send", async () => {
  const s = withHabits([habit({}, MON)], { [WED]: { h1: "full" } });
  const f = fakeIO({ lose: ["habit:h1"] });
  assert.deepEqual(await sendEvents(CFG, dayCtx(s), { io: f.io }), []);
  assert.equal(f.outbox.length, 0);
});

test("sendEvents: a new habit gets its own plan email", async () => {
  const s = withHabits([habit({}, WED)]);
  const f = fakeIO();
  await sendEvents(CFG, dayCtx(s), { io: f.io });
  assert.equal(f.outbox.length, 1);
  assert.match(f.outbox[0].subject, /^New habit: Read Atomic Habits/);
  await sendEvents(CFG, dayCtx(s), { io: f.io });
  assert.equal(f.outbox.length, 1, "only once");
});

test("sendEvents: finishing the day rides on the midday email instead of sending two", async () => {
  const s = withHabits([]);
  const plan = dayFacts(s, WED).planLessons;
  for (const l of plan) s.completed[l.id] = WED;
  const f = fakeIO();
  f.rows.set("morning", { sent_at: "x" });
  await sendEvents(CFG, dayCtx(s, WED, 10), { io: f.io });
  assert.equal(f.outbox.length, 1);
  assert.match(f.outbox[0].subject, /Day complete/);
  assert.match(f.outbox[0].text, /Just done:/);
  assert.ok(f.rows.get("midday").sent_at, "midday is now taken, so the 14:00 run won't repeat it");
  for (const l of plan) assert.ok(f.rows.get(`done:${l.id}`).sent_at);
  // In the evening window the midday email is off the table: a plain done email.
  const g = fakeIO();
  g.rows.set("morning", { sent_at: "x" });
  await sendEvents(CFG, dayCtx(s, WED, 21), { io: g.io });
  assert.match(g.outbox[0].subject, /^✓ \d+ done/);
  assert.equal(g.rows.has("midday"), false);
});

test("sendEvents: daily cap, and nothing without synced progress", async () => {
  const s = withHabits([habit({}, MON)], { [WED]: { h1: "full" } });
  const f = fakeIO();
  for (let i = 0; i < MAX_EVENT_ROWS; i++) f.rows.set(`done:x${i}`, { sent_at: "x" });
  const r = await sendEvents(CFG, dayCtx(s), { io: f.io });
  assert.match(r[0].reason, /daily cap/);
  assert.equal(f.outbox.length, 0);
  assert.deepEqual(await sendEvents(CFG, { problem: "no-progress" }, { io: f.io }), []);
});
