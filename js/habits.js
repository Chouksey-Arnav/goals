// The 4th Law (Make It Satisfying) and its inversion (Make It Unsatisfying).
// Pure logic, no DOM or storage, so every rule here is unit tested in Node.
//
// The Cardinal Rule: what is immediately rewarded is repeated; what is
// immediately punished is avoided. Everything below exists to make one of
// those two things happen fast, locally and reliably.

import { addDays, capacityFor } from "./planner.js";

// ---------- days

// A day with zero planned capacity is a rest day: it neither extends nor
// breaks the chain, and it can never be "missed".
export const isRestDay = (k, settings) => capacityFor(k, settings) <= 0;

// Days with at least one lesson finished on them ("showed up").
export function activeSet(completed) {
  return new Set(Object.values(completed).filter((v) => typeof v === "string" && v !== "pre"));
}

// ctx: { active:Set, today, settings, trackStart, finishedOn? }
export function dayStatus(k, ctx) {
  if (k < ctx.trackStart) return "before";
  if (ctx.finishedOn && k > ctx.finishedOn) return "finished";
  if (ctx.active.has(k)) return "done";
  if (k === ctx.today) return "today";
  if (k > ctx.today) return "future";
  if (isRestDay(k, ctx.settings)) return "rest";
  return "missed";
}

// Consecutive missed scheduled days ending yesterday. Rest days are skipped.
// 0 = fine, 1 = missed once (an accident), 2+ = missed twice (a new habit).
export function missRun(ctx) {
  let n = 0;
  for (let k = addDays(ctx.today, -1), i = 0; i < 400; i++, k = addDays(k, -1)) {
    const s = dayStatus(k, ctx);
    if (s === "missed") n++;
    else if (s !== "rest") break;
  }
  return n;
}

// Every missed scheduled day that directly follows another missed scheduled
// day is a strike: "never miss twice" broken. Only days strictly after `from`
// (the contract signing day) and strictly before today count. Today is never
// judged until it is over.
export function strikes(ctx, from) {
  const out = [];
  let prevMissed = false;
  for (let k = addDays(from, 1); k < ctx.today; k = addDays(k, 1)) {
    const s = dayStatus(k, ctx);
    if (s === "missed") {
      if (prevMissed) out.push(k);
      prevMissed = true;
    } else if (s !== "rest") prevMissed = false;
  }
  return out;
}

// Comebacks: shown-up days whose previous scheduled day was missed. This is
// the behavior "never miss twice" asks for, so it gets rewarded.
export function comebacks(ctx) {
  let n = 0;
  for (const k of ctx.active) {
    if (k < ctx.trackStart) continue;
    let p = addDays(k, -1);
    for (let i = 0; i < 30 && dayStatus(p, ctx) === "rest"; i++) p = addDays(p, -1);
    if (dayStatus(p, ctx) === "missed") n++;
  }
  return n;
}

// ---------- rewards

// Phase of reinforcement. Incentives start a habit; identity sustains it.
export function reinforcementPhase(shownUpDays) {
  if (shownUpDays < 7)
    return {
      key: "spark", title: "Spark", next: 7, pct: shownUpDays / 7,
      text: "External rewards carry you right now. Collect them every single time, immediately.",
    };
  if (shownUpDays < 21)
    return {
      key: "bridge", title: "Bridge", next: 21, pct: (shownUpDays - 7) / 14,
      text: "Rewards still matter, but notice the internal ones: more focus, less dread before starting.",
    };
  return {
    key: "identity", title: "Identity", next: null, pct: 1,
    text: "The identity is the reward now. You study because that's who you are, not for the treat.",
  };
}

// Rewards that pull against "I am someone who understands ML from first
// principles" (or any health / focus identity). A nudge, not a ban.
const CONFLICT = [
  /ice ?cream/i, /candy/i, /chocolate/i, /soda/i, /junk/i, /fast ?food/i, /fries/i, /donut/i, /cake/i,
  /energy drink/i, /alcohol/i, /beer/i, /wine/i, /vape/i, /cigar/i, /weed/i,
  /doom ?scroll/i, /tik ?tok/i, /reels/i, /shorts/i, /scroll/i, /binge/i, /all[- ]night/i,
  /skip/i, /stay up/i, /cheat/i,
];
export function rewardConflict(text) {
  const m = CONFLICT.map((r) => String(text || "").match(r)).find(Boolean);
  return m ? m[0] : null;
}

