// What the app says the moment you tick a lesson. Pure: no DOM, no storage,
// no clock, so it's unit tested.
//
// Every message is built from the tick you just made: the minutes that lesson
// took off today, how much closer the ring got, what's left, the next lesson.
// A normal tick is one fact plus one push ("22 min more and today's done.
// Keep going, you can do this."), drawn from two separate decks, so the
// pairs keep changing.
//
// No repeats: each pool is a shuffled deck. A message comes back only after
// every other message that fits has been shown, then the deck reshuffles
// (never opening with the one you just saw). The deck lives in a small store
// the app keeps per device.

import { fmtMinutes as fmt } from "./principles.js";

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// Everything a message may mention, from dayFacts() after the tick.
// actualMin: minutes the timer measured for this lesson, if it ran.
export function cheerContext(F, lesson, { actualMin = null } = {}) {
  const inPlan = F.plan.ids.includes(lesson.id);
  const n = F.planLessons.length;
  const gain = inPlan && F.plan.targetMin ? Math.round((lesson.effort / F.plan.targetMin) * 100) : 0;
  const s = F.sessions;
  const inAm = !!s && s.am.lessons.some((l) => l.id === lesson.id);
  const block = !s ? null : s.am.done ? "afternoon" : "morning";
  const cur = !s ? null : s.am.done ? s.pm : s.am;
  const daysLeft = F.s?.deadline ? Math.max(0, daysBetween(F.t, F.s.deadline) + 1) : 0;
  return {
    title: cut(lesson.title, 48),
    effort: fmt(lesson.effort),
    actual: actualMin ? fmt(actualMin) : null,
    inPlan,
    n,
    done: F.planDone.length,
    left: F.leftLessons.length,
    leftMin: fmt(Math.max(0, F.plan.targetMin - F.doneMin)),
    leftMinRaw: Math.max(0, F.plan.targetMin - F.doneMin),
    pct: F.pct,
    gain,
    pctBefore: Math.max(0, F.pct - gain),
    next: F.next ? cut(F.next.title, 44) : null,
    first: F.doneToday.length === 1,
    streak: F.streak,
    votes: F.votes,
    daysLeft,
    doneMin: fmt(F.doneMin),
    complete: F.complete,
    weekend: !!s,
    block,
    blockLeft: cur ? cur.left.length : 0,
    blockLeftMin: cur ? fmt(cur.leftMin) : "",
    amJustDone: inAm && s.am.done && !F.complete,
    pmLeft: s ? s.pm.left.length : 0,
    pmLeftMin: s ? fmt(s.pm.leftMin) : "",
    bundle: (F.s?.bundle || "").trim(),
  };
}

function daysBetween(a, b) {
  const d = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
  return Math.round((d(b) - d(a)) / 86400000);
}

const T = (id, text, when) => ({ id, text, when });
const left = (c) => c.leftMinRaw > 0;
// "Congratulations, 1% closer" for a 3-minute clip rings hollow. Percent
// messages wait for a tick that moves the ring at least 3%.
const bigGain = (c) => c.gain >= 3;

