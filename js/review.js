// The end-of-day review: one email that judges the whole day, written by
// Groq from facts this file computes. Pure: no DOM, no storage, no clock.
//
// Why it's built this way: a language model asked "how did my day go?" will
// flatter. So the model never decides anything.
//   1. reviewFacts() turns the record (lessons, habits, the calendar's
//      to-dos and deadlines) into numbered facts, each with a status the
//      code decided: done, partial, missed, or info.
//   2. gradeDay() computes the grade from those facts. The model is told
//      the grade; it can't change it.
//   3. Groq writes the words: a verdict, what got done, what didn't, the
//      pattern it sees, three orders for tomorrow. Every line must cite a
//      fact by id.
//   4. checkReview() throws out anything that isn't backed by the record:
//      a "did" line citing a fact that wasn't done, a number that isn't in
//      the facts, praise phrases, comfort phrases. Any missed fact the model
//      skipped is added back in its own words. Nothing missed can be hidden.
//   5. No Groq (no key, timeout, rate limit, nonsense)? fallbackReview()
//      writes the same email from the facts alone. It always sends.

import { BY_ID } from "./digest.js";
import { looksLikeSpeedTick } from "./habits.js";
import * as P from "./planner.js";
import { fmtMinutes as fmt } from "./principles.js";
import { workFacts, letterFor } from "./worktime.js";

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const list = (a, n = 3) => (a.length <= n ? a.join(", ") : `${a.slice(0, n).join(", ")} and ${a.length - n} more`);
const q = (s) => `“${String(s).replace(/\s+/g, " ").trim().slice(0, 80)}”`;

// ---------- 1. facts