export const ALIGNED_REWARDS = [
  "One episode of a science or tech documentary",
  "A 20 minute walk outside with music",
  "A hot shower and a proper wind-down",
  "$5 toward a new ML or math book",
  "Call or text a friend",
  "Play an instrument or a sport for 20 minutes",
  "Read something fun for 20 minutes",
  "A real meal I like, eaten away from screens",
];

// Hyperbolic discounting: how much a payoff `days` away feels worth today.
// k is a typical steepness; the point is the shape, not the constant.
export function perceivedValue(value, days, k = 0.08) {
  return value / (1 + k * Math.max(0, days));
}

// ---------- making avoidance visible

// "Skip coffee out = 5" per line  ->  [{ id, name, amount }]
export function parseAvoid(text) {
  const seen = new Set();
  const out = [];
  for (const line of String(text || "").split("\n")) {
    const m = line.match(/^\s*(.+?)\s*(?:[=|:]\s*\$?\s*(\d+(?:\.\d+)?))?\s*$/);
    if (!m || !m[1].trim()) continue;
    const name = m[1].trim().slice(0, 60);
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, amount: m[2] ? Math.min(10000, Number(m[2])) : 0 });
    if (out.length >= 8) break;
  }
  return out;
}
export const formatAvoid = (items) => items.map((i) => (i.amount ? `${i.name} = ${i.amount}` : i.name)).join("\n");

// avoidLog: { "YYYY-MM-DD": { [itemId]: { s: "avoided" | "slipped", amt } } }
// The amount is stored with each entry so editing an item never rewrites history.
export function savingsTotals(avoidLog, transferred = 0) {
  let saved = 0;
  let slipped = 0;
  let avoidedCount = 0;
  let slipCount = 0;
  for (const day of Object.values(avoidLog || {})) {
    for (const e of Object.values(day || {})) {
      if (e?.s === "avoided") (saved += e.amt || 0), avoidedCount++;
      else if (e?.s === "slipped") (slipped += e.amt || 0), slipCount++;
    }
  }
  const moved = Math.min(Math.max(0, transferred || 0), saved);
  return { saved, slipped, avoidedCount, slipCount, transferred: moved, pending: round2(saved - moved) };
}
const round2 = (x) => Math.round(x * 100) / 100;

// ---------- measuring the right thing

// Measured minutes vs the plan's estimate. Needs a few samples to mean anything.
export function calibration(actual, byId, minSamples = 3) {
  const ids = Object.keys(actual || {}).filter((id) => byId[id] && actual[id] > 0);
  if (ids.length < minSamples) return { samples: ids.length, ratio: null };
  const real = ids.reduce((a, id) => a + actual[id], 0);
  const est = ids.reduce((a, id) => a + byId[id].effort, 0);
  return { samples: ids.length, ratio: est ? real / est : null, real, est };
}

// Ticking a long lesson minutes after the previous tick is a sign of
// measuring ticks instead of learning.
export function looksLikeSpeedTick(lesson, prevTickAt, now) {
  if (!prevTickAt || !lesson) return false;
  if (["quiz", "article", "solution", "watch"].includes(lesson.kind)) return false;
  return lesson.effort >= 15 && now - prevTickAt < 3 * 60 * 1000;
}

// Non-scale victories: early vs recent average for each check-in metric.
export const METRICS = [
  { key: "energy", label: "Energy", low: "drained", high: "charged" },
  { key: "focus", label: "Focus", low: "scattered", high: "locked in" },
  { key: "calm", label: "Calm", low: "stressed", high: "calm" },
];
export function intrinsicTrend(checkins) {
  const days = Object.keys(checkins || {}).sort();
  const out = {};
  for (const { key } of METRICS) {
    const vals = days.map((d) => checkins[d]?.[key]).filter((v) => v >= 1 && v <= 5);
    if (vals.length < 4) {
      out[key] = { n: vals.length, early: null, recent: null, delta: null, series: vals };
      continue;
    }
    const h = Math.floor(vals.length / 2);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const early = avg(vals.slice(0, h));
    const recent = avg(vals.slice(-h));
    out[key] = { n: vals.length, early, recent, delta: recent - early, series: vals };
  }
  return out;
}

