import { COURSES, allLessons, plannable, TRACK_START, KIND_LABEL, KIND_TIP } from "./data.js";
import * as P from "./planner.js";
import * as H from "./habits.js";
import * as Sync from "./sync.js";
import * as FX from "./feedback.js";
import * as D from "./digest.js";
import { fresh, normalize } from "./state.js";
import { PRINCIPLES, LAW_NAMES, pickPrinciple } from "./principles.js";

// ---------- state

const KEY = "goals.v1";
const LESSONS = allLessons();
const BY_ID = Object.fromEntries(LESSONS.map((l) => [l.id, l]));
const COURSE = Object.fromEntries(COURSES.map((c) => [c.id, c]));

let storageOk = true;
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    storageOk = false;
  }
  return fresh();
}
// touch = a user action. Only those bump updatedAt and sync, so merely
// opening the app on a new device never outranks the synced copy.
function save(touch = true) {
  if (touch) state.updatedAt = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch {
    storageOk = false;
  }
  if (touch) Sync.schedulePush();
}

let state = load();
FX.setEnabled(state.settings.sound);

// Lessons the plan schedules under the current settings.
const planSet = () => plannable(LESSONS, state.settings.includeOptional);

// ?today=YYYY-MM-DD lets you preview any day without touching the clock.
const params = new URLSearchParams(location.search);
const today = () => (/^\d{4}-\d{2}-\d{2}$/.test(params.get("today") || "") ? params.get("today") : P.dayKey());

// ---------- helpers

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const isDone = (l) => !!state.completed[l.id];
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