// F: dayFacts(state, day). agenda / tomorrow: the calendar's /api/agenda JSON
// for today and tomorrow (null when the calendar is unreachable).
// cfg: the work day (js/schedule.js) for the free-time fact; without it, or
// without the calendar, there's no free-time fact.
// Returns { facts: [{ id, area, status, text, weight? }], tomorrow: [...] }.
export function reviewFacts(F, state, { agenda = null, tomorrowAgenda = null, syncedAt = null, cfg = null } = {}) {
  const facts = [];
  const add = (area, status, text, extra = {}) => facts.push({ id: `F${facts.length + 1}`, area, status, text, ...extra });
  const t = F.t;
  const money = (x) => `${F.s.currency || "$"}${x}`;

  // --- Courses
  const coursesOn = !F.finished && !F.rest && F.planLessons.length > 0;
  if (coursesOn) {
    const planned = F.planLessons.length;
    const done = F.planDone.length;
    const left = F.leftLessons.map((l) => q(l.title));
    const status = F.complete ? "done" : done > 0 ? "partial" : "missed";
    const minLine = F.mode === "min" ? " Bad-day mode: only the minimum was planned." : "";
    add("courses", status,
      F.complete
        ? `Course plan: all ${planned} planned lesson${planned === 1 ? "" : "s"} done (${fmt(F.doneMin)}).${minLine}`
        : `Course plan: ${done} of ${planned} planned lessons done, ${F.pct}% of today's minutes. Not done: ${list(left)}.${minLine}`,
      { weight: 50, score: F.mode === "min" ? (F.complete ? 0.6 : 0) : F.pct / 100 });
    if (F.mode === "min") add("courses", "info", "You switched today to bad-day mode (one lesson). It keeps the chain alive; it does not move you toward Oct 31.");
  } else if (F.rest && !F.finished) {
    add("courses", "info", "Course rest day (0 minutes planned).");
  }
  const bonus = F.doneToday.filter((l) => !F.planLessons.some((p) => p.id === l.id));
  if (bonus.length) add("courses", "done", `Extra lessons beyond the plan: ${plural(bonus.length, "lesson")} (${list(bonus.map((l) => q(l.title)))}).`);

  // Fast ticks: a long lesson ticked minutes after the one before.
  const ticks = Object.entries(state.tickAt || {}).filter(([, ms]) => Number.isFinite(ms)).sort((a, b) => a[1] - b[1]);
  const todayIds = new Set(F.doneToday.map((l) => l.id));
  const fast = [];
  for (let i = 1; i < ticks.length; i++) {
    const [id, ms] = ticks[i];
    if (todayIds.has(id) && looksLikeSpeedTick(BY_ID[id], ticks[i - 1][1], ms)) fast.push(BY_ID[id]);
  }
  if (fast.length) add("courses", "missed", `${plural(fast.length, "lesson")} ticked within 3 minutes of the previous tick: ${list(fast.map((l) => q(l.title)))}. That's ticking, not learning.`, { flag: "fast" });

  // Lock it in: can you explain what you ticked?
  if (F.doneToday.length) {
    const explained = F.doneToday.filter((l) => (state.notes?.[l.id]?.text || "").trim().length >= 10).length;
    const st = explained === F.doneToday.length ? "done" : explained === 0 ? "missed" : "partial";
    add("courses", st, `Wrote the core idea for ${explained} of ${plural(F.doneToday.length, "lesson")} ticked today.`);
  }

  // Pace vs the deadline.
  if (!F.finished) {
    const p = F.plan;
    if (!p.onTrack) {
      add("courses", "missed", `Pace: ${plural(p.lessonsRemaining, "lesson")} (${fmt(p.totalRemaining)}) left, ${plural(p.daysLeft, "day")} to Oct 31. At your stated capacity you finish ${p.finishAtCapacity ? P.parseKey(p.finishAtCapacity).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "never"}: after the deadline.`);
    } else {
      add("courses", "info", `Pace: ${plural(p.lessonsRemaining, "lesson")} (${fmt(p.totalRemaining)}) left, ${plural(p.daysLeft, "day")} to Oct 31. On track only if you keep doing the full plan.`);
    }
  }

  // The chain.
  if (!F.finished && !F.rest) {
    if (F.shownToday) add("chain", "done", `Chain: ${F.streak} day${F.streak === 1 ? "" : "s"}.`);
    else if (F.missRun >= 1) {
      const signed = !!state.contract?.signedAt;
      const amt = Number(state.contract?.penaltyAmount) || 0;
      add("chain", "missed", `No lesson today, after missing the last scheduled day too. Two in a row${signed ? `: a contract breach${amt ? ` (${money(amt)} owed)` : ""}` : ""}.`);
    }
    else add("chain", "missed", "No lesson today. The chain breaks at midnight.");
  }
  if (F.unpaid?.length) add("chain", "missed", `Unpaid contract penalty: ${plural(F.unpaid.length, "breach")}, ${F.owed ? money(F.owed) : "the agreed penalty"} still owed.`);

  // --- Habits
  for (const x of F.habits.due) {
    const name = q(x.h.name);
    if (x.status === "full") add("habits", "done", `Habit ${name}: done (${x.h.amount || "full"}). Streak ${x.streak}.`, { weight: 25 / Math.max(1, F.habits.due.length), score: 1 });
    else if (x.status === "min") add("habits", "partial", `Habit ${name}: only the two-minute version. Counts for the chain, not for progress.`, { weight: 25 / Math.max(1, F.habits.due.length), score: 0.5 });
    else add("habits", "missed", `Habit ${name}: not done.${x.missRun >= 1 ? ` Missed last time too: that's ${x.missRun + 1} in a row.` : ""}`, { weight: 25 / Math.max(1, F.habits.due.length), score: 0 });
  }

  // --- Avoidance (self-reported)
  for (const [id, e] of Object.entries(state.avoidLog?.[t] || {})) {
    const item = (F.s.avoid || []).find((a) => a.id === id);
    if (!item) continue;
    if (e.s === "slipped") add("avoid", "missed", `Self-reported slip: ${q(item.name)}${e.amt ? ` (cost ${money(e.amt)})` : ""}.`);
    else if (e.s === "avoided") add("avoid", "done", `Self-reported: avoided ${q(item.name)}.`);
  }

  // --- Calendar
  // The calendar's ledger (its To-do tab's "counted tonight", one definition
  // in calendarforarnav src/lib/todo.js): each to-do once, with why it counts.
  // Older calendars without it: the lists below.
  const L = agenda?.tasks?.ledger;
  if (agenda && L && Array.isArray(L.open)) {
    const items = L.done.length + L.open.length;
    const each = items ? 25 / items : 0;
    for (const x of L.done) add("calendar", "done", `To-do done: ${q(x.title)}.`, { weight: each, score: 1 });
    for (const x of L.open) {
      const pushed = x.pushes ? ` Pushed ${plural(x.pushes, "time")} so far.` : "";
      if (x.why === "overdue") add("calendar", "missed", `Overdue to-do, still open: ${q(x.title)} (due ${x.due}, ${plural(x.daysLate, "day")} late).${pushed}`, { weight: each, score: 0 });
      else if (x.why === "pushed") add("calendar", "missed", `Pushed off today's list instead of done: ${q(x.title)} (now due ${x.pushedTo}).${pushed} Moving it is not doing it.`, { weight: each, score: 0, flag: "pushed" });
      else if (x.why === "block") add("calendar", "missed", `Planned work block skipped: ${q(x.title)} at ${x.time}. You picked that time yourself.`, { weight: each, score: 0 });
      else if (x.skippedBlock) add("calendar", "missed", `To-do due today, not done, and its ${x.time} block was skipped: ${q(x.title)}. You picked that time yourself.${pushed}`, { weight: each, score: 0 });
      else add("calendar", "missed", `To-do due today, not done: ${q(x.title)}.${pushed}`, { weight: each, score: 0 });
    }
    if (L.logged?.length) add("calendar", "info", `Jotted and ticked within minutes, so not counted: ${list(L.logged.map((x) => q(x.title)), 5)}. A log of something already done isn't a commitment kept.`);
  }
  if (agenda && !(L && Array.isArray(L.open))) {
    const done = agenda.tasks?.doneToday || [];
    const open = agenda.tasks?.open || [];
    const dueToday = open.filter((x) => x.due === t);
    const overdue = open.filter((x) => x.overdue);
    const blocks = (agenda.tasks?.blocks || []).filter((b) => !b.done && b.past);
    const calItems = done.length + dueToday.length + overdue.length + blocks.length;
    const calWeight = calItems ? 25 : 0;
    const each = calWeight / Math.max(1, calItems);
    for (const x of done) add("calendar", "done", `To-do done: ${q(x.title)}.`, { weight: each, score: 1 });
    for (const x of dueToday) add("calendar", "missed", `To-do due today, not done: ${q(x.title)}.`, { weight: each, score: 0 });
    for (const x of overdue) add("calendar", "missed", `Overdue to-do, still open: ${q(x.title)} (due ${x.due}, ${plural(P.diffDays(x.due, t), "day")} late).`, { weight: each, score: 0 });
    for (const b of blocks) add("calendar", "missed", `Planned work block skipped: ${q(b.title)} at ${b.time}. You picked that time yourself.`, { weight: each, score: 0 });
  }
  if (agenda) {
    const done = L && Array.isArray(L.done) ? L.done : agenda.tasks?.doneToday || [];
    const deadlines = (agenda.events || []).filter((e) => /^Due /.test(e.time || "") || /^Due:/.test(e.title || ""));
    for (const d of deadlines) add("calendar", "info", `Deadline today: ${q(d.title)} (${d.time}). The calendar can't tell whether you submitted it.`);
    const events = (agenda.events || []).filter((e) => !deadlines.includes(e));
    if (events.length) add("calendar", "info", `On the calendar today (attendance not tracked): ${list(events.map((e) => `${q(e.title)}${e.allDay ? "" : ` ${(e.time || "").split(" – ")[0]}`}`), 5)}.`);
    const added = agenda.tasks?.addedToday;
    if (added && added.count >= 4 && added.count > 2 * Math.max(1, done.length)) {
      add("calendar", "missed", `Jotted ${added.count} new to-dos today and finished ${done.length}. Writing the list is not doing the list.`, { flag: "listing" });
    }
  } else {
    add("calendar", "info", "Calendar unavailable: to-dos and deadlines aren't in this review.");
  }

  // --- Time: was there room for the plan, and where did it go?
  // Free = the work day minus calendar events minus a flat allowance for
  // dinner and breaks (js/worktime.js). The model gets these numbers, so it
  // can say "you had the time" only when the record says so.
  const w = cfg ? workFacts(F, agenda, cfg, { day: t }) : null;
  if (w && w.planMin > 0) {
    const window = `between ${w.label.start} and ${w.label.end} (after your calendar and ${fmt(w.breaks)} for dinner and breaks)`;
    if (w.workLeft > 0 && w.freeDay >= w.planMin) {
      add("time", "missed", `Time: you had about ${fmt(w.freeDay)} free ${window}. The whole plan needed ${fmt(w.planMin)}. You logged about ${fmt(w.workDone)} of lessons. The time was there; it went to something else.`, { flag: "slack" });
    } else if (w.workLeft > 0) {
      add("time", "info", `Time: the plan needed ${fmt(w.planMin)} and you had about ${fmt(w.freeDay)} free ${window}. Today was overbooked, so the plan needs fixing, not only the effort. You logged about ${fmt(w.workDone)} of lessons.`);
    } else {
      add("time", "info", `Time: about ${fmt(w.freeDay)} free ${window}; you logged about ${fmt(w.workDone)} of lessons.`);
    }
  }

  // --- Self-reports, labeled as such.
  const ci = state.checkins?.[t];
  if (ci && (ci.energy || ci.focus || ci.calm)) {
    add("self", "info", `Self-reported check-in: energy ${ci.energy ?? "-"}/5, focus ${ci.focus ?? "-"}/5, calm ${ci.calm ?? "-"}/5.`);
  }
  const log = state.dayLog?.[t] || {};
  if (log.nsv) add("self", "info", `Self-reported win: ${q(log.nsv)} (not verified).`);
  if (!log.closed && !F.finished && !F.rest) add("self", "missed", "You didn't close the day in the app (the 20-second habit stack).");
  if (syncedAt) add("sync", "info", `Last sync from the app: ${syncedAt}. Anything after that isn't counted.`);

  // --- Tomorrow, for the orders.
  const tomorrow = [];
  const tk = P.addDays(t, 1);
  for (const e of (tomorrowAgenda?.events || []).slice(0, 6)) tomorrow.push(`${e.allDay ? "All day" : (e.time || "").split(" – ")[0]}: ${e.title}`);
  for (const x of (tomorrowAgenda?.tasks?.open || []).filter((x) => x.due === tk).slice(0, 4)) tomorrow.push(`Due tomorrow: ${x.title}`);

  return { facts, tomorrow };
}

// ---------- 2. the grade (code, not the model)

// Weighted share of commitments kept: course plan 50, habits 25, calendar
// to-dos 25, renormalized over whatever exists today. Then caps:
// fast ticks can't earn better than C, a breach or a broken chain can't
// earn better than D. Nothing to judge -> null (no email).
export function gradeDay(facts) {
  const scored = facts.filter((f) => Number.isFinite(f.weight) && f.weight > 0);
  if (!scored.length) return null;
  const total = scored.reduce((a, f) => a + f.weight, 0);
  let pct = Math.round((scored.reduce((a, f) => a + f.weight * f.score, 0) / total) * 100);
  const caps = [];
  if (facts.some((f) => f.flag === "fast")) caps.push(["C", 74, "lessons ticked too fast to count as learning"]);
  if (facts.some((f) => f.area === "chain" && f.status === "missed")) caps.push(["D", 59, "the chain broke or a breach is open"]);
  for (const [, max] of caps) pct = Math.min(pct, max);
  return { pct, letter: letterFor(pct), capped: caps.map((c) => c[2]) };
}

// The grade "if the day ended now", for the calendar's To-do tab (via
// /api/today). Same facts, same gradeDay(): one brain, no second formula.
// parts: per area, how many of today's commitments are done, and the
// area's score. null when there's nothing to grade yet.
export function gradeNow(F, state, { agenda = null, cfg = null } = {}) {
  const { facts } = reviewFacts(F, state, { agenda, cfg });
  const g = gradeDay(facts);
  if (!g) return null;
  const parts = {};
  for (const area of ["courses", "habits", "calendar"]) {
    const xs = facts.filter((f) => f.area === area && Number.isFinite(f.weight) && f.weight > 0);
    if (!xs.length) continue;
    const w = xs.reduce((a, f) => a + f.weight, 0);
    parts[area] = { pct: Math.round((xs.reduce((a, f) => a + f.weight * f.score, 0) / w) * 100) };
  }
  if (parts.courses) Object.assign(parts.courses, { done: F.planDone.length, total: F.planLessons.length });
  if (parts.habits) Object.assign(parts.habits, { done: F.habits.due.filter((x) => x.status === "full" || x.status === "min").length, total: F.habits.due.length });
  const L = agenda?.tasks?.ledger;
  if (parts.calendar) Object.assign(parts.calendar, L && Array.isArray(L.open) ? { done: L.done.length, total: L.done.length + L.open.length } : { done: facts.filter((f) => f.area === "calendar" && f.status === "done").length, total: facts.filter((f) => f.area === "calendar" && f.weight > 0).length });
  return { ...g, parts, calendar: !!agenda };
}

// ---------- 3. the prompt

export const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "verdict", "did", "missed", "pattern", "tomorrow", "question"],
  properties: {
    headline: { type: "string", description: "One blunt line, max 90 characters." },
    verdict: { type: "string", description: "2 to 4 sentences. The honest summary of the day." },
    did: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["fact", "line"], properties: { fact: { type: "string" }, line: { type: "string" } } },
    },
    missed: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["fact", "line"], properties: { fact: { type: "string" }, line: { type: "string" } } },
    },
    pattern: { type: "string", description: "The one pattern or excuse you see, named plainly. Empty string if none." },
    tomorrow: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["order", "fact"], properties: { order: { type: "string" }, fact: { type: ["string", "null"] } } },
    },
    question: { type: "string", description: "One hard question to answer before bed." },
  },
};