// ---------- facts: what this tick just did (lesson in today's plan)
export const FACTS = [
  T("f-more", (c) => `Yes, let's go! ${c.leftMin} more and today's done.`, left),
  T("f-only", (c) => `Only ${c.leftMin} left today.`, left),
  T("f-saved", (c) => `You just saved ${c.effort} of your day.`),
  T("f-off", (c) => `${c.effort} off today's list. Gone.`),
  T("f-never", (c) => `That's ${c.effort} you never have to do again.`),
  T("f-closer", (c) => `Congratulations, you're ${c.gain}% closer to today's goal.`, bigGain),
  T("f-ring", (c) => `+${c.gain}% on today's ring. Now at ${c.pct}%.`, bigGain),
  T("f-from-to", (c) => `Today just went from ${c.pctBefore}% to ${c.pct}%.`, bigGain),
  T("f-pct", (c) => `${c.pct}% of today, done.`, (c) => c.pct > 0 && c.pct < 100),
  T("f-count", (c) => `${c.done} down, ${c.left} to go.`, (c) => c.left > 0),
  T("f-already", (c) => `${plural(c.left, "lesson")} left, and ${c.done} already behind you.`, (c) => c.left >= 2),
  T("f-one-left", () => "One lesson left. Finish it.", (c) => c.left === 1),
  T("f-last-up", (c) => `Last one: "${c.next}". Then the day is yours.`, (c) => c.left === 1 && c.next),
  T("f-next", (c) => `Up next: "${c.next}". No decision needed, just start it.`, (c) => c.next && c.left > 1),
  T("f-half", (c) => `Halfway there: ${c.done} of ${c.n}.`, (c) => c.pct >= 50 && c.pctBefore < 50 && c.left > 0),
  T("f-downhill", (c) => `More behind you than ahead: ${c.pct}% done.`, (c) => c.pct > 50 && c.pctBefore >= 50 && c.left > 0),
  T("f-first", () => "First one of the day. Starting was the hard part.", (c) => c.first && c.left > 0),
  T("f-started", (c) => `Day started. ${c.left} to go, and the hardest one is behind you.`, (c) => c.first && c.left > 1),
  T("f-timed", (c) => `Planned about ${c.effort}, took you ${c.actual}. Real time, logged.`, (c) => c.actual),
  T("f-honest", (c) => `${c.actual} of honest, timed work.`, (c) => c.actual),
  T("f-vote", (c) => `Vote #${c.votes} for who you're becoming.`, (c) => c.votes > 0),
  T("f-votes", (c) => `${c.votes} lessons since you started. Every single one counted.`, (c) => c.votes >= 10),
  T("f-chain", (c) => `Chain at ${plural(c.streak, "day")}, and today's link is already safe.`, (c) => c.streak >= 2),
  T("f-deadline", (c) => `${plural(c.daysLeft, "day")} to the deadline, and you just made them lighter.`, (c) => c.daysLeft > 1),
  T("f-am-left", (c) => `Morning block: ${c.blockLeft} left, about ${c.blockLeftMin}.`, (c) => c.block === "morning" && c.blockLeft > 0),
  T("f-pm-left", (c) => `Afternoon block: ${c.blockLeft} to go, ~${c.blockLeftMin}.`, (c) => c.block === "afternoon" && c.blockLeft > 0),
  T("f-sitting", (c) => `Same sitting, keep it rolling: ${c.left} left.`, (c) => !c.weekend && c.left > 0),
  T("f-olympiad", (c) => `That's ${c.effort} closer to the olympiad.`),
  T("f-between", (c) => `${c.leftMin} between you and a finished day.`, left),
  T("f-jar", (c) => `Clip in the jar: ${c.done} of ${c.n}.`),
  T("f-banked", (c) => `Another ${c.effort} banked.`),
  T("f-title", (c) => `"${c.title}" is done. Next.`),
  T("f-forgood", (c) => `"${c.title}": checked off for good.`),
  T("f-real", (c) => `${c.effort} of real work, done. That's not nothing.`),
  T("f-pace", (c) => `Keep this pace and the day wraps up in ${c.leftMin}.`, left),
  T("f-learned", (c) => `You know more than you did ${c.effort} ago.`),
];

// ---------- pushes: the second half of a normal tick
export const PUSHES = [
  T("p-cando", () => "Keep on going, you can do this."),
  T("p-dontstop", () => "Don't stop now."),
  T("p-momentum", () => "Momentum is on your side."),
  T("p-ride", () => "Ride this."),
  T("p-rightnow", () => "Next one, right now."),
  T("p-fire", () => "You're on fire."),
  T("p-chair", () => "Stay in the chair."),
  T("p-brains", () => "This is how olympiad brains get built."),
  T("p-future", () => "Future you says thanks."),
  T("p-habit", () => "Done is a habit. You're building it."),
  T("p-stack", () => "Small wins stack."),
  T("p-gotthis", () => "You've got this."),
  T("p-negotiate", () => "No negotiating. Just the next one."),
  T("p-tired", () => "Tired is fine. Stopping isn't."),
  T("p-proud", () => "Proud of you. Keep moving."),
  T("p-onemore", () => "One more, then decide."),
  T("p-reps", () => "Every rep counts."),
  T("p-quiet", () => "Quiet work, loud results."),
  T("p-finisher", () => "You're becoming someone who finishes."),
  T("p-consistent", () => "Consistency beats intensity."),
  T("p-discipline", () => "This is what discipline feels like."),
  T("p-breathe", () => "Breathe, then go again."),
  T("p-keepstacking", () => "Keep stacking."),
  T("p-boring", () => "Champions do the boring reps."),
  T("p-said", () => "You said you would. You are."),
  T("p-undo", () => "Nothing can undo this one."),
  T("p-locked", () => "Locked in."),
  T("p-gas", () => "Foot on the gas."),
  T("p-standard", () => "That's the standard now."),
  T("p-vote", () => "+1 for future you."),
  T("p-earned", () => "You earned that tick."),
  T("p-again", () => "Do it again."),
];