function fmtMin(m) {
  m = Math.round(m);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${String(r).padStart(2, "0")}m` : `${h}h`;
}
function fmtDate(k, opts = { weekday: "short", month: "short", day: "numeric" }) {
  return P.parseKey(k).toLocaleDateString(undefined, opts);
}
function money(x) {
  const n = Math.round(x * 100) / 100;
  return `${state.settings.currency}${Number.isInteger(n) ? n : n.toFixed(2)}`;
}
const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

function courseChip(c) {
  return `<span class="chip ${c.color}">${esc(c.short)}</span>`;
}
function kindChip(kind) {
  return `<span class="chip k-${kind}">${esc(KIND_LABEL[kind])}</span>`;
}
const lawChip = (n) => `<span class="law-chip">Law ${n}</span>`;

function lessonRow(l, { current = false, showCourse = false, showReason = false } = {}) {
  const c = COURSE[l.course];
  const done = isDone(l);
  const tags = [
    l.kind !== "video" ? kindChip(l.kind) : "",
    l.optional ? `<span class="chip k-optional" title="${esc(l.optional)}">Optional</span>` : "",
    state.notes[l.id] ? `<span class="chip k-note" title="${esc(state.notes[l.id].text)}">🧠 Explained</span>` : "",
  ].join("");
  const measured = state.actual[l.id];
  return `
    <button class="lesson ${done ? "done" : ""} ${current ? "current" : ""} ${l.kind === "pending" ? "pending" : ""} ${l.optional ? "optional" : ""} ${l.id === justDone ? "just" : ""}"
      data-action="toggle" data-id="${l.id}" aria-pressed="${done}"
      aria-label="${done ? "Mark not done" : "Mark done"}: ${esc(l.label)}, ${esc(l.title)}">
      <span class="box">${CHECK_SVG}</span>
      <span>
        <span class="ln">${showCourse ? esc(c.short) + " · " : ""}${esc(l.label)}</span>
        <span class="lt" style="display:block">${esc(l.title)}</span>
        ${tags ? `<span class="tags">${tags}</span>` : ""}
        ${showReason && l.optional ? `<span class="reason">${esc(l.optional)}</span>` : ""}
      </span>
      <span class="lm"><b>${measured ? fmtMin(measured) + " real" : "~" + fmtMin(l.effort)}</b>${l.min} min video</span>
    </button>`;
}

// Progress counts the lessons in the plan (optional ones excluded by default).
function courseProgress(courseId) {
  const ls = planSet().filter((l) => l.course === courseId);
  const done = ls.filter(isDone);
  return {
    total: ls.length,
    done: done.length,
    pct: Math.round((sum(done, (l) => l.effort) / Math.max(1, sum(ls, (l) => l.effort))) * 100),
  };
}

// Everything the views need about "where do I stand", computed once.
// Shared with the email server (js/digest.js) so both always agree.
function facts() {
  return D.dayFacts(state, today());
}

function dayComplete(F) {
  return F.complete;
}

// ---------- shared components

// Paper clip jars (Trent Dyrsmid): one clip per lesson today, moved across as
// you finish them. Visual measurement is the satisfaction.
function clipJars(lessons) {
  const clip = (l) =>
    `<i class="clip ${COURSE[l.course].color} ${l.id === justDone ? "drop" : ""}" title="${esc(l.title)}"></i>`;
  const todo = lessons.filter((l) => !isDone(l));
  const done = lessons.filter(isDone);
  return `<div class="jars" role="img" aria-label="${done.length} of ${lessons.length} paper clips moved">
    <div class="jar"><div class="clips">${todo.map(clip).join("")}</div><span class="jl">to do · ${todo.length}</span></div>
    <div class="jar-arrow" aria-hidden="true">➜</div>
    <div class="jar won ${todo.length === 0 && lessons.length ? "full" : ""}"><div class="clips">${done.map(clip).join("")}</div><span class="jl">done · ${done.length}</span></div>
  </div>`;
}

// The last 14 days as literal chain links.
function chainStrip(F) {
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(P.addDays(F.t, -i));
  const strike = new Set(F.allStrikes);
  const links = days.map((k) => {
    let st = H.dayStatus(k, F.ctx);
    if (st === "missed" && strike.has(k)) st = "missed2";
    const min = st === "done" && state.dayLog[k]?.mode === "min";
    const lbl = { done: min ? "minimum day" : "showed up", missed: "missed", missed2: "missed twice", rest: "rest day", today: "today, not yet", future: "", before: "before tracking", finished: "finished" }[st];
    return `<span class="link ${st} ${min ? "min" : ""} ${k === F.t ? "is-today" : ""}" title="${esc(fmtDate(k) + ": " + lbl)}"></span>`;
  });
  return `<div class="chain" role="img" aria-label="Last 14 days">${links.join("")}</div>`;
}

// ---------- views

let justDone = null; // last lesson ticked this session (drives "lock it in")

function viewToday() {
  const F = facts();
  const { t, s, plan, planLessons, next, mode } = F;
  if (state.history[t] !== plan.targetMin) {
    state.history[t] = plan.targetMin;
    save(false);
  }

  const doneMin = sum(planLessons.filter(isDone), (l) => l.effort);
  const extra = F.doneToday.filter((l) => !plan.ids.includes(l.id));
  const fullPct = plan.targetMin ? Math.min(100, Math.round((doneMin / plan.targetMin) * 100)) : 100;
  const pct = mode === "min" ? (F.shownToday ? 100 : 0) : fullPct;
  const complete = dayComplete(F);
  const finished = plan.lessonsRemaining === 0;

  // ---- banners: the inversion first, it should be the first thing you see
  const banners = [];
  if (F.unpaid.length) {
    const owed = F.unpaid.length * (Number(state.contract.penaltyAmount) || 0);
    const who = F.partner?.name || "your partner";
    banners.push(`<div class="banner breach"><span class="bi">⚖️</span><div>Contract breach: you missed twice (${F.unpaid.map((d) => fmtDate(d)).join(", ")}).
      <b>You owe ${esc(who)} ${money(owed)}${state.contract.publicPenalty ? ` and: ${esc(state.contract.publicPenalty)}` : ""}.</b>
      <small>You signed this. Pay it today, tell ${esc(who)}, then mark it paid. This stays here until you do.</small>
      <div class="btn-row" style="margin-top:10px">
        ${F.partner ? `<button class="btn sm ghost" data-action="report" data-i="${state.contract.partners.indexOf(F.partner)}">Tell ${esc(who)}</button>` : ""}
        <button class="btn sm danger" data-action="pay">I paid it</button>
      </div></div></div>`);
  }
  if (!finished && !F.shownToday && F.missRun === 1) {
    banners.push(`<div class="banner bad"><span class="bi">⚠️</span><div>You missed yesterday. Never miss twice.
      <small>Missing once is an accident. Missing twice is the start of a new habit${state.contract.signedAt ? ", and a contract breach" : ""}. Do the minimum right now: ${esc(s.minimum)}</small>
      ${mode !== "min" ? `<div class="btn-row" style="margin-top:10px"><button class="btn sm ghost" data-action="mode" data-mode="min">Switch to a minimum day</button></div>` : ""}</div></div>`);
  } else if (!finished && !F.shownToday && F.missRun >= 2) {
    banners.push(`<div class="banner bad"><span class="bi">🧯</span><div>${F.missRun} scheduled days missed in a row.
      <small>The old habit is forming. Break it today, not tomorrow: one lesson is enough. ${state.contract.signedAt ? "" : "Then sign a habit contract so the next miss costs something."}</small>
      <div class="btn-row" style="margin-top:10px">${mode !== "min" ? `<button class="btn sm ghost" data-action="mode" data-mode="min">Do the minimum</button>` : ""}${state.contract.signedAt ? "" : `<a class="btn sm ghost" href="#system/contract">Write a contract</a>`}</div></div></div>`);
  } else if (!finished && !F.shownToday && F.streak > 0 && new Date().getHours() >= 17 && !H.isRestDay(t, s)) {
    const hoursLeft = 24 - new Date().getHours();
    banners.push(`<div class="banner warn"><span class="bi">⏳</span><div>Your ${plural(F.streak, "day")} chain breaks at midnight. About ${plural(hoursLeft, "hour")} left.
      <small>You don't lose a streak by doing too little. You lose it by doing nothing. Finish the Up Next lesson.</small></div></div>`);
  }
  if (!finished && !plan.onTrack) {
    const when = plan.finishAtCapacity ? fmtDate(plan.finishAtCapacity) : "never at this rate";
    banners.push(`<div class="banner warn"><span class="bi">⏱️</span><div>At ${fmtMin(s.weekdayMin)} on weekdays and ${fmtMin(s.weekendMin)} on weekends you finish <b>${when}</b>, after the deadline.
      <small>Be honest in Settings. Either raise your daily minutes or accept the slip. Wishful numbers just push the problem to Oct 30.</small></div></div>`);
  }

  // ---- hero
  let headline;
  let sub;
  if (finished) {
    headline = "Both courses complete.";
    sub = "Every planned lesson is done. Now the real olympiad work starts: see the roadmap on the System tab.";
  } else if (complete && mode === "min") {
    headline = F.streak > 1 ? "Minimum done. Chain intact." : "Minimum done. You showed up.";
    sub = "A bad day where you still showed up is worth more than a good day you skipped. Keep going if you have more in you.";
  } else if (complete) {
    headline = "Day complete. Chain unbroken.";
    sub = "That was a vote for who you're becoming. Close the day below, then bank extra lessons if you want.";
  } else if (mode === "min") {
    headline = "Bad day mode: one lesson.";
    sub = `${s.minimum} That alone keeps you who you are. The rest re-plans itself.`;
  } else if (pct === 0) {
    headline = `Today: ${plural(planLessons.length, "lesson")}, about ${fmtMin(plan.targetMin)}.`;
    sub = "Don't think about all of them. Start the first one.";
  } else {
    const left = planLessons.filter((l) => !isDone(l)).length;
    headline = `${left} to go. You're in motion.`;
    sub = `${fmtMin(doneMin)} done, about ${fmtMin(plan.targetMin - doneMin)} left today.`;
  }

  const jarLessons = mode === "min" ? (F.doneToday.length ? F.doneToday : next ? [next] : []) : planLessons;
  const hero = `
    <section class="card hero-card ${complete ? "is-complete" : ""}">
      <div class="hero">
        <div class="ring ${complete ? "complete" : ""}" data-pct="${pct}">
          <svg viewBox="0 0 128 128" aria-hidden="true">
            <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset=".5" stop-color="#6366f1"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
            <circle class="track" cx="64" cy="64" r="54" fill="none" stroke-width="12"/>
            <circle class="bar" cx="64" cy="64" r="54" fill="none" stroke-width="12" stroke-linecap="round"
              stroke-dasharray="339.29" stroke-dashoffset="${339.29 * (1 - lastRingPct / 100)}"/>
          </svg>
          <div class="ring-label"><div><div class="ring-pct">${pct}%</div><div class="ring-sub">${mode === "min" ? "minimum" : "of today"}</div></div></div>
        </div>
        <div class="hero-text">
          <h1>${headline}</h1>
          <p>${sub}</p>
        </div>
      </div>
      ${jarLessons.length ? clipJars(jarLessons) : ""}
      ${
        finished
          ? ""
          : `<div class="seg" role="group" aria-label="Today's mode">
        <button data-action="mode" data-mode="full" aria-pressed="${mode === "full"}">Full plan</button>
        <button data-action="mode" data-mode="min" aria-pressed="${mode === "min"}">🌧️ Bad day: minimum</button>
      </div>`
      }
    </section>`;

  // ---- up next, with an automatic timer
  let nextCard = "";
  if (next) {
    const c = COURSE[next.course];
    const ses = state.session && state.session.id === next.id ? state.session : null;
    const timerBtn = !ses
      ? `<button class="btn sm ghost" data-action="timer" data-op="start" data-id="${next.id}">▶ Start timer</button>`
      : ses.running
        ? `<button class="btn sm ghost" data-action="timer" data-op="pause">⏸ Pause</button>`
        : `<button class="btn sm ghost" data-action="timer" data-op="resume">▶ Resume</button>`;
    nextCard = `
      <section class="card next" aria-label="Up next">
        <div class="eyebrow">Up next · do exactly this</div>
        <div class="title">${esc(next.title)}</div>
        <div class="meta">${courseChip(c)}<span>${esc(next.label)}</span>${kindChip(next.kind)}</div>
        <div class="meta" style="margin-top:6px"><span>${esc(next.section)}</span></div>
        <div class="meta" style="margin-top:6px"><span>▶ ${next.min} min video</span><span>⏱ about ${fmtMin(next.effort)} real work</span></div>
        <p class="tip">${esc(KIND_TIP[next.kind])}</p>
        <div class="timer-row">${timerBtn}<span class="timer ${ses?.running ? "on" : ""}" data-timer>${ses ? clock(elapsed(ses)) : "0:00"}</span>
          <span class="small faint">${ses ? "Real time is logged automatically when you tick it." : "Optional. Measures your real pace, no typing."}</span></div>
        <button class="btn primary block" data-action="toggle" data-id="${next.id}">${CHECK_SVG.replace('stroke="#fff"', 'stroke="#fff" width="18" height="18"')} Done, next lesson</button>
      </section>`;
  }

  // ---- lock it in: measure learning, not ticks
  let lockCard = "";
  const jd = justDone && BY_ID[justDone];
  if (jd && isDone(jd) && !state.notes[jd.id] && !lockSkipped.has(jd.id)) {
    lockCard = `<section class="card lock-in">
      <h2>Lock it in <span class="right">10 seconds</span></h2>
      <p class="small" style="margin:0 0 10px">In one sentence, what was the core idea of <b>${esc(jd.title)}</b>? If you can't say it, you watched it. You didn't learn it.</p>
      <div class="inline-form"><input id="noteText" maxlength="240" placeholder="The core idea is…" autocomplete="off" />
        <button class="btn sm primary" data-action="note" data-id="${jd.id}">Save</button>
        <button class="btn sm ghost" data-action="note-skip" data-id="${jd.id}">Skip</button></div>
    </section>`;
  }

  const ritualCard = !complete && pct === 0 && s.ritual.length ? ritualSection("Before you start: your ritual") : "";

  const groups = [...new Set(planLessons.map((l) => l.course))]
    .map((cid) => {
      const c = COURSE[cid];
      const ls = planLessons.filter((l) => l.course === cid);
      return `<div class="group-label">${courseChip(c)} <span>${esc(c.instructor)}</span></div>
        ${ls.map((l) => lessonRow(l, { current: next && l.id === next.id })).join("")}`;
    })
    .join("");

  const list = planLessons.length
    ? `<section class="card ${mode === "min" ? "dimmed" : ""}"><h2>Today's checklist <span class="right">${planLessons.filter(isDone).length}/${planLessons.length} · ${fmtMin(plan.targetMin)}</span></h2>
        ${mode === "min" ? `<p class="small muted" style="margin:0 0 10px">Bad-day mode: only one lesson counts today. Everything else here rolls into the coming days automatically. No guilt, no debt: just don't make it two bad days.</p>` : ""}
        <div class="lessons">${groups}</div>
        <p class="small faint" style="margin:12px 0 0">Math first while your brain is fresh, then code. Exercises marked <b>Solve first</b> count only if you attempt them before the answer.</p>
      </section>`
    : "";

  const ahead = P.aheadLessons({ lessons: planSet(), completed: state.completed, planIds: plan.ids });
  const aheadCard =
    complete && ahead.length
      ? `<section class="card"><h2>Get ahead <span class="right">lightens tomorrow</span></h2>
          <div class="lessons">${ahead.map((l) => lessonRow(l, { showCourse: true })).join("")}</div></section>`
      : "";
  const extraCard = extra.length
    ? `<section class="card"><h2>Bonus done today <span class="right">${extra.length} extra</span></h2>
        <div class="lessons">${extra.map((l) => lessonRow(l, { showCourse: true })).join("")}</div></section>`
    : "";

  const stats = `
    <section class="card">
      <h2>Don't break the chain <a class="right" href="#tracker">Tracker →</a></h2>
      ${chainStrip(F)}
      <div class="stats" style="margin-top:14px">
        <div class="stat"><div class="num"><span class="flame">🔥</span> ${F.streak}</div><div class="lbl">day streak · best ${F.best}</div></div>
        <div class="stat"><div class="num">${F.perfect}</div><div class="lbl">perfect days</div></div>
        <div class="stat"><div class="num">${F.votes}</div><div class="lbl">identity votes</div></div>
      </div>
    </section>`;

  // On-demand push: emails a motivation built from right now.
  const boostCard = finished
    ? ""
    : `<section class="card boost-card">
      <div><b>Need a push?</b><div class="small muted">${Sync.status.email ? "Emails you a push built from exactly where you stand right now: the next lesson, what's left, and a fresh Atomic Habits idea." : `Sign in under <a href="#settings">Settings</a> and this emails you a push built from where you stand right now.`}</div></div>
      <button class="btn sm primary" data-action="boost" ${Sync.status.email ? "" : "disabled"}>⚡ Send me motivation</button>
    </section>`;

  return `<div class="view">${banners.join("")}${hero}${lockCard}${nextCard}${boostCard}${ritualCard}${list}${rewardCard(F, complete)}${closeDayCard(F)}${aheadCard}${extraCard}${stats}</div>`;
}

// Immediate reinforcement, and its handover to identity.
function rewardCard(F, complete) {
  const s = state.settings;
  const ph = F.phase;
  const unlocked = complete && F.mode === "full";
  const conflict = H.rewardConflict(s.bundle);
  const warn =
    s.bundle && (conflict || s.bundleAligned === "no")
      ? `<p class="note" style="margin:10px 0 0">⚠ "${esc(conflict || s.bundle)}" pulls against <i>${esc(s.identity)}</i> Rewards that contradict the identity create conflicting identities. <a href="#settings/rewards">Pick an aligned one.</a></p>`
      : "";
  const lock = s.bundle
    ? `<div class="reward ${unlocked ? "unlocked" : "locked"}">
        <div class="lock">${unlocked ? "🔓" : "🔒"}</div>
        <div><div class="small muted">${unlocked ? "Unlocked. Take it now, while it still means something:" : F.mode === "min" ? "Locked on minimum days. The full reward is for the full plan:" : "Unlocks the moment today hits 100%:"}</div><div class="rt">${esc(s.bundle)}</div></div>
      </div>`
    : `<div class="reward locked"><div class="lock">🎁</div><div><div class="rt">Set an immediate reward</div>
        <div class="small muted">The payoff for studying ML is months away. Your brain needs something tonight. <a href="#settings/rewards">Pick one that fits your identity.</a></div></div></div>`;
  const trend = H.intrinsicTrend(state.checkins);
  const ups = H.METRICS.filter((m) => trend[m.key].delta > 0.2).map((m) => `${m.label.toLowerCase()} +${trend[m.key].delta.toFixed(1)}`);
  return `<section class="card">
    <h2>Immediate reward ${lawChip(4)}</h2>
    ${lock}${warn}
    <div class="phase">
      <div class="phase-top"><span><b>${ph.title}</b> phase</span><span>${ph.next ? `${F.shownUpDays}/${ph.next} days to ${ph.key === "spark" ? "Bridge" : "Identity"}` : "identity is the reinforcer"}</span></div>
      <div class="track"><div class="fill-grad" style="width:${Math.round(ph.pct * 100)}%"></div></div>
      <p class="small muted" style="margin:8px 0 0">${esc(ph.text)}${ups.length ? ` Your check-ins already show it: <b>${ups.join(", ")}</b>.` : ""}</p>
    </div>
  </section>`;
}

// Habit stacking + habit tracking, check-in, non-scale victory, avoidance jar.
function closeDayCard(F) {
  const { t, s } = F;
  const log = state.dayLog[t] || {};
  const ci = state.checkins[t] || {};
  const rows = H.METRICS.map(
    (m) => `<div class="ci-row"><span class="ci-l">${m.label}</span><div class="ci-btns" role="group" aria-label="${m.label}">${[1, 2, 3, 4, 5]
      .map((v) => `<button data-action="checkin" data-k="${m.key}" data-v="${v}" aria-pressed="${ci[m.key] === v}" title="${v === 1 ? m.low : v === 5 ? m.high : v}">${v}</button>`)
      .join("")}</div></div>`
  ).join("");
  const todays = state.avoidLog[t] || {};
  const avoid = s.avoid
    .map((a) => {
      const e = todays[a.id];
      return `<div class="avoid ${e?.s || ""}"><span class="an">${esc(a.name)}${a.amount ? ` <b>${money(a.amount)}</b>` : ""}</span>
        <div class="ab"><button class="btn sm ${e?.s === "avoided" ? "good" : "ghost"}" data-action="avoid" data-id="${a.id}" data-s="avoided">✓ Avoided${a.amount ? ` +${money(a.amount)}` : ""}</button>
        <button class="btn sm ${e?.s === "slipped" ? "danger" : "ghost"}" data-action="avoid" data-id="${a.id}" data-s="slipped">Slipped</button></div></div>`;
    })
    .join("");
  const sv = F.savings;
  const moveRow =
    sv.pending > 0
      ? `<div class="banner good" style="margin-top:10px"><span class="bi">🫙</span><div>Move ${money(sv.pending)} into your "${esc(s.jarLabel)}" account now.
          <small>A number in an app is a promise. Money in a labeled account is a reward. Transfer it, then tap below.</small>
          <div class="btn-row" style="margin-top:8px"><button class="btn sm good" data-action="moved">I moved ${money(sv.pending)}</button></div></div></div>`
      : "";
  const partnerBtns = state.contract.partners
    .map((p, i) => (p.name.trim() ? `<button class="btn sm ghost" data-action="report" data-i="${i}">📣 Check in with ${esc(p.name)}</button>` : ""))
    .join("");
  return `<section class="card close-day ${log.closed ? "closed" : ""}" id="close">
    <h2>Close the day ${lawChip(4)}</h2>
    <p class="intention stack">After <em>${esc(s.stackAfter)}</em>, I will <em>${esc(s.stackTrack)}</em>.</p>
    <p class="small faint" style="margin:4px 0 14px">Tracking stacked on a habit you already have. Lessons, minutes and the chain log themselves; this takes 20 seconds.</p>
    <div class="sub-h">How do you feel? <span class="faint">non-scale victories</span></div>
    ${rows}
    <div class="field" style="margin-top:12px"><label for="nsv">One win today that no number shows</label>
      <input id="nsv" data-field="nsv" maxlength="140" placeholder="e.g. Finally get why the gradient points uphill" value="${esc(log.nsv || "")}"/></div>
    ${
      s.avoid.length
        ? `<div class="sub-h" style="margin-top:16px">Make avoidance visible <span class="faint">→ ${esc(s.jarLabel)}</span></div><div class="avoids">${avoid}</div>${moveRow}`
        : ""
    }
    <div class="btn-row" style="margin-top:16px">
      <button class="btn ${log.closed ? "ghost" : "primary"}" data-action="close-day">${log.closed ? "✓ Day closed · update" : "Close the day"}</button>
      ${partnerBtns}
    </div>
  </section>`;
}

function ritualSection(title) {
  const t = today();
  if (state.ritual.date !== t) state.ritual = { date: t, checks: [] };
  const items = state.settings.ritual
    .map((r, i) => {
      const on = state.ritual.checks.includes(i);
      return `<label class="${on ? "on" : ""}"><input type="checkbox" data-action="ritual" data-i="${i}" ${on ? "checked" : ""}/> ${esc(r)}</label>`;
    })
    .join("");
  return `<section class="card"><h2>${esc(title)} ${lawChip(2)}</h2><div class="ritual">${items}</div></section>`;
}

function paceCard(plan) {
  const s = state.settings;
  const bars = COURSES.map((c) => {
    const p = courseProgress(c.id);
    return `<div class="pbar"><div class="pbar-top"><span>${esc(c.short)}</span><span>${p.done}/${p.total} lessons · ${p.pct}%</span></div>
      <div class="track"><div class="fill-${c.color}" style="width:${p.pct}%"></div></div></div>`;
  }).join("");
  const notLoaded = COURSES.flatMap((c) => (c.notLoaded || []).map((x) => `${c.short}: ${x}`));
  const finish = plan.finishAtCapacity ? fmtDate(plan.finishAtCapacity) : "Not in sight";
  return `
    <section class="card">
      <h2>Pace to ${fmtDate(s.deadline, { month: "short", day: "numeric" })} <span class="right">${plan.daysLeft > 0 ? plan.daysLeft + " days incl. today" : "deadline passed"}</span></h2>
      <div class="pace">
        <div class="box2"><div class="big">${fmtMin(plan.requiredAvg)}</div><div class="lbl">needed per day (finish ${fmtDate(plan.planEnd, { month: "short", day: "numeric" })})</div></div>
        <div class="box2"><div class="big">${fmtMin(plan.capacityToday)}</div><div class="lbl">your capacity today</div></div>
        <div class="box2"><div class="big" style="color:${plan.onTrack ? "var(--good)" : "var(--bad)"}">${finish}</div><div class="lbl">finish at your capacity</div></div>
        <div class="box2"><div class="big">${fmtMin(plan.totalRemaining)}</div><div class="lbl">real work left (estimated)</div></div>
      </div>
      ${bars}
      ${
        notLoaded.length
          ? `<p class="note" style="margin:14px 0 0">⚠ Not loaded yet, so not in this math: ${notLoaded.map(esc).join("; ")}. The real daily load is higher than shown.</p>`
          : ""
      }
    </section>`;
}

function heatmapCard(F) {
  const s = state.settings;
  const start = TRACK_START;
  const end = s.deadline > start ? s.deadline : start;
  const lead = (P.parseKey(start).getDay() + 6) % 7; // Monday first
  const strike = new Set(F.allStrikes);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(`<div class="cell blank"></div>`);
  for (let k = start; k <= end; k = P.addDays(k, 1)) {
    const d = F.byDay[k];
    const target = state.history[k];
    const st = H.dayStatus(k, F.ctx);
    let cls = "";
    if (d) {
      const r = target ? d.min / target : 1;
      cls = r >= 1 ? "l4" : r >= 0.66 ? "l3" : r >= 0.33 ? "l2" : "l1";
      if (state.dayLog[k]?.mode === "min") cls += " min";
    } else if (st === "missed") cls = strike.has(k) ? "miss miss2" : "miss";
    else if (st === "rest") cls = "rest";
    if (k === F.t) cls += " today";
    if (k === s.deadline) cls += " deadline";
    const what = d ? `${plural(d.count, "lesson")}, ${fmtMin(d.min)}${state.dayLog[k]?.mode === "min" ? " (minimum day)" : ""}` : st === "missed" ? (strike.has(k) ? "missed twice" : "missed") : st === "rest" ? "rest day" : "upcoming";
    const label = `${fmtDate(k)}: ${what}`;
    cells.push(`<div class="cell ${cls}" title="${esc(label)}" aria-label="${esc(label)}">${P.parseKey(k).getDate()}</div>`);
  }
  const dows = ["M", "T", "W", "T", "F", "S", "S"].map((d) => `<div class="dow">${d}</div>`).join("");
  return `
    <section class="card">
      <h2>The chain <span class="right">honest record, not memory</span></h2>
      <div class="heat">${dows}${cells.join("")}</div>
      <div class="legend"><span><i class="lg miss"></i> missed</span><span><i class="lg miss2"></i> missed twice</span><span><i class="lg min"></i> minimum</span><span><i class="lg l4"></i> 100%</span></div>
    </section>`;
}

// ---------- tracker tab: visual proof of progress

function viewTracker() {
  const F = facts();
  const s = state.settings;
  const comebacks = H.comebacks(F.ctx);
  const sv = F.savings;
  const jarPct = s.jarTarget > 0 ? Math.min(100, Math.round((sv.saved / s.jarTarget) * 100)) : 0;

  const top = `<section class="stats six">
    <div class="card stat"><div class="num"><span class="flame">🔥</span> ${F.streak}</div><div class="lbl">current chain</div></div>
    <div class="card stat"><div class="num">${F.best}</div><div class="lbl">best chain</div></div>
    <div class="card stat"><div class="num">${F.shownUpDays}</div><div class="lbl">days showed up</div></div>
    <div class="card stat"><div class="num">${F.perfect}</div><div class="lbl">perfect days</div></div>
    <div class="card stat"><div class="num">${comebacks}</div><div class="lbl">comebacks</div></div>
    <div class="card stat"><div class="num">${F.votes}</div><div class="lbl">identity votes</div></div>
  </section>`;

  const why = `<section class="card">
    <h2>Why track ${lawChip(4)}</h2>
    <div class="three">
      <div><b>Obvious.</b><span>The chain is a cue. And it keeps you honest: memory says "I studied most days", the record says what happened.</span></div>
      <div><b>Attractive.</b><span>Progress is the best motivation. A ${F.streak}-day chain is something you won't want to lose.</span></div>
      <div><b>Satisfying.</b><span>Every tick and clip is a small win right now, so your attention stays on the process, not the far-off outcome.</span></div>
    </div>
  </section>`;

  const jar = `<section class="card" id="jar">
    <h2>${esc(s.jarLabel)} jar ${lawChip(4)}</h2>
    <div class="money-jar">
      <div class="mj" role="img" aria-label="${jarPct}% of ${money(s.jarTarget)}"><div class="mj-fill" style="height:${jarPct}%"></div><div class="mj-label">${money(sv.saved)}</div></div>
      <div>
        <p style="margin:0 0 6px"><b>${money(sv.saved)}</b> saved of ${money(s.jarTarget)} by not doing things.</p>
        <p class="small muted" style="margin:0 0 6px">${sv.avoidedCount} avoided · ${sv.slipCount} slipped${sv.slipped ? ` (cost you ${money(sv.slipped)})` : ""} · ${money(sv.transferred)} actually moved</p>
        ${sv.pending > 0 ? `<button class="btn sm good" data-action="moved">I moved ${money(sv.pending)} into the account</button>` : `<p class="small faint" style="margin:0">Avoiding something gives you nothing to feel. Moving the money does. Log it in Close the day on Today.</p>`}
      </div>
    </div>
  </section>`;

  const trend = H.intrinsicTrend(state.checkins);
  const nsvs = Object.entries(state.dayLog)
    .filter(([, v]) => v?.nsv)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 8);
  const metricRows = H.METRICS.map((m) => {
    const tr = trend[m.key];
    const bars = tr.series.slice(-21).map((v) => `<i style="height:${v * 20}%" title="${v}/5"></i>`).join("");
    const d = tr.delta;
    return `<div class="metric"><div class="m-top"><b>${m.label}</b><span class="${d > 0.2 ? "up" : d < -0.2 ? "down" : ""}">${d === null ? `${tr.n}/4 check-ins` : `${d > 0 ? "+" : ""}${d.toFixed(1)} since the start`}</span></div>
      <div class="spark">${bars || `<span class="faint small">No check-ins yet</span>`}</div></div>`;
  }).join("");
  const nsv = `<section class="card">
    <h2>Non-scale victories <span class="right">when numbers stall</span></h2>
    <p class="small muted" style="margin:0 0 12px">Lessons per day will plateau. Energy, focus and calm, and the moments something clicked, are the internal rewards that take over from external ones.</p>
    <div class="metrics">${metricRows}</div>
    ${nsvs.length ? `<ul class="nsv-list">${nsvs.map(([k, v]) => `<li><span class="faint">${fmtDate(k, { month: "short", day: "numeric" })}</span> ${esc(v.nsv)}</li>`).join("")}</ul>` : ""}
  </section>`;

  const cal = H.calibration(state.actual, BY_ID);
  const noteCount = Object.keys(state.notes).filter((id) => BY_ID[id]).length;
  const recallPct = F.votes ? Math.round((noteCount / F.votes) * 100) : 0;
  const notes = Object.entries(state.notes)
    .filter(([id]) => BY_ID[id])
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 6);
  const right = `<section class="card">
    <h2>Measure the right thing</h2>
    <div class="pace">
      <div class="box2"><div class="big">${recallPct}%</div><div class="lbl">of finished lessons you can explain (${noteCount}/${F.votes})</div></div>
      <div class="box2"><div class="big">${cal.ratio ? cal.ratio.toFixed(2) + "×" : "—"}</div><div class="lbl">${cal.ratio ? `your real time vs the estimate (${cal.samples} timed)` : `time ${3 - cal.samples} more lessons to calibrate`}</div></div>
    </div>
    ${
      cal.ratio && cal.ratio > 1.15
        ? `<p class="note" style="margin:10px 0 0">You take ${Math.round((cal.ratio - 1) * 100)}% longer than planned. Today's list is really about ${fmtMin(F.plan.targetMin * cal.ratio)}. Raise your capacity or expect the plan to feel heavy.</p>`
        : ""
    }
    <p class="small muted" style="margin:12px 0 0">Ticks are a proxy. The goal is understanding you can use in an olympiad round with no solution video. If the recall number is low, the tick count is lying to you.</p>
    ${notes.length ? `<ul class="nsv-list">${notes.map(([id, n]) => `<li><span class="faint">${esc(BY_ID[id].label)}</span> ${esc(n.text)}</li>`).join("")}</ul>` : ""}
  </section>`;

  const ms = H.MILESTONES.map((m) => {
    const at = state.milestones[m.key];
    return `<div class="badge ${at ? "earned" : ""}" title="${esc(m.desc)}"><div class="bi">${m.icon}</div><div class="bt">${esc(m.title)}</div><div class="bd">${at ? fmtDate(at, { month: "short", day: "numeric" }) : esc(m.desc)}</div></div>`;
  }).join("");
  const badges = `<section class="card"><h2>Milestones <span class="right">${Object.keys(state.milestones).length}/${H.MILESTONES.length}</span></h2><div class="badges">${ms}</div></section>`;

  return `<div class="view">${top}${heatmapCard(F)}${why}${paceCard(F.plan)}${jar}${nsv}${right}${badges}</div>`;
}

// ---------- courses

// Sections you expanded or collapsed by hand stay that way across re-renders.
const sectionOpen = {};
document.addEventListener(
  "toggle",
  (e) => {
    if (e.target.matches?.("details.section")) sectionOpen[e.target.dataset.key] = e.target.open;
  },
  true
);

function viewCourses() {
  const nextIds = new Set(COURSES.map((c) => planSet().find((l) => l.course === c.id && !isDone(l))?.id));
  const cards = COURSES.map((c) => {
    const p = courseProgress(c.id);
    const sections = c.sections
      .map((sec, si) => {
        const ls = LESSONS.filter((l) => l.course === c.id && l.sectionIndex === si);
        const d = ls.filter(isDone).length;
        const key = `${c.id}-${si}`;
        const open = key in sectionOpen ? sectionOpen[key] : ls.some((l) => nextIds.has(l.id));
        const sp = Math.round((d / ls.length) * 100);
        return `<details class="section ${sec.optional ? "optional" : ""}" data-key="${key}" ${open ? "open" : ""}>
          <summary><span class="st">${esc(sec.title)}${sec.optional ? ` <span class="chip k-optional">Optional</span>` : ""}</span><span class="sc">${d}/${ls.length} ${d === ls.length ? "✓" : ""}</span>
            <span class="strack"><div class="fill-${c.color}" style="width:${sp}%"></div></span></summary>
          ${sec.note ? `<div class="note" style="margin-bottom:8px">${esc(sec.note)}</div>` : ""}
          ${sec.optional ? `<div class="reason" style="margin:0 0 8px">Optional, not in your plan: ${esc(sec.optional)}</div>` : ""}
          <div class="lessons">${ls
            .map((l, i) => lessonRow(l, { current: nextIds.has(l.id), showReason: !sec.optional && l.optional !== ls[i - 1]?.optional }))
            .join("")}</div>
        </details>`;
      })
      .join("");
    const nl = (c.notLoaded || []).length
      ? `<p class="note" style="margin:12px 0 0">Not loaded yet: ${c.notLoaded.map(esc).join(", ")}</p>`
      : "";
    return `<section class="card">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div><div style="font-family:var(--display);font-weight:700;font-size:19px;line-height:1.2">${esc(c.title)}</div>
        <div class="small muted">${esc(c.instructor)} · ${esc(c.platform)}</div></div>${courseChip(c)}</div>
      <div class="pbar"><div class="pbar-top"><span>${p.pct}% of planned work</span><span>${p.done}/${p.total} planned lessons</span></div>
        <div class="track"><div class="fill-${c.color}" style="width:${p.pct}%"></div></div></div>
      <div style="margin-top:8px">${sections}</div>${nl}
    </section>`;
  }).join("");
  return `<div class="view">
    <div class="banner good"><span class="bi">💡</span><div>Tick anything here, in any order. Today's plan re-balances tomorrow around whatever is left.</div></div>
    ${cards}</div>`;
}

// ---------- system tab: the why, and the inversion

// Sources: IOAI 2026 official syllabus (ioai-official.org) and usaaio.org.
const ROUND1 = "2027-02-19";
const REG_CLOSE = "2027-01-31";
const COVERED = [
  "NumPy, Pandas, Matplotlib, Seaborn, scikit-learn",
  "Linear and logistic regression, KNN, decision trees, random forests, SVM",
  "K-means, PCA",
  "Metrics, confusion matrix, ROC, cross validation, over/underfitting",
  "Perceptron, activation and loss functions, gradient descent, backprop",
  "Calculus and probability behind all of it (Krohn)",
];
const GAPS = [
  "PyTorch. The syllabus lists PyTorch basics and tensor manipulation; Portilla teaches TensorFlow/Keras",
  "CNNs and computer vision (convolutions, pooling, ResNet, augmentation)",
  "Attention, transformers, embeddings, BERT-style pre-trained models",
  "L1/L2 regularization, gradient boosting, t-SNE, UMAP, DBSCAN",
  "Training craft: Adam, batch norm, weight init, fine-tuning",
];

function olympiadCard() {
  const t = today();
  const toRound1 = P.diffDays(t, ROUND1);
  const toReg = P.diffDays(t, REG_CLOSE);
  return `<section class="card">
    <h2>Olympiad roadmap <span class="right">USAAIO 2027</span></h2>
    <div class="pace">
      <div class="box2"><div class="big">${toReg > 0 ? toReg : 0} days</div><div class="lbl">until registration closes (${fmtDate(REG_CLOSE, { month: "short", day: "numeric", year: "numeric" })})</div></div>
      <div class="box2"><div class="big">${toRound1 > 0 ? toRound1 : 0} days</div><div class="lbl">until Round 1 (${fmtDate(ROUND1, { month: "short", day: "numeric", year: "numeric" })})</div></div>
    </div>
    <p class="small" style="margin:14px 0 6px"><b>These two courses cover</b> (checked against the official IOAI 2026 syllabus):</p>
    <ul class="ticks good">${COVERED.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <p class="small" style="margin:12px 0 6px"><b>They do not cover</b> (this is your Nov to Feb work):</p>
    <ul class="ticks bad">${GAPS.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <p class="small muted" style="margin:12px 0 0">So Oct 31 is the end of the foundation, not the end of prep. Lessons off the syllabus (Plotly, maps, recommender systems, Spark, the finance project, Tensorboard) are marked optional and left out of your plan.</p>
  </section>`;
}

// Interactive: why a payoff 4 months away loses to tonight's Netflix.
const COST = 35;
const BOOST = 30;
function discountBars(days) {
  const pay = H.perceivedValue(100, days);
  const verdict =
    pay >= COST
      ? "Easy call: the payoff still feels bigger than tonight's cost."
      : pay + BOOST >= COST
        ? "The future payoff alone loses. The immediate reward tips it back. That is the whole reason it exists."
        : "Even with a reward it's close. Make the habit smaller and easier too (Law 3), and lean on the chain.";
  return { pay, verdict };
}
function discountCard() {
  const days = Math.max(0, P.diffDays(today(), ROUND1));
  const { pay, verdict } = discountBars(days);
  const w = (v) => `${Math.max(2, Math.min(100, v))}%`;
  return `<section class="card" id="brain">
    <h2>Why your brain skips study</h2>
    <div class="env">
      <div><b>Immediate-return</b><span>The environment your brain evolved for. Act now, eat today.</span></div>
      <div><b>Delayed-return</b><span>Yours. Study tonight, maybe a medal in ${Math.round(days / 30)} months.</span></div>
    </div>
    <p class="small muted" style="margin:12px 0 10px">Time inconsistency: the brain values a reward less the further away it is. Drag to see how big the olympiad payoff <i>feels</i> tonight.</p>
    <label class="small" for="delay"><b>Payoff arrives in <span id="dDays">${days}</span> days</b></label>
    <input type="range" id="delay" min="0" max="365" value="${days}" />
    <div class="dbars">
      <div class="drow"><span>Tonight's cost (2+ hours of hard focus)</span><div class="dtrack"><div class="dfill cost" style="width:${w(COST)}"></div></div></div>
      <div class="drow"><span>Olympiad payoff, as it feels tonight</span><div class="dtrack"><div class="dfill pay" id="dPay" style="width:${w(pay)}"></div></div></div>
      <div class="drow"><span>Payoff + an immediate reward tonight</span><div class="dtrack"><div class="dfill pay" id="dPay2" style="width:${w(pay)}"></div><div class="dfill boost" style="width:${w(BOOST)}"></div></div></div>
    </div>
    <p class="verdict" id="dVerdict">${verdict}</p>
    <div class="outcomes">
      <div></div><div class="oh">Immediate outcome</div><div class="oh">Ultimate outcome</div>
      <div class="oh">Bad habit<br/><span class="faint">scrolling instead</span></div><div class="ok">Feels good</div><div class="ko">Feels bad</div>
      <div class="oh">Good habit<br/><span class="faint">tonight's lessons</span></div><div class="ko">Costs effort</div><div class="ok">Olympiad-ready</div>
    </div>
    <p class="small muted" style="margin:12px 0 0">Bridge the gap: attach a little immediate pleasure to the end of every session. That's the chime, the clip jar, the reward lock and the money jar.</p>
  </section>`;
}

function contractDoc(c) {
  const partners = c.partners.filter((p) => p.name.trim());
  const signed = fmtDate(P.dayKey(new Date(c.signedAt)), { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return `<article class="contract-doc">
    <div class="cd-title">Habit Contract</div>
    <p>I, <b>${esc(c.signer)}</b>, commit to the following goal:</p>
    <p class="cd-goal">${esc(c.goal)}</p>
    <p>To get there, I will:</p>
    <ol>${c.habits.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>
    <p><b>Breach.</b> Missing two scheduled days in a row is a breach. Each further missed day is another one. Rest days don't count.</p>
    <p><b>Penalty.</b> For every breach I will ${esc(c.penaltyAction)}: <b>${money(Number(c.penaltyAmount) || 0)}</b>${c.publicPenalty ? `, and ${esc(c.publicPenalty)}` : ""}. The penalty is owed the morning after the breach. The app records it automatically and I can't dismiss it until it's paid.</p>
    <p><b>Accountability.</b> ${partners.length ? partners.map((p) => esc(p.name)).join(" and ") : "My partner"} will receive my check-ins and hold me to every word above.</p>
    <div class="sigs">
      <div class="sig"><div class="sig-name">${esc(c.signer)}</div><div class="sig-line">Signed ${esc(signed)}</div></div>
      ${partners
        .map((p) => {
          const i = c.partners.indexOf(p);
          return `<div class="sig"><div class="sig-name">${c.partnerSigs[i] ? esc(c.partnerSigs[i]) : "&nbsp;"}</div><div class="sig-line">${esc(p.name)}, accountability partner${c.partnerSigs[i] ? "" : " (awaiting signature)"}</div></div>`;
        })
        .join("")}
    </div>
  </article>`;
}

function contractCard(F) {
  const c = state.contract;
  if (c.signedAt) {
    const missingSig = c.partners.map((p, i) => (p.name.trim() && !c.partnerSigs[i] ? i : -1)).filter((i) => i >= 0);
    const ledger = F.strikeDays.length
      ? `<div class="ledger"><div class="sub-h">Penalty ledger</div>${F.strikeDays
          .map((d) => `<div class="lrow ${state.penaltyPaid[d] ? "paid" : ""}"><span>${fmtDate(d)} · missed twice</span><span>${money(Number(c.penaltyAmount) || 0)} ${state.penaltyPaid[d] ? "✓ paid" : "owed"}</span></div>`)
          .join("")}</div>`
      : `<p class="small good-text" style="margin:12px 0 0">✓ No breaches since signing. Keep it that way.</p>`;
    return `<section class="card" id="contract">
      <h2>Your habit contract <span class="right">in force</span></h2>
      ${contractDoc(c)}
      ${missingSig
        .map(
          (i) => `<div class="inline-form" style="margin-top:12px"><input id="psig${i}" placeholder="${esc(c.partners[i].name)} types their name to sign" autocomplete="off"/>
          <button class="btn sm ghost" data-action="partner-sign" data-i="${i}">Partner signs</button></div>`
        )
        .join("")}
      ${ledger}
      <div class="btn-row" style="margin-top:14px">
        <button class="btn sm ghost" data-action="share-contract">Share</button>
        <button class="btn sm ghost" data-action="print-contract">Print</button>
        <button class="btn sm danger" data-action="void-contract">Void contract</button>
      </div>
    </section>`;
  }
  const voided = state.contractLog.filter((x) => x.voidedAt).slice(-1)[0];
  return `<section class="card" id="contract">
    <h2>Write a habit contract <span class="right">not signed</span></h2>
    <p class="small muted" style="margin:0 0 12px">A written commitment with a partner and a penalty. It turns "I'll do it tomorrow" into something that costs you money and face today.${voided ? ` <b>You voided your last one on ${fmtDate(P.dayKey(new Date(voided.voidedAt)))}.</b>` : ""}</p>
    <div class="field"><label for="c-goal">I commit to</label><input id="c-goal" data-contract="goal" value="${esc(c.goal)}"/></div>
    <div class="field"><label for="c-habits">Specific daily habits (one per line)</label><textarea id="c-habits" data-contract="habits">${esc(c.habits.join("\n"))}</textarea></div>
    <div class="grid2">
      <div class="field"><label for="c-amt">Penalty per breach (${esc(state.settings.currency)})</label><input id="c-amt" type="number" min="0" max="10000" step="1" data-contract="penaltyAmount" value="${esc(c.penaltyAmount)}"/></div>
      <div class="field"><label for="c-act">Which means I will</label><input id="c-act" data-contract="penaltyAction" value="${esc(c.penaltyAction)}"/></div>
    </div>
    <div class="field"><label for="c-pub">Public cost (optional)</label><input id="c-pub" data-contract="publicPenalty" placeholder="e.g. post in the study group chat that I quit" value="${esc(c.publicPenalty)}"/>
      <span class="hint">Reputation is a strong lever. People hate looking unreliable to people they respect.</span></div>
    <div class="sub-h" style="margin-top:16px">Accountability partners</div>
    ${c.partners
      .map(
        (p, i) => `<div class="grid2">
      <div class="field"><label for="p${i}n">Partner ${i + 1} name${i ? " (optional)" : ""}</label><input id="p${i}n" data-contract="partners.${i}.name" value="${esc(p.name)}" placeholder="${i ? "" : "Someone who will actually ask"}"/></div>
      <div class="field"><label for="p${i}c">Phone or email</label><input id="p${i}c" data-contract="partners.${i}.contact" value="${esc(p.contact)}" placeholder="for one-tap check-ins"/></div>
    </div>`
      )
      .join("")}
    <div class="grid2">
      <div class="field"><label for="c-signer">Your full name</label><input id="c-signer" data-contract="signer" value="${esc(c.signer)}" autocomplete="name"/></div>
      <div class="field"><label for="c-psig">Partner 1 signs (type name)</label><input id="c-psig" data-contract="partnerSigs.0" value="${esc(c.partnerSigs[0])}" placeholder="optional now, can sign later"/></div>
    </div>
    <label class="toggle"><input type="checkbox" id="c-mean"/><span><b>I mean it.</b><br/><span class="small muted">Breaches are enforced the morning after they happen. Voiding the contract is logged.</span></span></label>
    <button class="btn primary block" data-action="sign-contract">✍️ Sign the contract</button>
  </section>`;
}

function accountabilityCard(F) {
  const ps = state.contract.partners.map((p, i) => ({ ...p, i })).filter((p) => p.name.trim());
  return `<section class="card">
    <h2>Accountability partner <span class="right">social cost</span></h2>
    <p class="small muted" style="margin:0 0 12px">Knowing someone is watching makes skipping immediately costly. Send a check-in every evening, especially on the bad days.</p>
    ${
      ps.length
        ? ps
            .map(
              (p) => `<div class="partner"><div><b>${esc(p.name)}</b><div class="small faint">${esc(p.contact || "no contact saved")}</div></div>
            <button class="btn sm ghost" data-action="report" data-i="${p.i}">📣 Send today's check-in</button></div>`
            )
            .join("")
        : `<p class="small" style="margin:0">No partner yet. Add one in the contract ${F.signedDay ? "" : "below"}.</p>`
    }
  </section>`;
}

// Today's idea is the same one the morning email leads with.
function principleCard(F) {
  const pr = pickPrinciple(F, "morning", P.diffDays(TRACK_START, F.t));
  const groups = Object.entries(LAW_NAMES)
    .map(([law, name]) => {
      const items = PRINCIPLES.filter((x) => String(x.law) === law);
      return `<div class="sub-h" style="margin-top:12px">${esc(name)}</div>
        <ul class="toolkit">${items.map((x) => `<li><b>${esc(x.title)}.</b> ${esc(x.idea)}</li>`).join("")}</ul>`;
    })
    .join("");
  return `<section class="card" id="book">
    <h2>Today's idea <span class="right">${esc(LAW_NAMES[pr.law])}</span></h2>
    <p style="margin:0 0 6px"><b>${esc(pr.title)}.</b> ${esc(pr.idea)}</p>
    <p class="intention" style="margin:10px 0 0">Today: <em>${esc(pr.action(F))}</em></p>
    <details style="margin-top:14px"><summary class="small"><b>The whole book as a system</b> · ${PRINCIPLES.length} ideas, one a day in your emails</summary>${groups}</details>
  </section>`;
}

function viewSystem() {
  const F = facts();
  const s = state.settings;
  return `<div class="view">
    <section class="card">
      <blockquote>What is immediately rewarded is repeated. What is immediately punished is avoided.<cite>The Cardinal Rule of Behavior Change, Atomic Habits</cite></blockquote>
      <div class="loop" aria-label="The habit loop">
        <div class="ln1"><b>Cue</b><span>Law 1 · Obvious</span></div>
        <div class="ln1"><b>Craving</b><span>Law 2 · Attractive</span></div>
        <div class="ln1"><b>Response</b><span>Law 3 · Easy</span></div>
        <div class="ln1 star"><b>Reward</b><span>Law 4 · Satisfying</span></div>
      </div>
      <p class="small muted" style="margin:12px 0 0">Laws 1 to 3 make you do it <b>this</b> time. Law 4 makes you do it <b>next</b> time: it closes the loop. Positive emotion tells your brain "repeat this"; negative emotion kills a habit. So doing the work always feels good here, and only skipping it hurts.</p>
    </section>

    ${principleCard(F)}

    ${discountCard()}

    <section class="card">
      <h2>Identity <span class="right">${F.votes} votes so far</span></h2>
      <p class="intention">"<em>${esc(s.identity)}</em>"</p>
      <p class="small muted" style="margin:8px 0 0">Incentives start a habit. Identity sustains it. Every lesson is a vote for this person. You're in the <b>${F.phase.title}</b> phase: ${esc(F.phase.text)}</p>
    </section>

    <section class="card law star">
      <div class="num">4</div><div>
      <h3>Make It Satisfying</h3>
      <ul class="toolkit">
        <li><b>Immediate reinforcement.</b> Each tick plays a chime that climbs in pitch, drops a paper clip into the done jar and casts a vote. <a href="#today">Today</a></li>
        <li><b>Rewards that match who you're becoming.</b> One reward per day, locked until 100%, checked against your identity. <a href="#settings/rewards">Settings</a></li>
        <li><b>Make avoidance visible.</b> Each thing you avoid moves real money into a labeled account. <a href="#tracker">Jar</a></li>
        <li><b>Habit tracker.</b> A chain you can see, an honest heatmap, milestones. <a href="#tracker">Tracker</a></li>
        <li><b>Stack the tracking.</b> "After ${esc(s.stackAfter)}, I will ${esc(s.stackTrack)}." <a href="#today">Close the day</a></li>
        <li><b>Automate it.</b> Minutes, streaks and real time from the timer all log themselves. You only tick.</li>
        <li><b>Never miss twice.</b> One miss gets a warning. Two is a breach.</li>
        <li><b>Show up on bad days.</b> Bad-day mode shrinks today to one lesson that still counts.</li>
        <li><b>Measure the right thing.</b> "Lock it in" asks for the core idea, and non-scale victories track what numbers miss.</li>
      </ul>
    </div></section>

    <section class="card inversion">
      <h2>Inversion: make skipping unsatisfying</h2>
      <p class="small" style="margin:0 0 10px">To break a bad habit (skipping), make it <b>immediately</b> costly. Punishment changes behavior when it's:</p>
      <div class="three">
        <div><b>Immediate</b><span>The penalty shows the morning after a breach, not "someday".</span></div>
        <div><b>Local</b><span>It's on your Today screen, above everything else.</span></div>
        <div><b>Reliable</b><span>Computed from the record. You can't argue with it or dismiss it.</span></div>
      </div>
    </section>
    ${contractCard(F)}
    ${accountabilityCard(F)}

    <section class="card law">
      <div class="num">1</div><div>
      <h3>Make It Obvious</h3>
      <p class="intention">I will study ML at <em>${esc(s.when)}</em> at <em>${esc(s.where)}</em>.</p>
      <p>Implementation intention: a set time and place beats waiting for motivation. The Up Next card is your cue, so you never decide what to do, you just do the next thing.</p>
    </div></section>

    <section class="card law">
      <div class="num">2</div><div>
      <h3>Make It Attractive</h3>
      <p><b>Temptation bundling.</b> Your reward: <b>${s.bundle ? esc(s.bundle) : "not set yet"}</b>. It stays locked on Today until you hit 100%.</p>
      <p><b>Motivation ritual.</b> The same short routine before every session, so starting feels automatic.</p>
      <p><b>Join a culture</b> where studying ML is normal: a study group, a Discord, a friend prepping too. Make one of them your accountability partner.</p>
    </div></section>
    ${ritualSection("Your motivation ritual")}

    <section class="card law">
      <div class="num">3</div><div>
      <h3>Make It Easy</h3>
      <p><b>Two-minute rule.</b> On a bad day the goal is not the list. ${esc(s.minimum)}</p>
      <p><b>Prime the environment.</b> Leave the notebook open and the course tab pinned so the first step takes zero effort.</p>
    </div></section>

    ${olympiadCard()}

    <section class="card">
      <h2>Ruthless reminders</h2>
      <p class="small" style="margin:0 0 8px">✗ Finishing videos is not the same as learning. If you can't redo an exercise from a blank page a week later, you watched it, you didn't learn it.</p>
      <p class="small" style="margin:0 0 8px">✗ A streak is a means, not the goal. Don't tick a lesson to save the chain if you didn't do it. A fake chain trains you to lie to yourself.</p>
      <p class="small" style="margin:0 0 8px">✗ Olympiad problems don't come with a solution video. Every <b>Solve first</b> lesson is practice for that.</p>
      <p class="small" style="margin:0">✓ Before ticking a lesson, say its core idea out loud in one sentence. If you can't, it isn't done.</p>
    </section>
  </div>`;
}

// ---------- settings

function viewSettings() {
  const s = state.settings;
  const conflict = H.rewardConflict(s.bundle);
  return `<div class="view">
    <section class="card">
      <h2>Honest capacity <span class="right">drives the plan</span></h2>
      <div class="grid2">
        <div class="field"><label for="weekdayMin">Minutes on school days</label><input id="weekdayMin" data-setting="weekdayMin" type="number" min="0" max="900" step="5" value="${s.weekdayMin}"/></div>
        <div class="field"><label for="weekendMin">Minutes on weekends</label><input id="weekendMin" data-setting="weekendMin" type="number" min="0" max="900" step="5" value="${s.weekendMin}"/><span class="hint">0 makes weekends rest days: they don't break the chain.</span></div>
        <div class="field"><label for="deadline">Deadline</label><input id="deadline" data-setting="deadline" type="date" value="${s.deadline}"/></div>
        <div class="field"><label for="bufferDays">Buffer days</label><input id="bufferDays" data-setting="bufferDays" type="number" min="0" max="10" value="${s.bufferDays}"/><span class="hint">Plan to finish this many days early.</span></div>
      </div>
      <label class="toggle"><input type="checkbox" data-setting="includeOptional" ${s.includeOptional ? "checked" : ""}/>
        <span><b>Include optional lessons in my plan</b><br/><span class="small muted">Off by default: they're off the olympiad syllabus. AWS setup is never planned.</span></span></label>
      <p class="small faint" style="margin:12px 0 0">Real work per lesson is estimated: video × 1.5 for code-along, at least 20 min for exercises, 75 min for projects. Time a few lessons and the Tracker tells you how far off that is.</p>
    </section>

    <section class="card">
      <h2>Your system</h2>
      <div class="grid2">
        <div class="field"><label for="when">I will study at</label><input id="when" data-setting="when" value="${esc(s.when)}"/></div>
        <div class="field"><label for="where">Location</label><input id="where" data-setting="where" value="${esc(s.where)}"/></div>
      </div>
      <div class="field" style="margin-top:12px"><label for="identity">Identity statement</label><input id="identity" data-setting="identity" value="${esc(s.identity)}"/></div>
      <div class="sub-h" style="margin-top:16px">Habit stacking + tracking</div>
      <div class="grid2">
        <div class="field"><label for="stackAfter">After [current habit]</label><input id="stackAfter" data-setting="stackAfter" value="${esc(s.stackAfter)}"/></div>
        <div class="field"><label for="stackTrack">I will [track my habit]</label><input id="stackTrack" data-setting="stackTrack" value="${esc(s.stackTrack)}"/></div>
      </div>
      <div class="field" style="margin-top:12px"><label for="minimum">Bad-day minimum</label><input id="minimum" data-setting="minimum" value="${esc(s.minimum)}"/><span class="hint">The scaled-down version you do when the day falls apart. Make it small enough that you have no excuse.</span></div>
      <div class="field" style="margin-top:12px"><label for="ritual">Motivation ritual (one step per line)</label><textarea id="ritual" data-setting="ritual">${esc(s.ritual.join("\n"))}</textarea></div>
    </section>

    <section class="card" id="rewards">
      <h2>Immediate reward ${lawChip(4)}</h2>
      <div class="field"><label for="bundle">My reward when today hits 100%</label><input id="bundle" data-setting="bundle" placeholder="Something you actually want" value="${esc(s.bundle)}"/></div>
      <div class="suggest">${H.ALIGNED_REWARDS.map((r) => `<button class="chip-btn" data-action="suggest-reward" data-text="${esc(r)}">${esc(r)}</button>`).join("")}</div>
      <div class="sub-h" style="margin-top:14px">Does it reinforce "${esc(s.identity)}"?</div>
      <div class="seg" role="group" aria-label="Reward alignment">
        <button data-action="align" data-v="yes" aria-pressed="${s.bundleAligned === "yes"}">Yes, it fits</button>
        <button data-action="align" data-v="no" aria-pressed="${s.bundleAligned === "no"}">No, it fights it</button>
      </div>
      ${
        conflict || s.bundleAligned === "no"
          ? `<p class="note" style="margin:10px 0 0">⚠ ${conflict ? `"${esc(conflict)}" usually works against a focus and health identity.` : "You said it fights your identity."} A massage after a workout reinforces health; ice cream after one makes you two people. Pick a reward the future you would also choose.</p>`
          : ""
      }
      <label class="toggle"><input type="checkbox" data-setting="sound" ${s.sound ? "checked" : ""}/><span><b>Sound and haptics</b><br/><span class="small muted">A chime that climbs with every lesson, a fanfare at 100%. Instant, physical feedback.</span></span></label>
    </section>

    <section class="card" id="avoid">
      <h2>Make avoidance visible ${lawChip(4)}</h2>
      <p class="small muted" style="margin:0 0 12px">Not doing something feels like nothing. Give each avoided habit a price, and move that money into a labeled account when you avoid it.</p>
      <div class="field"><label for="avoidList">Things to avoid (one per line, "name = amount")</label><textarea id="avoidList" data-setting="avoid">${esc(H.formatAvoid(s.avoid))}</textarea></div>
      <div class="grid2">
        <div class="field"><label for="jarLabel">Account label</label><input id="jarLabel" data-setting="jarLabel" value="${esc(s.jarLabel)}" placeholder="e.g. Trip to Europe"/></div>
        <div class="field"><label for="jarTarget">Target</label><input id="jarTarget" data-setting="jarTarget" type="number" min="0" max="100000" value="${s.jarTarget}"/></div>
        <div class="field"><label for="currency">Currency symbol</label><input id="currency" data-setting="currency" maxlength="3" value="${esc(s.currency)}"/></div>
      </div>
    </section>

    ${syncCard()}

    <section class="card">
      <h2>Backup</h2>
      <p class="small muted" style="margin:0 0 12px">Progress is always saved in this browser first. ${storageOk ? "" : "<b style='color:var(--bad)'>Storage is blocked here (private mode?), so progress will not survive a reload.</b>"} A backup file is your safety net either way.</p>
      <div class="btn-row">
        <button class="btn ghost" data-action="export">Export backup</button>
        <label class="btn ghost" for="importFile" style="cursor:pointer">Import backup</label>
        <input id="importFile" type="file" accept="application/json" hidden />
        <button class="btn danger" data-action="reset">Reset everything</button>
      </div>
    </section>
  </div>`;
}

let pendingEmail = "";
let lastSyncEmail = null;
function syncCard() {
  const st = Sync.status;
  let body;
  if (!st.enabled) {
    body = `<p class="small muted" style="margin:0">Cloud sync is not connected yet. Until it is, progress lives only in this browser.</p>`;
  } else if (!st.ready && !st.error) {
    body = `<p class="small muted" style="margin:0">Connecting…</p>`;
  } else if (!st.email && pendingEmail) {
    body = `<p class="small" style="margin:0 0 12px">We emailed a 6-digit code to <b>${esc(pendingEmail)}</b>. It can take a minute; check spam once.</p>
      <div class="field"><label for="syncCode">Code</label><input id="syncCode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456"/></div>
      <button class="btn primary block" data-action="verify-code">Sign in</button>
      <div class="btn-row" style="margin-top:10px"><button class="btn sm ghost" data-action="signin" data-resend="1">Send a new code</button><button class="btn sm ghost" data-action="signin-cancel">Use a different email</button></div>`;
  } else if (!st.email) {
    body = `<p class="small muted" style="margin:0 0 12px">Sign in with your email to keep your phone and laptop in sync and to turn on your daily emails (they're built from your synced progress). You'll get a 6-digit code, no password.</p>
      <div class="field"><label for="syncEmail">Email</label><input id="syncEmail" type="email" autocomplete="email" placeholder="you@gmail.com"/></div>
      <button class="btn primary block" data-action="signin">Email me a code</button>`;
  } else {
    const when = st.lastSync ? st.lastSync.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "not yet";
    body = `<p class="small" style="margin:0 0 12px"><span class="dot ${st.error ? "bad" : "good"}"></span> Synced as <b>${esc(st.email)}</b> · last sync ${when}</p>
      <p class="small muted" style="margin:0 0 12px">📬 Daily emails go to this address: a morning plan, a check-in the moment you hit halfway, and an evening wrap. They only know what has synced, so tick lessons while signed in.</p>
      <div class="btn-row"><button class="btn ghost" data-action="syncnow">Sync now</button><button class="btn ghost" data-action="signout">Sign out</button></div>`;
  }
  return `<section class="card"><h2>Sync across devices <span class="right">${st.enabled ? "Supabase" : "off"}</span></h2>
    ${st.error ? `<div class="banner bad" style="margin-bottom:12px"><span class="bi">⚠️</span><div>${esc(st.error)}</div></div>` : ""}${body}</section>`;
}

// ---------- render loop

const VIEWS = { today: viewToday, tracker: viewTracker, courses: viewCourses, system: viewSystem, settings: viewSettings };
let lastRingPct = 0;
let renderedDay = today();

// "#system/contract" = tab "system", scroll to "#contract".
function route() {
  const [tab, anchor] = location.hash.slice(1).split("/");
  return { tab: VIEWS[tab] ? tab : "today", anchor };
}
const currentTab = () => route().tab;

function render() {
  const t = today();
  renderedDay = t;
  const s = state.settings;
  const dayN = P.diffDays(TRACK_START, t) + 1;
  const totalDays = P.diffDays(TRACK_START, s.deadline) + 1;
  $("#today-label").textContent =
    fmtDate(t) + (dayN >= 1 && dayN <= totalDays ? ` · Day ${dayN} of ${totalDays}` : "");
  const left = P.diffDays(t, s.deadline) + 1;
  $("#countdown").innerHTML = left > 0 ? `<b>${left}</b> ${left === 1 ? "day" : "days"} left` : "Deadline passed";
  const active = H.activeSet(state.completed);
  const st = P.streak(active, t, (k) => H.isRestDay(k, s));
  const pill = $("#streak");
  pill.innerHTML = `🔥 <b>${st}</b>`;
  pill.title = `${st}-day chain`;
  pill.classList.toggle("lit", active.has(t));

  const tab = currentTab();
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  $("#app").innerHTML = VIEWS[tab]();

  const ring = document.querySelector(".ring");
  if (ring) {
    const pct = Number(ring.dataset.pct);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        ring.querySelector(".bar").style.strokeDashoffset = String(339.29 * (1 - pct / 100));
      })
    );
    lastRingPct = pct;
  }
}

// ---------- the timer: automated measurement

const elapsed = (ses) => (ses.acc || 0) + (ses.running ? Date.now() - ses.start : 0);
function clock(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
setInterval(() => {
  const ses = state.session;
  if (!ses?.running) return;
  document.querySelectorAll("[data-timer]").forEach((el) => (el.textContent = clock(elapsed(ses))));
}, 1000);

function timer(op, id) {
  const ses = state.session;
  if (op === "start") state.session = { id, start: Date.now(), acc: 0, running: true };
  else if (op === "pause" && ses?.running) state.session = { ...ses, acc: elapsed(ses), running: false };
  else if (op === "resume" && ses && !ses.running) state.session = { ...ses, start: Date.now(), running: true };
  save(false);
  render();
}

// ---------- actions

const CHEERS = [
  "Vote cast. +1 for future you.",
  "Locked in. Next.",
  "One more clip in the jar.",
  "That's how olympiad brains get built.",
  "Momentum. Don't stop now.",
  "Done is a habit. You're building it.",
];
const lockSkipped = new Set();

function toggle(id, el) {
  const t = today();
  const wasDone = !!state.completed[id];
  const before = dayComplete(facts());
  let timerWasRunning = false;
  let speed = false;
  if (wasDone) {
    delete state.completed[id];
    delete state.tickAt[id];
    if (justDone === id) justDone = null;
  } else {
    const now = Date.now();
    const prevTick = Math.max(0, ...Object.values(state.tickAt).filter(Number.isFinite));
    speed = H.looksLikeSpeedTick(BY_ID[id], prevTick, now);
    state.completed[id] = t;
    state.tickAt[id] = now;
    const ses = state.session;
    if (ses && ses.id === id) {
      const ms = elapsed(ses);
      if (ms >= 60000) state.actual[id] = Math.round(ms / 60000);
      timerWasRunning = ses.running;
      state.session = null;
    }
    justDone = id;
  }
  save();

  if (!wasDone) {
    const F = facts();
    // Keep the clock running straight into the next lesson: no decision needed.
    if (timerWasRunning && F.next) state.session = { id: F.next.id, start: Date.now(), acc: 0, running: true };
    FX.chime(F.doneToday.length - 1);
    const r = el?.getBoundingClientRect();
    if (r) burst(r.left + r.width / 2, r.top + r.height / 2, 28);
    const after = dayComplete(F);
    const prior = state.celebrated[t] === true ? "full" : state.celebrated[t];
    if (after && !before && prior !== "full" && !(F.mode === "min" && prior === "min")) {
      state.celebrated[t] = F.mode;
      setTimeout(() => {
        bigCelebration(F.mode === "min" ? 0.5 : 1);
        FX.fanfare();
      }, 150);
      toast(
        F.mode === "min"
          ? "Minimum done on a bad day. You showed up. That's the identity."
          : state.settings.bundle
            ? `Day complete. Reward unlocked: ${state.settings.bundle}`
            : "Day complete. Chain unbroken. 🔥"
      );
    } else if (speed) {
      toast("That was fast. A tick isn't learning. Can you say its core idea?");
    } else {
      toast(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
    }
    save();
    checkMilestones();
  } else {
    toast("Unchecked.");
  }
  render();
}

function checkMilestones(silent = false) {
  const F = facts();
  const c = {
    votes: F.votes, best: F.best, perfect: F.perfect, comebacks: H.comebacks(F.ctx), minDays: F.minDays,
    notes: Object.keys(state.notes).length, saved: F.savings.saved, signed: !!state.contract.signedAt, finished: F.remaining === 0,
  };
  const newly = H.earnedMilestones(c).filter((k) => !state.milestones[k]);
  if (!newly.length) return;
  for (const k of newly) state.milestones[k] = F.t;
  save(!silent);
  if (silent) return;
  for (const k of newly) {
    const m = H.MILESTONES.find((x) => x.key === k);
    toast(`${m.icon} Milestone: ${m.title}. ${m.desc}`, { tone: "gold", after: () => (FX.sparkle(), burst(innerWidth / 2, 80, 50, 1.2)) });
  }
}

async function shareText(title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return true;
    } catch (e) {
      if (e?.name === "AbortError") return false;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied. Paste it to them.");
    return true;
  } catch {
    prompt("Copy this:", text);
    return true;
  }
}

function report(i) {
  const F = facts();
  const p = state.contract.partners[i];
  if (!p?.name) return;
  const owed = F.unpaid.length * (Number(state.contract.penaltyAmount) || 0);
  const text = H.reportText({
    dateLabel: fmtDate(F.t),
    status: F.shownToday ? (F.mode === "min" ? "min" : "done") : "none",
    lessons: F.doneToday.length,
    minutes: Math.round(sum(F.doneToday, (l) => state.actual[l.id] || l.effort)),
    streak: F.streak,
    daysLeft: P.diffDays(F.t, state.settings.deadline) + 1,
    owed,
    partner: p.name,
    money,
    nsv: state.dayLog[F.t]?.nsv || "",
  });
  const link = H.contactLink(p.contact, text);
  if (link) location.href = link;
  else shareText("Goals check-in", text);
}

function setDayLog(patch) {
  const t = today();
  state.dayLog[t] = { ...(state.dayLog[t] || {}), ...patch };
}

document.addEventListener("click", (e) => {
  const tabBtn = e.target.closest("[data-tab]");
  if (tabBtn) {
    location.hash = tabBtn.dataset.tab;
    return;
  }
  const a = e.target.closest("[data-action]");
  if (!a || a.matches("input")) return;
  const act = a.dataset.action;
  const t = today();
  if (act === "toggle") toggle(a.dataset.id, a);
  else if (act === "mode") {
    setDayLog({ mode: a.dataset.mode });
    save();
    toast(a.dataset.mode === "min" ? `Bad day accepted. ${state.settings.minimum}` : "Full plan. Let's go.");
    render();
  } else if (act === "timer") timer(a.dataset.op, a.dataset.id);
  else if (act === "note") {
    const text = ($("#noteText")?.value || "").trim();
    if (text.length < 8) return toast("One real sentence. That's the whole point.");
    state.notes[a.dataset.id] = { text, at: Date.now() };
    save();
    FX.sparkle();
    toast("Locked in. That's learning, not watching.");
    justDone = null;
    checkMilestones();
    render();
  } else if (act === "note-skip") {
    lockSkipped.add(a.dataset.id);
    render();
  } else if (act === "checkin") {
    state.checkins[t] = { ...(state.checkins[t] || {}), [a.dataset.k]: Number(a.dataset.v) };
    save();
    render();
  } else if (act === "avoid") {
    const item = state.settings.avoid.find((x) => x.id === a.dataset.id);
    if (!item) return;
    const day = { ...(state.avoidLog[t] || {}) };
    const same = day[item.id]?.s === a.dataset.s;
    if (same) delete day[item.id];
    else day[item.id] = { s: a.dataset.s, amt: item.amount };
    state.avoidLog[t] = day;
    save();
    if (!same && a.dataset.s === "avoided") {
      FX.sparkle();
      toast(item.amount ? `+${money(item.amount)} toward ${state.settings.jarLabel}. Now move it for real.` : "Avoided. That's a vote too.");
    } else if (!same) {
      FX.thud();
      toast(item.amount ? `Slipped. That cost ${state.settings.jarLabel} ${money(item.amount)}. Tomorrow, not twice.` : "Logged honestly. Tomorrow, not twice.");
    }
    checkMilestones();
    render();
  } else if (act === "moved") {
    const { pending } = facts().savings;
    if (pending > 0 && confirm(`Did you actually move ${money(pending)} into "${state.settings.jarLabel}"? Only say yes if the money moved.`)) {
      state.transferred += pending;
      save();
      FX.sparkle();
      burst(innerWidth / 2, innerHeight / 2, 60, 1.2);
      toast(`${money(pending)} banked for ${state.settings.jarLabel}. Avoidance made visible.`);
      render();
    }
  } else if (act === "close-day") {
    const F = facts();
    setDayLog({ closed: true });
    save();
    FX.sparkle();
    toast(F.shownToday ? `Day closed. ${plural(F.doneToday.length, "lesson")}, chain at ${F.streak}.` : "Day closed with nothing done. Tomorrow you show up, no matter what. Never miss twice.");
    checkMilestones();
    render();
  } else if (act === "report") report(Number(a.dataset.i));
  else if (act === "pay") {
    const F = facts();
    const who = F.partner?.name || "your partner";
    if (confirm(`Did ${who} actually receive the penalty? Marking it paid when it isn't makes the contract worthless.`)) {
      for (const d of F.unpaid) state.penaltyPaid[d] = Date.now();
      save();
      toast("Paid. Debt cleared. Now don't miss twice again.");
      render();
    }
  } else if (act === "sign-contract") signContract();
  else if (act === "partner-sign") {
    const i = Number(a.dataset.i);
    const v = ($(`#psig${i}`)?.value || "").trim();
    if (v.length < 2) return toast("Your partner types their name to sign.");
    state.contract.partnerSigs[i] = v;
    save();
    FX.sparkle();
    toast(`Witnessed by ${v}.`);
    render();
  } else if (act === "void-contract") {
    const who = facts().partner?.name || "your partner";
    if (confirm(`Void your contract? It will be logged, and you should tell ${who} yourself.`)) {
      state.contractLog.push({ signedAt: state.contract.signedAt, voidedAt: Date.now() });
      state.contract.signedAt = null;
      state.contract.partnerSigs = ["", ""];
      save();
      FX.thud();
      toast(`Voided. Tell ${who}. That's the deal.`);
      render();
    }
  } else if (act === "share-contract") {
    const c = state.contract;
    const text = `Habit contract, signed by ${c.signer}\n\nGoal: ${c.goal}\n\n${c.habits.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n\nBreach: missing two scheduled days in a row. Penalty per breach: ${money(Number(c.penaltyAmount) || 0)}, ${c.penaltyAction}${c.publicPenalty ? `, and ${c.publicPenalty}` : ""}.`;
    shareText("Habit contract", text);
  } else if (act === "print-contract") window.print();
  else if (act === "suggest-reward") {
    state.settings.bundle = a.dataset.text;
    state.settings.bundleAligned = "yes";
    save();
    toast("Reward set. It unlocks at 100%.");
    render();
  } else if (act === "align") {
    state.settings.bundleAligned = a.dataset.v;
    save();
    render();
  } else if (act === "export") exportData();
  else if (act === "signin") {
    const email = a.dataset.resend ? pendingEmail : ($("#syncEmail")?.value || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Enter a valid email.");
    a.disabled = true;
    Sync.signIn(email).then(({ error, via }) => {
      a.disabled = false;
      if (error) return toast(`Couldn't send: ${error}`);
      pendingEmail = email;
      toast(via === "gmail" ? "Code sent. Check your email." : "Check your email for a code or a login link.");
      render();
      $("#syncCode")?.focus();
    });
  } else if (act === "verify-code") {
    const code = ($("#syncCode")?.value || "").replace(/\D/g, "");
    if (code.length < 6) return toast("Enter the 6-digit code from the email.");
    a.disabled = true;
    Sync.verifyCode(pendingEmail, code).then(({ error }) => {
      a.disabled = false;
      if (error) return toast(error);
      pendingEmail = "";
      toast("Signed in. Syncing now.");
      render();
    });
  } else if (act === "signin-cancel") {
    pendingEmail = "";
    render();
  } else if (act === "boost") {
    a.disabled = true;
    a.textContent = "Sending…";
    Sync.boost().then((r) => {
      a.disabled = false;
      a.textContent = "⚡ Send me motivation";
      if (r?.error) return toast(r.error);
      FX.sparkle();
      toast(`📬 Sent to ${r.recipients > 1 ? `${r.recipients} inboxes` : "your inbox"}. Now open the lesson. Don't wait for the email.`);
    });
  } else if (act === "signout") Sync.signOut().then(() => toast("Signed out. Progress stays on this device."));
  else if (act === "syncnow") Sync.reconcile().then(() => toast(Sync.status.error || "Synced."));
  else if (act === "reset") {
    if (confirm("Erase all progress, streaks, contract and settings on this device? Export a backup first if unsure.")) {
      state = fresh();
      save();
      toast("Reset.");
      render();
    }
  }
});

function signContract() {
  const c = state.contract;
  const problems = [];
  if (c.signer.trim().length < 2) problems.push("type your full name");
  if (!c.partners.some((p) => p.name.trim())) problems.push("name at least one partner");
  if (!(Number(c.penaltyAmount) > 0) && !c.publicPenalty.trim()) problems.push("set a penalty that actually hurts");
  if (!c.habits.length) problems.push("list your daily habits");
  if (!$("#c-mean")?.checked) problems.push('tick "I mean it"');
  if (problems.length) return toast(`To sign: ${problems.join(", ")}.`);
  c.signedAt = Date.now();
  save();
  FX.fanfare();
  bigCelebration(0.7);
  toast("Signed. From tomorrow, missing twice costs you.");
  checkMilestones();
  render();
}

// Enter in the "lock it in" box saves it.
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "noteText") $('[data-action="note"]')?.click();
  if (e.key === "Enter" && e.target.id === "syncCode") $('[data-action="verify-code"]')?.click();
  if (e.key === "Enter" && e.target.id === "syncEmail") $('[data-action="signin"]')?.click();
});