export const REVIEW_SYSTEM = `You are the end-of-day reviewer for one high school student, and you write to them directly as "you". They are preparing for the AI Olympiad (USAAIO Round 1 on Feb 19, 2027), finishing two machine learning courses by Oct 31, and keeping daily habits. They asked for a ruthless mentor, not a cheerleader. In their words: "Don't be a yes person. If something sounds like shit, tell me." And about these reviews: "You need to be more ruthless. Not too ruthless, but more ruthless. If I should have done this, I could have done all this, I had free time, but I chose to slack off: say that." Their known weak spot: they drift into YouTube between tasks and lose the evening to it.

You receive FACTS computed from their records. Each fact has an id (F1, F2, ...) and a status the code already decided:
- done: verified in the record.
- partial: some of it happened. Say exactly how much. Never round it up to done.
- missed: did not happen.
- info: context. Calendar events are scheduled, not verified as attended. Anything marked "self-reported" is their word only; say so if you use it.
You also receive the GRADE. It was computed by code. Do not change it, soften it, or argue with it.

Rules (break any and the review is thrown away):
1. Only the facts exist. Never claim they did something unless a fact with status done says so. Never guess what happened off the record. If the record is thin, say the record is thin.
2. Every number you write must appear in the facts. Do not compute new percentages or totals.
3. No praise padding and no comfort. Banned: "great job", "good job", "well done", "proud", "amazing", "awesome", "impressive", "nice work", "keep it up", "it's okay", "that's okay", "don't worry", "don't be too hard on yourself", "tomorrow is a new day", "every step counts", "progress is progress", "at least", "you've got this". No exclamation marks. No emojis.
4. Acknowledge what was done in plain words, once, without adjectives. "You did all 4 lessons." Not "You crushed it."
5. Name what wasn't done first and specifically. Name the cost: the chain, the pace to Oct 31, the contract penalty, the overdue days.
6. Call out the pattern if the facts show one: lots of to-dos jotted but few done (planning instead of doing), fast ticks (ticking instead of learning), two-minute versions every day (minimums becoming the habit), bad-day mode, work blocks they scheduled themselves and then skipped, to-dos pushed off today's list instead of done (the calendar counts every push), overdue items piling up, lessons ticked without writing the core idea. If there is no pattern, leave it empty. Do not invent one.
7. The time fact decides how hard you land. If the time fact is missed ("The time was there"), the misses were a choice, not bad luck: say it in those terms, with that fact's numbers. "You had the time. You chose something else." Make it the verdict's first sentence. Do not name what they did instead (YouTube or anything else): the record doesn't show it. If the time fact says the day was overbooked, say the plan was too big and the fix is the plan, while still naming what didn't get done. With no time fact, don't talk about free time at all.
8. Short sentences. Second person ("you"). Direct, like a coach who respects them enough to tell the truth. Firm, not cruel: no sarcasm, no insults, no name-calling ("lazy", "pathetic", "loser"). Hard on the choices, never on the person.
9. tomorrow: at most 3 orders, each a concrete action with a time and a first physical step. The first order starts at TOMORROW'S WORK START below: "2:32 PM: phone in another room, open 'Introduction to Numpy', press play. Nothing else until it's done." Not "Try to do better". Where it helps, one order removes the distraction in advance (YouTube blocked or closed until the lessons are done). Use tomorrow's calendar to place them. Cite the fact each order fixes, or null.
10. did: one line per done or partial fact worth stating. missed: one line per missed fact, most costly first. Cite the fact id in "fact".
11. headline: max 90 characters, starts with the grade letter, e.g. "C. Half the plan, and the essay is two days overdue."`;