// ---------- the weekend morning block, just finished
export const AM_DONE = [
  T("a-banked", (c) => `Morning block done! Half the day banked. Afternoon: ${plural(c.pmLeft, "lesson")}, ~${c.pmLeftMin}.`),
  T("a-break", (c) => `Morning block: complete. Take a real break, then ${c.pmLeftMin} more this afternoon.`),
  T("a-half", (c) => `Half the weekend day, done. ${plural(c.pmLeft, "lesson")} this afternoon and you're free.`),
  T("a-eat", (c) => `Morning block finished. Eat, move, then the last ${c.pmLeftMin}.`),
  T("a-next", (c) => `Morning block, crushed. The afternoon starts with "${c.next}".`, (c) => c.next),
  T("a-before", () => "Morning block done before the day even got going. Don't let the break eat the afternoon."),
];

// ---------- a lesson outside today's plan
export const BONUS = [
  T("b-tomorrow", (c) => `Bonus lesson! ${c.effort} off the days ahead.`),
  T("b-extra", (c) => `Extra credit: ${c.effort} the rest of the month doesn't need anymore.`),
  T("b-slack", (c) => `Getting ahead. That's ${c.effort} of slack for a bad day.`),
  T("b-above", (c) => `Above and beyond: ${c.effort} banked for later.`),
  T("b-lighter", () => "Bonus done. The plan re-spreads, so every day after this gets lighter."),
  T("b-ahead", (c) => `Ahead of schedule by another ${c.effort}.`),
];

// ---------- the tick that finishes the day (full plan, no reward set)
export const COMPLETE = [
  T("c-chain", () => "Day complete. Chain unbroken. 🔥"),
  T("c-hundred", (c) => `100%. All ${plural(c.n, "lesson")}, ${c.doneMin} of real work.`, (c) => c.n > 0),
  T("c-streak", (c) => `Done for today! ${c.streak}-day chain and counting.`, (c) => c.streak >= 2),
  T("c-gone", (c) => `Everything on today's list: gone. Vote #${c.votes}.`, (c) => c.votes > 0),
  T("c-free", () => "Today: finished. Enjoy the rest of it, guilt-free."),
  T("c-deadline", (c) => `Full day done. ${plural(c.daysLeft, "day")} to go, and you're on it.`, (c) => c.daysLeft > 1),
  T("c-perfect", () => "That's a perfect day. You earned every minute of it."),
  T("c-identity", () => "Day complete. That's not luck, that's who you are now."),
];

// ---------- the deck

// Shuffled copy (Fisher-Yates). rng returns [0, 1).
function shuffle(ids, rng) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The next message from `pool` that fits context c, or null if none fits.
// store: { get(name) -> saved | undefined, set(name, saved) }.
export function draw(name, pool, c, store, rng = Math.random) {
  const fits = new Set(pool.filter((t) => !t.when || t.when(c)).map((t) => t.id));
  if (!fits.size) return null;
  const saved = store.get(name) || {};
  const known = new Set(pool.map((t) => t.id));
  let deck = (Array.isArray(saved.deck) ? saved.deck : []).filter((id) => known.has(id));
  let id = deck.find((x) => fits.has(x));
  if (!id) {
    // Everything that fits has been shown: start a new round.
    deck = shuffle([...known], rng);
    const options = deck.filter((x) => fits.has(x));
    id = options.find((x) => x !== saved.last) || options[0];
  }
  store.set(name, { deck: deck.filter((x) => x !== id), last: id });
  const t = pool.find((x) => x.id === id);
  return t.text(c);
}

// The toast for one tick.
//   kind "complete": the tick that finished today's full plan
//   kind "tick":     anything else
export function cheer(c, store, { kind = "tick", rng = Math.random } = {}) {
  if (kind === "complete") {
    if (c.bundle) return `Day complete. Reward unlocked: ${c.bundle}`;
    return draw("complete", COMPLETE, c, store, rng);
  }
  if (!c.inPlan) return draw("bonus", BONUS, c, store, rng);
  if (c.amJustDone) return draw("am", AM_DONE, c, store, rng);
  const fact = draw("facts", FACTS, c, store, rng);
  const push = draw("pushes", PUSHES, c, store, rng);
  return [fact, push].filter(Boolean).join(" ");
}

// A store that only lives in memory (tests, or when storage is blocked).
export function memoryStore() {
  const m = new Map();
  return { get: (k) => m.get(k), set: (k, v) => m.set(k, v) };
}
