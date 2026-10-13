// Your own daily habits (read Atomic Habits, read the AP World History book,
// ...), tracked next to the course plan and kept after the courses end.
// Pure: no DOM, no storage, no clock. The app, the emails and the tests all
// call these, so "did I do it", streaks and week scores mean the same thing
// everywhere.
//
// A habit is built the Atomic Habits way, so creating one is already the
// plan for doing it:
//   Law 1  Obvious     an implementation intention (time + place) and an
//                      optional habit stack ("After I ..., I will ...")
//   Law 2  Attractive  an identity it votes for
//   Law 3  Easy        a two-minute version that still counts on bad days
//   Law 4  Satisfying  one tap to tick it, a chain, a week score, an email
//
// State: state.habits = [habit], state.habitLog = { "YYYY-MM-DD": { id: "full" | "min" } }

import { addDays, parseKey } from "./planner.js";

export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // index 0 = Monday
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const MAX_HABITS = 12;

// Monday = 0 ... Sunday = 6.
export const dowOf = (k) => (parseKey(k).getDay() + 6) % 7;
export const weekStart = (k) => addDays(k, -dowOf(k));

// One-tap starting points. Every field stays editable.
export const TEMPLATES = [
  {
    key: "atomic",
    name: "Read Atomic Habits",
    amount: "10 pages",
    twoMin: "Open the book and read one page",
    time: "9:30 pm",
    place: "in bed, phone in the other room",
    after: "I brush my teeth",
    identity: "I am a reader who builds systems, not wishes.",
  },
  {
    key: "apwh",
    name: "Read my AP World History book",
    amount: "1 section, 5 bullet notes",
    twoMin: "Read one paragraph and write one note",
    time: "5:00 pm",
    place: "my desk",
    after: "I get home from school and eat a snack",
    identity: "I am a student who learns it daily instead of cramming.",
  },
];

const LIMITS = { name: 60, amount: 60, twoMin: 90, time: 20, place: 60, after: 80, identity: 120 };
const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// Validate form input into a habit, or explain what's wrong.
// { today, now } come from the caller so this stays pure.
export function makeHabit(input, { today, now, id } = {}) {
  const h = {};
  for (const [k, n] of Object.entries(LIMITS)) h[k] = clean(input[k], n);
  if (h.name.length < 2) return { error: "Name the habit (e.g. Read Atomic Habits)." };
  const days = [...new Set((input.days || ALL_DAYS).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!days.length) return { error: "Pick at least one day." };
  if (!h.twoMin) h.twoMin = `Do it for two minutes: just start "${h.name}"`;
  return {
    habit: {
      id: id || `h${Number(now || 0).toString(36)}`,
      ...h,
      days,
      created: today,
      createdAt: now || 0,
      archived: null,
    },
  };
}

// Edits keep identity (id, created) and history.
export function editHabit(old, input) {
  const r = makeHabit({ ...old, ...input }, { today: old.created, now: old.createdAt, id: old.id });
  return r.error ? r : { habit: { ...r.habit, archived: old.archived } };
}

const ID_RE = /^[a-z0-9_-]{1,40}$/;
const isDay = (k) => typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k);

// Drop anything malformed (old saves, hand-edited backups).
export function normalizeHabits(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const h of list) {
    if (!h || !ID_RE.test(h.id) || seen.has(h.id) || !isDay(h.created) || !clean(h.name, 60)) continue;
    seen.add(h.id);
    const days = Array.isArray(h.days) ? h.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : ALL_DAYS;
    out.push({
      ...h,
      days: days.length ? [...new Set(days)].sort() : ALL_DAYS,
      archived: isDay(h.archived) ? h.archived : null,
    });
  }
  return out;
}

// Active on day k: created on or before it, not archived yet.
export const isLive = (h, k) => h.created <= k && (!h.archived || k < h.archived);
export const isScheduled = (h, k) => isLive(h, k) && h.days.includes(dowOf(k));
export const statusOn = (state, h, k) => state.habitLog?.[k]?.[h.id] || null;

// Consecutive days done, ending today (or yesterday while today is still
// open). Days the habit isn't scheduled neither add nor break, unless you did
// it anyway, which counts.
export function habitStreak(state, h, today) {
  let k = statusOn(state, h, today) ? today : addDays(today, -1);
  let n = 0;
  for (let i = 0; i < 800 && k >= h.created; i++, k = addDays(k, -1)) {
    if (statusOn(state, h, k)) n++;
    else if (isScheduled(h, k)) break;
  }
  return n;
}

export function habitBest(state, h, today) {
  let best = 0;
  let run = 0;
  for (let k = h.created, i = 0; k <= today && i < 800; k = addDays(k, 1), i++) {
    if (statusOn(state, h, k)) best = Math.max(best, ++run);
    else if (isScheduled(h, k) && k < today) run = 0;
  }
  return best;
}