export function buildReviewMessages({ day, weekday, grade, facts, tomorrow, name, workStart = "2:32 PM" }) {
  const lines = facts.map((f) => `${f.id} [${f.status}] (${f.area}) ${f.text}`);
  return [
    { role: "system", content: REVIEW_SYSTEM },
    {
      role: "user",
      content: [
        `Day: ${weekday} ${day}.${name ? ` Name: ${name}.` : ""}`,
        `GRADE (fixed): ${grade.letter}, ${grade.pct}% of today's commitments kept${grade.capped.length ? ` (capped because: ${grade.capped.join("; ")})` : ""}.`,
        "FACTS:",
        ...lines,
        `TOMORROW'S WORK START: ${workStart}.`,
        tomorrow.length ? `TOMORROW ON THE CALENDAR:\n${tomorrow.join("\n")}` : "TOMORROW ON THE CALENDAR: nothing scheduled.",
      ].join("\n"),
    },
  ];
}

// ---------- 4. the checks

// Banned: praise padding and comfort (they asked for no cheerleading) and
// insults (ruthless about the choices, never about the person).
const BANNED = /\b(great|good|nice|amazing|awesome|fantastic|excellent|impressive|solid|stellar)\s+(job|work|effort|day|start|progress)\b|\bwell done\b|\bproud\b|\bkeep it up\b|\b(it'?s|that'?s|it is|that is)\s+(ok(ay)?|fine|alright)\b|\bdon'?t worry\b|\bdon'?t be (too )?hard on yourself\b|\btomorrow is a new day\b|\bevery (little )?(step|bit) counts\b|\bprogress is progress\b|\bat least you\b|\byou'?ve got this\b|\bcrush(ed|ing)? it\b|\bkill(ed|ing) it\b|\b(lazy|pathetic|loser|worthless|useless|stupid|idiot|disgrace(ful)?)\b|!|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/iu;