// ---------- milestones (immediate, identity-based rewards)

export const MILESTONES = [
  { key: "vote-1", icon: "🗳️", title: "First vote", desc: "Finished your first lesson.", test: (c) => c.votes >= 1 },
  { key: "streak-3", icon: "🔗", title: "3-day chain", desc: "Three scheduled days in a row.", test: (c) => c.best >= 3 },
  { key: "streak-7", icon: "⛓️", title: "One week unbroken", desc: "Seven days in a row.", test: (c) => c.best >= 7 },
  { key: "streak-14", icon: "🔥", title: "Two weeks", desc: "Fourteen days in a row.", test: (c) => c.best >= 14 },
  { key: "streak-21", icon: "🧬", title: "Wired in", desc: "Twenty-one days. This is who you are now.", test: (c) => c.best >= 21 },
  { key: "perfect-1", icon: "💯", title: "Perfect day", desc: "Hit 100% of a day's plan.", test: (c) => c.perfect >= 1 },
  { key: "perfect-5", icon: "🏆", title: "Five perfect days", desc: "Five days at 100%.", test: (c) => c.perfect >= 5 },
  { key: "comeback", icon: "🪃", title: "Comeback", desc: "Showed up right after a miss instead of missing again.", test: (c) => c.comebacks >= 1 },
  { key: "badday", icon: "🌧️", title: "Showed up anyway", desc: "Did the minimum on a bad day.", test: (c) => c.minDays >= 1 },
  { key: "recall-10", icon: "🧠", title: "Explained 10", desc: "Wrote the core idea of 10 lessons.", test: (c) => c.notes >= 10 },
  { key: "votes-50", icon: "🗳️", title: "50 votes", desc: "Fifty lessons finished.", test: (c) => c.votes >= 50 },
  { key: "saved-1", icon: "🫙", title: "First deposit", desc: "Turned an avoided habit into money saved.", test: (c) => c.saved > 0 },
  { key: "contract", icon: "✍️", title: "Signed", desc: "Signed a habit contract with a partner.", test: (c) => c.signed },
  { key: "finished", icon: "🎓", title: "Foundation complete", desc: "Every planned lesson done.", test: (c) => c.finished },
];
export const earnedMilestones = (c) => MILESTONES.filter((m) => m.test(c)).map((m) => m.key);

// ---------- accountability

export function reportText(r) {
  const lines = [];
  lines.push(`Goals check-in, ${r.dateLabel}`);
  if (r.status === "done") lines.push(`✅ Showed up: ${r.lessons} lesson${r.lessons === 1 ? "" : "s"}, about ${r.minutes} min of real work.`);
  else if (r.status === "min") lines.push(`🌧️ Bad day, but I did the minimum (${r.lessons} lesson${r.lessons === 1 ? "" : "s"}).`);
  else lines.push(`❌ Nothing done yet today.`);
  lines.push(`🔗 Chain: ${r.streak} day${r.streak === 1 ? "" : "s"}. ${r.daysLeft > 0 ? `${r.daysLeft} days to the deadline.` : ""}`.trim());
  if (r.owed > 0) lines.push(`⚠️ Per our contract I owe ${r.partner || "you"} ${r.money(r.owed)} for missing twice.`);
  if (r.nsv) lines.push(`Win today: ${r.nsv}`);
  lines.push("Hold me to it.");
  return lines.join("\n");
}

// Link to message a partner, chosen from what their contact looks like.
export function contactLink(contact, text) {
  const c = String(contact || "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c))
    return `mailto:${encodeURIComponent(c)}?subject=${encodeURIComponent("Goals check-in")}&body=${encodeURIComponent(text)}`;
  const digits = c.replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length >= 7) return `sms:${digits}?&body=${encodeURIComponent(text)}`;
  return null;
}