// The discounting slider updates in place, no re-render.
document.addEventListener("input", (e) => {
  if (e.target.id !== "delay") return;
  const d = Number(e.target.value);
  const { pay, verdict } = discountBars(d);
  const w = `${Math.max(2, Math.min(100, pay))}%`;
  $("#dDays").textContent = d;
  $("#dPay").style.width = w;
  $("#dPay2").style.width = w;
  $("#dVerdict").textContent = verdict;
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.action === "ritual") {
    const i = Number(el.dataset.i);
    const set = new Set(state.ritual.checks);
    el.checked ? set.add(i) : set.delete(i);
    state.ritual = { date: today(), checks: [...set] };
    save();
    if (el.checked && set.size === state.settings.ritual.length) toast("Ritual done. Now press play.");
    render();
    return;
  }
  if (el.id === "importFile" && el.files?.[0]) {
    importData(el.files[0]);
    return;
  }
  if (el.dataset.field === "nsv") {
    setDayLog({ nsv: el.value.trim().slice(0, 140) });
    save();
    if (el.value.trim()) toast("Win logged. That counts.");
    return;
  }
  if (el.dataset.contract) {
    const c = state.contract;
    const path = el.dataset.contract.split(".");
    let v = el.value;
    if (path[0] === "habits") v = v.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 8);
    else if (path[0] === "penaltyAmount") v = Math.max(0, Math.min(10000, Number(v) || 0));
    else v = String(v).trim().slice(0, 200);
    if (path.length === 1) c[path[0]] = v;
    else if (path.length === 2) c[path[0]][Number(path[1])] = v;
    else c[path[0]][Number(path[1])][path[2]] = v;
    save();
    return;
  }
  const key = el.dataset.setting;
  if (!key) return;
  const s = state.settings;
  let rerender = false;
  if (key === "includeOptional" || key === "sound") {
    s[key] = el.checked;
    if (key === "sound") FX.setEnabled(el.checked);
  } else if (["weekdayMin", "weekendMin", "bufferDays", "jarTarget"].includes(key)) {
    const v = Math.max(0, Math.round(Number(el.value) || 0));
    s[key] = key === "bufferDays" ? Math.min(v, 10) : key === "jarTarget" ? Math.min(v, 100000) : Math.min(v, 900);
  } else if (key === "deadline") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) s.deadline = el.value;
  } else if (key === "ritual") {
    s.ritual = el.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 8);
    state.ritual.checks = [];
  } else if (key === "avoid") {
    s.avoid = H.parseAvoid(el.value);
  } else if (key === "bundle") {
    s.bundle = el.value.trim();
    s.bundleAligned = "";
    rerender = true; // show or clear the alignment warning
  } else {
    s[key] = el.value.trim();
  }
  save();
  toast("Saved. Plan updated.");
  if (rerender) render();
});