// Scheduled days missed in a row, ending yesterday. 1 = an accident,
// 2+ = a new habit forming (the wrong one).
export function habitMissRun(state, h, today) {
  let n = 0;
  for (let k = addDays(today, -1), i = 0; i < 400 && k >= h.created; i++, k = addDays(k, -1)) {
    if (statusOn(state, h, k)) break;
    if (isScheduled(h, k)) n++;
  }
  return n;
}

// The Monday-to-Sunday week containing k, as of `today`.
export function habitWeek(state, h, k, today = k) {
  const start = weekStart(k);
  const days = DOW.map((name, i) => {
    const d = addDays(start, i);
    const st = statusOn(state, h, d);
    return { k: d, name, sched: isScheduled(h, d), status: st, future: d > today, today: d === today };
  });
  const done = days.filter((d) => d.status).length;
  const scheduled = days.filter((d) => d.sched).length;
  const due = days.filter((d) => d.sched && !d.future).length;
  return { start, days, done, scheduled, due, pct: scheduled ? Math.min(100, Math.round((done / scheduled) * 100)) : 0 };
}

export const liveHabits = (state, k) => (state.habits || []).filter((h) => isLive(h, k));

// Everything the Habits tab, the Today card and the emails need, once.
export function habitFacts(state, t) {
  const list = liveHabits(state, t).map((h) => {
    const status = statusOn(state, h, t);
    return {
      h,
      sched: isScheduled(h, t),
      status,
      streak: habitStreak(state, h, t),
      best: habitBest(state, h, t),
      missRun: habitMissRun(state, h, t),
      week: habitWeek(state, h, t, t),
    };
  });
  const due = list.filter((x) => x.sched || x.status);
  const open = list.filter((x) => x.sched && !x.status);
  const lastWeekDay = addDays(weekStart(t), -1);
  const lastWeek = (state.habits || [])
    .filter((h) => h.created <= lastWeekDay && (!h.archived || h.archived > weekStart(lastWeekDay)))
    .map((h) => ({ h, week: habitWeek(state, h, lastWeekDay, lastWeekDay) }))
    .filter((x) => x.week.scheduled > 0);
  return {
    list,
    due,
    open,
    done: due.filter((x) => x.status),
    allDone: due.length > 0 && open.length === 0,
    weekDone: list.reduce((a, x) => a + x.week.done, 0),
    weekScheduled: list.reduce((a, x) => a + x.week.scheduled, 0),
    lastWeek,
  };
}

// ---------- words

const lcFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
// "Read Atomic Habits" stays as typed after "I will", except the first letter.
const verb = (h) => (/^[A-Z][a-z]/.test(h.name) && !/^(AP|I)\b/.test(h.name) ? lcFirst(h.name) : h.name);

export function daysLabel(days) {
  const d = [...days].sort().join(",");
  if (d === "0,1,2,3,4,5,6") return "every day";
  if (d === "0,1,2,3,4") return "weekdays";
  if (d === "5,6") return "weekends";
  return days.map((i) => DOW[i]).join(", ");
}

// "I will read Atomic Habits (10 pages) at 9:30 pm in bed, every day."
export function intention(h) {
  const where = h.place ? (/^(at|in|on|by|under|before|after)\b/i.test(h.place) ? ` ${h.place}` : ` at ${h.place}`) : "";
  return `I will ${verb(h)}${h.amount ? ` (${h.amount})` : ""}${h.time ? ` at ${h.time}` : ""}${where}, ${daysLabel(h.days)}.`;
}

// "After I brush my teeth, I will read Atomic Habits."
export const stack = (h) => (h.after ? `After ${h.after.replace(/[.,]$/, "")}, I will ${verb(h)}.` : "");

// ---------- emails triggered by doing things

// Slots in email_log. Kept short and safe for the table's check constraint.
export const doneSlot = (lessonId) => `done:${lessonId}`;
export const habitSlot = (habitId) => `habit:${habitId}`;
export const newSlot = (habitId) => `new:${habitId}`;
export const isEventSlot = (slot) => /^(done|habit|new):/.test(slot);

// Every completion on day k: lessons ticked that day and habits done that
// day. byId maps lesson ids to lessons (unknown ids are ignored).
export function completionEvents(state, k, byId) {
  const lessons = Object.entries(state.completed || {})
    .filter(([id, d]) => d === k && byId[id])
    .sort((a, b) => (state.tickAt?.[a[0]] || 0) - (state.tickAt?.[b[0]] || 0))
    .map(([id]) => ({ slot: doneSlot(id), kind: "lesson", lesson: byId[id] }));
  const log = state.habitLog?.[k] || {};
  const habits = liveHabits(state, k)
    .filter((h) => log[h.id])
    .map((h) => ({ slot: habitSlot(h.id), kind: "habit", habit: h, mode: log[h.id] }));
  return [...lessons, ...habits];
}

// Habits created on day k: each gets one "here's how to make it stick" email.
export const newHabitEvents = (state, k) =>
  (state.habits || []).filter((h) => h.created === k && !h.archived).map((h) => ({ slot: newSlot(h.id), kind: "new", habit: h }));