const numbersIn = (s) => (String(s).match(/\d+(?:[.:]\d+)?/g) || []);
const sentences = (s) => String(s).replace(/\s+/g, " ").trim().split(/(?<=[.?!])\s+/).filter(Boolean);

// A line survives if it has no banned phrase and every number in it is in
// the facts (or the grade).
// Orders and the question are about tomorrow, not claims about today, so
// their numbers (a time to start) aren't checked; pass corpusNums = null.
function clean(line, corpusNums, max = 300) {
  const s = String(line || "").replace(/\s+/g, " ").trim().slice(0, max);
  if (!s || BANNED.test(s)) return "";
  return !corpusNums || numbersIn(s).every((n) => corpusNums.has(n)) ? s : "";
}
const cleanProse = (text, nums, max) => sentences(text).map((s) => clean(s, nums, max)).filter(Boolean).join(" ");

// Groq's JSON -> a review that only says what the record supports.
// Returns null when what's left isn't worth sending (then fallbackReview).
export function checkReview(raw, { facts, grade, tomorrow = [] }) {
  let o = raw;
  if (typeof o === "string") {
    try {
      o = JSON.parse(o);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object") return null;
  const byId = Object.fromEntries(facts.map((f) => [f.id, f]));
  // The fixed dates the prompt itself names (Oct 31, Feb 19, 2027) are fair game too.
  const corpus = [...facts.map((f) => f.text), ...tomorrow, `${grade.pct}`, "Oct 31 Feb 19 2027"].join(" ");
  const nums = new Set(numbersIn(corpus));
  const dropped = [];

  const pick = (arr, allowed) => {
    const out = [];
    const seen = new Set();
    for (const it of Array.isArray(arr) ? arr : []) {
      const f = byId[it?.fact];
      if (!f || !allowed.includes(f.status) || seen.has(f.id)) {
        dropped.push(`cites ${it?.fact || "nothing"} as ${allowed[0]}`);
        continue;
      }
      const line = clean(it.line, nums, 220);
      if (!line) {
        dropped.push(`${f.id}: unsupported line`);
        continue;
      }
      seen.add(f.id);
      out.push({ fact: f.id, line });
    }
    return out;
  };

  const did = pick(o.did, ["done", "partial"]);
  const missed = pick(o.missed, ["missed", "partial"]);
  // Nothing missed gets hidden: any missed fact the model skipped goes in, in the record's words.
  const covered = new Set(missed.map((m) => m.fact));
  for (const f of facts) if (f.status === "missed" && !covered.has(f.id)) missed.push({ fact: f.id, line: f.text, added: true });

  let headline = clean(o.headline, nums, 110);
  if (!headline || !headline.startsWith(grade.letter)) headline = defaultHeadline(grade, facts);
  const verdict = cleanProse(o.verdict, nums, 260);
  if (!verdict) return null;
  const pattern = cleanProse(o.pattern, nums, 260);
  const orders = (Array.isArray(o.tomorrow) ? o.tomorrow : [])
    .map((x) => clean(x?.order, null, 200))
    .filter(Boolean)
    .slice(0, 3);
  const question = clean(o.question, null, 200);
  return { headline, verdict, did, missed, pattern, tomorrow: orders, question, dropped, source: "groq" };
}

// ---------- 5. without Groq

function defaultHeadline(grade, facts) {
  const missed = facts.filter((f) => f.status === "missed").length;
  const tail = {
    A: missed ? `You kept nearly everything. ${plural(missed, "thing")} still slipped.` : "You did what you said you'd do.",
    B: `Most of it. ${plural(missed, "thing")} didn't happen.`,
    C: "Half a day. Half a day doesn't finish two courses by Oct 31.",
    D: "Most of what you planned didn't happen.",
    F: "You planned a day and didn't do it.",
  }[grade.letter];
  return `${grade.letter}. ${tail}`;
}

export function fallbackReview({ facts, grade, workStart = "2:32 PM" }) {
  const did = facts.filter((f) => f.status === "done" || f.status === "partial").map((f) => ({ fact: f.id, line: f.text }));
  // "You had the time" leads: it's the cost behind every other miss.
  const missed = facts.filter((f) => f.status === "missed").sort((a, b) => (b.flag === "slack") - (a.flag === "slack")).map((f) => ({ fact: f.id, line: f.text }));
  const orders = [];
  const course = facts.find((f) => f.area === "courses" && (f.status === "missed" || f.status === "partial") && /Not done: /.test(f.text));
  if (course) orders.push(`${workStart}: phone in another room, YouTube closed, open ${course.text.split("Not done: ")[1].split(/,| and /)[0].replace(/\.$/, "")} and press play. Nothing else until it's done.`);
  const overdue = facts.find((f) => f.area === "calendar" && /Overdue/.test(f.text));
  if (overdue) orders.push(`Finish or delete ${overdue.text.match(/“[^”]+”/)?.[0] || "the oldest overdue to-do"} tomorrow. An overdue list you ignore is a list you've stopped believing.`);
  const habit = facts.find((f) => f.area === "habits" && f.status === "missed");
  if (habit) orders.push(`Do ${habit.text.match(/“[^”]+”/)?.[0] || "the habit you missed"} at its set time. Never miss twice.`);
  const slack = facts.find((f) => f.flag === "slack");
  return {
    headline: defaultHeadline(grade, facts),
    verdict: `${slack ? "You had the time. You chose something else. " : ""}${grade.pct}% of today's commitments kept. ${missed.length ? `${plural(missed.length, "thing")} on your own list didn't happen.` : "Nothing on your list slipped."}`,
    did,
    missed,
    pattern: slack
      ? "The plan fit inside the free time you had. This wasn't a scheduling problem. It was what you did with the time."
      : facts.find((f) => f.flag === "listing" || f.flag === "fast")?.text || "",
    tomorrow: orders.slice(0, 3),
    question: missed.length ? "What exactly will you do differently tomorrow, and at what time?" : "What's the hardest thing on tomorrow's list, and when will you start it?",
    dropped: [],
    source: "rules",
  };
}

// ---------- the email

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const GRADE_COLOR = { A: "#15803d", B: "#2563eb", C: "#b45309", D: "#c2410c", F: "#b91c1c" };

// r: checkReview() or fallbackReview() output. ctx: { day, weekday, appUrl, calendarUrl }.
export function composeReview(r, grade, ctx) {
  const date = P.parseKey(ctx.day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const subject = `Day review · ${r.headline}`.slice(0, 140);
  const section = (title, items) => (items.length ? `${title}\n${items.map((x) => `- ${x}`).join("\n")}` : "");
  const text = [
    `${date}: grade ${grade.letter} (${grade.pct}% of commitments kept)`,
    "",
    r.headline,
    "",
    r.verdict,
    "",
    section("DIDN'T HAPPEN", r.missed.map((m) => m.line)),
    section("DONE", r.did.map((d) => d.line)),
    r.pattern ? `THE PATTERN\n${r.pattern}` : "",
    section("TOMORROW", r.tomorrow),
    r.question ? `BEFORE BED\n${r.question}` : "",
    "",
    `Goals: ${ctx.appUrl}${ctx.calendarUrl ? `\nCalendar: ${ctx.calendarUrl}` : ""}`,
    r.source === "rules" ? "\n(Written from your record without Groq. Set GROQ_API_KEY for the full review.)" : "",
  ].filter((x) => x !== "").join("\n\n").replace(/\n{3,}/g, "\n\n");

  const li = (items, color) => items.map((x) => `<li style="margin:0 0 6px;color:${color}">${esc(x)}</li>`).join("");
  const box = (title, color, inner) =>
    `<div style="margin:0 0 18px"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:${color};margin-bottom:6px">${title}</div>${inner}</div>`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f9fafb">
<div style="display:none;max-height:0;overflow:hidden">${esc(r.verdict.slice(0, 140))}</div>
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:580px;margin:0 auto;padding:24px 18px;color:#1f2937">
  <div style="font-size:13px;color:#6b7280;margin-bottom:8px">${esc(date)} · day review</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px"><tr>
    <td style="width:56px;height:56px;border-radius:14px;background:${GRADE_COLOR[grade.letter]};color:#fff;font-size:30px;font-weight:800;text-align:center;vertical-align:middle">${grade.letter}</td>
    <td style="padding-left:14px;font-size:14px;color:#4b5563">${grade.pct}% of today's commitments kept${grade.capped.length ? `<br><span style="color:#b91c1c">Capped: ${esc(grade.capped.join("; "))}</span>` : ""}</td>
  </tr></table>
  <h1 style="margin:0 0 12px;font-size:21px;line-height:1.3;color:#111827">${esc(r.headline)}</h1>
  <p style="margin:0 0 18px;font-size:15px;line-height:1.6">${esc(r.verdict)}</p>
  ${r.missed.length ? box("Didn't happen", "#b91c1c", `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.5">${li(r.missed.map((m) => m.line), "#7f1d1d")}</ul>`) : ""}
  ${r.did.length ? box("Done", "#15803d", `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.5">${li(r.did.map((d) => d.line), "#14532d")}</ul>`) : ""}
  ${r.pattern ? box("The pattern", "#b45309", `<p style="margin:0;font-size:14px;line-height:1.55;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px">${esc(r.pattern)}</p>`) : ""}
  ${r.tomorrow.length ? box("Tomorrow", "#4f46e5", `<ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.5">${li(r.tomorrow, "#111827")}</ol>`) : ""}
  ${r.question ? box("Before bed", "#111827", `<p style="margin:0;font-size:15px;font-weight:600">${esc(r.question)}</p>`) : ""}
  <p style="margin:22px 0 0;font-size:12px;color:#9ca3af">Every line comes from your synced record: lessons, habits and the calendar's to-dos. Events on the calendar are not proof you went. <a href="${esc(ctx.appUrl)}" style="color:#6b7280">Goals</a>${ctx.calendarUrl ? ` · <a href="${esc(ctx.calendarUrl)}" style="color:#6b7280">Calendar</a>` : ""}${r.source === "rules" ? " · Written without Groq (set GROQ_API_KEY for the full review)." : ""}</p>
</div></body></html>`;
  return { subject, text, html };
}