function exportData() {
  const blob = new Blob([JSON.stringify({ app: "goals", version: 2, exportedAt: new Date().toISOString(), state }, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `goals-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Backup downloaded.");
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const s = data.state || data;
      if (!s || typeof s.completed !== "object") throw new Error("bad file");
      state = normalize(s);
      FX.setEnabled(state.settings.sound);
      save();
      toast("Backup restored.");
      render();
    } catch {
      toast("That file is not a Goals backup.");
    }
  };
  reader.readAsText(file);
}

// Toasts queue up so a milestone never overwrites the cheer that earned it.
const toastQ = [];
let toastBusy = false;
function toast(msg, opts = {}) {
  toastQ.push({ msg, ...opts });
  while (toastQ.length > 2) toastQ.shift(); // rapid taps: keep only the freshest

  if (!toastBusy) nextToast();
}
function nextToast() {
  const item = toastQ.shift();
  const el = $("#toast");
  if (!item) {
    toastBusy = false;
    return;
  }
  toastBusy = true;
  el.textContent = item.msg;
  el.className = `toast show ${item.tone || ""}`;
  item.after?.();
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(nextToast, 250);
  }, toastQ.length ? 1800 : 2600);
}

// ---------- confetti (tiny, dependency free)

const canvas = $("#confetti");
const ctx = canvas.getContext("2d");
let parts = [];
let raf = null;
const COLORS = ["#a78bfa", "#6366f1", "#22d3ee", "#34d399", "#fbbf24", "#f472b6"];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function burst(x, y, n, spread = 1) {
  if (reduceMotion) return;
  const dpr = devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (2 + Math.random() * 5) * spread;
    parts.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3 * spread,
      s: 4 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
      c: COLORS[(Math.random() * COLORS.length) | 0], life: 1,
    });
  }
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 20);
  for (const p of parts) {
    p.vy += 0.18;
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.r += p.vr;
    p.life -= 0.008;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    ctx.fillStyle = p.c;
    ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    ctx.restore();
  }
  raf = parts.length ? requestAnimationFrame(tick) : null;
  if (!raf) ctx.clearRect(0, 0, innerWidth, innerHeight);
}

function bigCelebration(scale = 1) {
  burst(innerWidth * 0.2, innerHeight * 0.35, 90 * scale, 1.6);
  setTimeout(() => burst(innerWidth * 0.8, innerHeight * 0.35, 90 * scale, 1.6), 180);
  setTimeout(() => burst(innerWidth * 0.5, innerHeight * 0.25, 120 * scale, 1.8), 380);
}

// ---------- boot

function scrollToAnchor() {
  const { anchor } = route();
  const el = anchor && document.getElementById(anchor);
  if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
  else scrollTo({ top: 0, behavior: "instant" });
}
addEventListener("hashchange", () => {
  render();
  scrollToAnchor();
});
// Roll over at midnight, and when you come back to a tab left open overnight.
const checkDay = () => today() !== renderedDay && render();
setInterval(checkDay, 60000);
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && checkDay());
addEventListener("storage", (e) => e.key === KEY && ((state = load()), render()));

checkMilestones(true); // record what's already earned without a fanfare
render();
if (route().anchor) scrollToAnchor();

Sync.initSync({
  getState: () => state,
  setState: (remote) => {
    state = normalize(remote);
    FX.setEnabled(state.settings.sound);
    save(false);
    toast("Pulled your latest progress from the cloud.");
    render();
  },
  onStatus: (st) => {
    if (document.activeElement?.matches?.("input, textarea")) return;
    // Settings shows sync details; Today's motivation button needs to know
    // the moment you sign in or out.
    const signedInChanged = st.email !== lastSyncEmail;
    lastSyncEmail = st.email;
    if (currentTab() === "settings" || (signedInChanged && currentTab() === "today")) render();
  },
  onPushed: maybeNudge,
});

// The midday email goes out the moment you're halfway, not at a fixed hour.
// After every synced change, if today just crossed halfway, ask the server.
// It re-checks from the database and sends at most once a day.
const NUDGE_KEY = "goals.nudged";
let nudging = false;
function maybeNudge() {
  const F = facts();
  if (nudging || !D.reachedHalfway(F) || params.get("today")) return;
  try {
    if (localStorage.getItem(NUDGE_KEY) === F.t) return;
  } catch {}
  nudging = true;
  Sync.nudge()
    .then((r) => {
      if (r?.sent || r?.reason === "already sent today") {
        try {
          localStorage.setItem(NUDGE_KEY, F.t);
        } catch {}
      }
      if (r?.sent) toast("📬 Halfway check-in sent to your inbox.");
    })
    .finally(() => (nudging = false));
}
