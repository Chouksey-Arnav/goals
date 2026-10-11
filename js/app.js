import { COURSES, allLessons, plannable, DEADLINE, TRACK_START, KIND_LABEL, KIND_TIP } from "./data.js";
import * as P from "./planner.js";
import * as Sync from "./sync.js";

// ---------- state

const KEY = "goals.v1";
const LESSONS = allLessons();
const BY_ID = Object.fromEntries(LESSONS.map((l) => [l.id, l]));
const COURSE = Object.fromEntries(COURSES.map((c) => [c.id, c]));

const DEFAULT_SETTINGS = {
  weekdayMin: 150,
  weekendMin: 240,
  deadline: DEADLINE,
  bufferDays: 2,
  includeOptional: false,
  when: "7:00 pm",
  where: "my desk",
  identity: "I am someone who understands machine learning from first principles.",
  bundle: "",
  ritual: ["Phone in another room", "Water and a snack on the desk", "Udemy open next to a blank notebook"],
};

function fresh() {
  const completed = {};
  for (const c of COURSES) for (const n of c.preDone || []) completed[`${c.id}-${n}`] = "pre";
  return { completed, settings: { ...DEFAULT_SETTINGS }, ritual: { date: null, checks: [] }, history: {}, celebrated: {} };
}

function normalize(s) {
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  s.completed = s.completed || {};
  s.ritual = s.ritual || { date: null, checks: [] };
  s.history = s.history || {};
  s.celebrated = s.celebrated || {};
  return s;
}

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
const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

function courseChip(c) {
  return `<span class="chip ${c.color}">${esc(c.short)}</span>`;
}
function kindChip(kind) {
  return `<span class="chip k-${kind}">${esc(KIND_LABEL[kind])}</span>`;
}

function lessonRow(l, { current = false, showCourse = false, showReason = false } = {}) {
  const c = COURSE[l.course];
  const done = isDone(l);
  const tags = [
    l.kind !== "video" ? kindChip(l.kind) : "",
    l.optional ? `<span class="chip k-optional" title="${esc(l.optional)}">Optional</span>` : "",
  ].join("");
  return `
    <button class="lesson ${done ? "done" : ""} ${current ? "current" : ""} ${l.kind === "pending" ? "pending" : ""} ${l.optional ? "optional" : ""}"
      data-action="toggle" data-id="${l.id}" aria-pressed="${done}"
      aria-label="${done ? "Mark not done" : "Mark done"}: ${esc(l.label)}, ${esc(l.title)}">
      <span class="box">${CHECK_SVG}</span>
      <span>
        <span class="ln">${showCourse ? esc(c.short) + " · " : ""}${esc(l.label)}</span>
        <span class="lt" style="display:block">${esc(l.title)}</span>
        ${tags ? `<span class="tags">${tags}</span>` : ""}
        ${showReason && l.optional ? `<span class="reason">${esc(l.optional)}</span>` : ""}
      </span>
      <span class="lm"><b>~${fmtMin(l.effort)}</b>${l.min} min video</span>
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

function activity() {
  const byDay = P.minutesByDay(LESSONS, state.completed);
  return { byDay, active: new Set(Object.keys(byDay)) };
}

// ---------- views

function viewToday() {
  const t = today();
  const s = state.settings;
  const plan = P.planDay({ lessons: planSet(), completed: state.completed, today: t, settings: s });
  if (state.history[t] !== plan.targetMin) {
    state.history[t] = plan.targetMin;
    save(false);
  }

  const planLessons = plan.ids.map((id) => BY_ID[id]);
  const doneMin = sum(planLessons.filter(isDone), (l) => l.effort);
  const extra = LESSONS.filter((l) => state.completed[l.id] === t && !plan.ids.includes(l.id));
  const pct = plan.targetMin ? Math.min(100, Math.round((doneMin / plan.targetMin) * 100)) : 100;
  const next = planLessons.find((l) => !isDone(l));
  const allDone = !next;
  const finished = plan.lessonsRemaining === 0;
  const { byDay, active } = activity();
  const streak = P.streak(active, t);
  const best = P.bestStreak(active);
  const votes = Object.values(state.completed).filter((v) => v !== "pre").length;
  const perfect = Object.keys(byDay).filter((k) => state.history[k] && byDay[k].min >= state.history[k]).length;

  const banners = [];
  if (P.missedYesterday(active, t, TRACK_START)) {
    banners.push(`<div class="banner bad"><span class="bi">⚠️</span><div>You missed yesterday. Never miss twice.
      <small>Missing once is an accident. Missing twice is the start of a new habit. Do just the Up Next lesson right now. That alone keeps you in the game.</small></div></div>`);
  }
  if (!finished && !plan.onTrack) {
    const when = plan.finishAtCapacity ? fmtDate(plan.finishAtCapacity) : "never at this rate";
    banners.push(`<div class="banner warn"><span class="bi">⏱️</span><div>At ${fmtMin(s.weekdayMin)} on weekdays and ${fmtMin(s.weekendMin)} on weekends you finish <b>${when}</b>, after the deadline.
      <small>Be honest in Settings. Either raise your daily minutes or accept the slip. Wishful numbers just push the problem to Oct 30.</small></div></div>`);
  }

  let headline;
  let sub;
  if (finished) {
    headline = "Both courses complete.";
    sub = "Every planned lesson is done. Now the real olympiad work starts: see the roadmap on the System tab.";
  } else if (allDone) {
    headline = "Day complete. Chain unbroken.";
    sub = "That was a vote for who you're becoming. Bank extra lessons below to lighten tomorrow.";
  } else if (pct === 0) {
    headline = `Today: ${planLessons.length} lessons, about ${fmtMin(plan.targetMin)}.`;
    sub = "Don't think about all of them. Start the first one.";
  } else {
    const left = planLessons.filter((l) => !isDone(l)).length;
    headline = `${left} to go. You're in motion.`;
    sub = `${fmtMin(doneMin)} done, about ${fmtMin(plan.targetMin - doneMin)} left today.`;
  }

  const hero = `
    <section class="card">
      <div class="hero">
        <div class="ring ${allDone ? "complete" : ""}" data-pct="${pct}">
          <svg viewBox="0 0 128 128" aria-hidden="true">
            <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset=".5" stop-color="#6366f1"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
            <circle class="track" cx="64" cy="64" r="54" fill="none" stroke-width="12"/>
            <circle class="bar" cx="64" cy="64" r="54" fill="none" stroke-width="12" stroke-linecap="round"
              stroke-dasharray="339.29" stroke-dashoffset="${339.29 * (1 - lastRingPct / 100)}"/>
          </svg>
          <div class="ring-label"><div><div class="ring-pct">${pct}%</div><div class="ring-sub">of today</div></div></div>
        </div>
        <div class="hero-text">
          <h1>${headline}</h1>
          <p>${sub}</p>
        </div>
      </div>
      <div class="daybar ${allDone ? "complete" : ""}" role="progressbar" aria-label="Today's progress" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
    </section>`;

  let nextCard = "";
  if (next) {
    const c = COURSE[next.course];
    nextCard = `
      <section class="card next" aria-label="Up next">
        <div class="eyebrow">Up next · do exactly this</div>
        <div class="title">${esc(next.title)}</div>
        <div class="meta">${courseChip(c)}<span>${esc(next.label)}</span>${kindChip(next.kind)}</div>
        <div class="meta" style="margin-top:6px"><span>${esc(next.section)}</span></div>
        <div class="meta" style="margin-top:6px"><span>▶ ${next.min} min video</span><span>⏱ about ${fmtMin(next.effort)} real work</span></div>
        <p class="tip">${esc(KIND_TIP[next.kind])}</p>
        <button class="btn primary block" data-action="toggle" data-id="${next.id}">${CHECK_SVG.replace('stroke="#fff"', 'stroke="#fff" width="18" height="18"')} Done, next lesson</button>
      </section>`;
  }

  const ritualCard = !allDone && pct === 0 && s.ritual.length ? ritualSection("Before you start: your ritual") : "";

  const reward = s.bundle
    ? `<section class="card"><div class="reward ${allDone ? "unlocked" : "locked"}">
        <div class="lock">${allDone ? "🔓" : "🔒"}</div>
        <div><div class="small muted">${allDone ? "Unlocked. You earned it:" : "Unlocks when today hits 100%:"}</div><div class="rt">${esc(s.bundle)}</div></div>
      </div></section>`
    : `<section class="card"><div class="reward locked"><div class="lock">🎁</div><div><div class="rt">Set a reward</div>
        <div class="small muted">Temptation bundling: pick something you enjoy that you only get after today's list. <a href="#settings">Add it in Settings</a>.</div></div></div></section>`;

  const groups = [...new Set(planLessons.map((l) => l.course))]
    .map((cid) => {
      const c = COURSE[cid];
      const ls = planLessons.filter((l) => l.course === cid);
      return `<div class="group-label">${courseChip(c)} <span>${esc(c.instructor)}</span></div>
        ${ls.map((l) => lessonRow(l, { current: next && l.id === next.id })).join("")}`;
    })
    .join("");

  const ahead = P.aheadLessons({ lessons: planSet(), completed: state.completed, planIds: plan.ids });
  const aheadCard =
    allDone && ahead.length
      ? `<section class="card"><h2>Get ahead <span class="right">lightens tomorrow</span></h2>
          <div class="lessons">${ahead.map((l) => lessonRow(l, { showCourse: true })).join("")}</div></section>`
      : "";
  const extraCard = extra.length
    ? `<section class="card"><h2>Bonus done today <span class="right">${extra.length} extra</span></h2>
        <div class="lessons">${extra.map((l) => lessonRow(l, { showCourse: true })).join("")}</div></section>`
    : "";

  const list = planLessons.length
    ? `<section class="card"><h2>Today's checklist <span class="right">${planLessons.filter(isDone).length}/${planLessons.length} · ${fmtMin(plan.targetMin)}</span></h2>
        <div class="lessons">${groups}</div>
        <p class="small faint" style="margin:12px 0 0">Math first while your brain is fresh, then code. Exercises marked <b>Solve first</b> count only if you attempt them before the answer.</p>
      </section>`
    : "";

  const stats = `
    <section class="stats">
      <div class="card stat"><div class="num"><span class="flame">🔥</span> ${streak}</div><div class="lbl">day streak · best ${best}</div></div>
      <div class="card stat"><div class="num">${perfect}</div><div class="lbl">perfect days</div></div>
      <div class="card stat"><div class="num">${votes}</div><div class="lbl">votes cast</div></div>
    </section>`;

  return `<div class="view">${banners.join("")}${hero}${nextCard}${ritualCard}${list}${aheadCard}${extraCard}${reward}${stats}${paceCard(plan)}${heatmapCard(byDay, t)}</div>`;
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
  return `<section class="card"><h2>${esc(title)} <span class="right">Law 2</span></h2><div class="ritual">${items}</div></section>`;
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
        <div class="box2"><div class="big">${fmtMin(plan.totalRemaining)}</div><div class="lbl">real work left (loaded)</div></div>
      </div>
      ${bars}
      ${
        notLoaded.length
          ? `<p class="note" style="margin:14px 0 0">⚠ Not loaded yet, so not in this math: ${notLoaded.map(esc).join("; ")}. The real daily load is higher than shown. Send the screenshots.</p>`
          : ""
      }
    </section>`;
}

function heatmapCard(byDay, t) {
  const s = state.settings;
  const start = TRACK_START;
  const end = s.deadline > start ? s.deadline : start;
  const lead = (P.parseKey(start).getDay() + 6) % 7; // Monday first
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(`<div class="cell blank"></div>`);
  for (let k = start; k <= end; k = P.addDays(k, 1)) {
    const d = byDay[k];
    const target = state.history[k];
    let cls = "";
    if (d) {
      const r = target ? d.min / target : 1;
      cls = r >= 1 ? "l4" : r >= 0.66 ? "l3" : r >= 0.33 ? "l2" : "l1";
    } else if (k < t) cls = "miss";
    if (k === t) cls += " today";
    if (k === s.deadline) cls += " deadline";
    const label = `${fmtDate(k)}: ${d ? d.count + " lessons, " + fmtMin(d.min) : k < t ? "missed" : "upcoming"}`;
    cells.push(`<div class="cell ${cls}" title="${esc(label)}" aria-label="${esc(label)}">${P.parseKey(k).getDate()}</div>`);
  }
  const dows = ["M", "T", "W", "T", "F", "S", "S"].map((d) => `<div class="dow">${d}</div>`).join("");
  return `
    <section class="card">
      <h2>The chain <span class="right">don't break it</span></h2>
      <div class="heat">${dows}${cells.join("")}</div>
      <div class="legend">less <i style="background:rgba(139,92,246,.25)"></i><i style="background:rgba(139,92,246,.5)"></i><i style="background:rgba(99,102,241,.75)"></i><i style="background:linear-gradient(135deg,#a78bfa,#22d3ee)"></i> 100%</div>
    </section>`;
}

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

function viewSystem() {
  const s = state.settings;
  const votes = Object.values(state.completed).filter((v) => v !== "pre").length;
  return `<div class="view">
    <section class="card">
      <blockquote>You do not rise to the level of your goals. You fall to the level of your systems.<cite>James Clear, Atomic Habits</cite></blockquote>
      <p class="small muted" style="margin:12px 0 0">The goal is "finish by Oct 31." This page is the system. The checklist only works if the system around it does.</p>
    </section>

    ${olympiadCard()}

    <section class="card">
      <h2>Identity <span class="right">${votes} votes so far</span></h2>
      <p class="intention">"<em>${esc(s.identity)}</em>"</p>
      <p class="small muted" style="margin:8px 0 0">Every action you take is a vote for the type of person you wish to become. Each ticked lesson is one vote.</p>
    </section>

    <section class="card law">
      <div class="num">1</div><div>
      <h3>Make It Obvious</h3>
      <p class="intention">I will study ML at <em>${esc(s.when)}</em> at <em>${esc(s.where)}</em>.</p>
      <p>Implementation intention: a set time and place beats waiting for motivation. The Up Next card is your cue, so you never decide what to do, you just do the next thing.</p>
    </div></section>

    <section class="card law star">
      <div class="num">2</div><div>
      <h3>Make It Attractive</h3>
      <p><b>Temptation bundling.</b> Pair what you need to do with something you want to do. Your reward: <b>${s.bundle ? esc(s.bundle) : "not set yet"}</b>. It stays locked on the Today tab until you hit 100%.</p>
      <p><b>Motivation ritual.</b> Do the same short routine right before every session, so starting feels automatic. Yours is below and appears on Today before you start.</p>
      <p><b>Join a culture where your desired behavior is the normal behavior.</b> Find people prepping for the AI Olympiad (a study group, a Discord, a friend) and share your chain with them. You become who you spend time with.</p>
      <p><b>Reframe "have to" as "get to".</b> You don't have to do backprop tonight. You get to understand how every neural network learns.</p>
    </div></section>
    ${ritualSection("Your motivation ritual")}

    <section class="card law">
      <div class="num">3</div><div>
      <h3>Make It Easy</h3>
      <p><b>Two-minute rule.</b> On a bad day, the goal is not the whole list. Open the Up Next lesson and press play. One finished lesson keeps your streak alive.</p>
      <p><b>Prime the environment.</b> Leave the notebook open and the course tab pinned so the first step takes zero effort.</p>
    </div></section>

    <section class="card law">
      <div class="num">4</div><div>
      <h3>Make It Satisfying</h3>
      <p><b>Habit tracker.</b> The ring, the streak and the chain on Today are your tracker. Don't break the chain.</p>
      <p><b>Never miss twice.</b> Missing once is an accident. Missing twice is the start of a new habit. The app warns you the day after a miss.</p>
    </div></section>

    <section class="card">
      <h2>Ruthless reminders</h2>
      <p class="small" style="margin:0 0 8px">✗ Finishing videos is not the same as learning. If you can't redo an exercise from a blank page a week later, you watched it, you didn't learn it.</p>
      <p class="small" style="margin:0 0 8px">✗ Olympiad problems don't come with a solution video. Every <b>Solve first</b> lesson is practice for that.</p>
      <p class="small" style="margin:0">✓ Before ticking a lesson, say its core idea out loud in one sentence. If you can't, it isn't done.</p>
    </section>
  </div>`;
}

function viewSettings() {
  const s = state.settings;
  return `<div class="view">
    <section class="card">
      <h2>Honest capacity <span class="right">drives the plan</span></h2>
      <div class="grid2">
        <div class="field"><label for="weekdayMin">Minutes on school days</label><input id="weekdayMin" data-setting="weekdayMin" type="number" min="0" max="900" step="5" value="${s.weekdayMin}"/></div>
        <div class="field"><label for="weekendMin">Minutes on weekends</label><input id="weekendMin" data-setting="weekendMin" type="number" min="0" max="900" step="5" value="${s.weekendMin}"/></div>
        <div class="field"><label for="deadline">Deadline</label><input id="deadline" data-setting="deadline" type="date" value="${s.deadline}"/></div>
        <div class="field"><label for="bufferDays">Buffer days</label><input id="bufferDays" data-setting="bufferDays" type="number" min="0" max="10" value="${s.bufferDays}"/><span class="hint">Plan to finish this many days early.</span></div>
      </div>
      <label class="toggle"><input type="checkbox" data-setting="includeOptional" ${s.includeOptional ? "checked" : ""}/>
        <span><b>Include optional lessons in my plan</b><br/><span class="small muted">Off by default: they're off the olympiad syllabus. AWS setup is never planned.</span></span></label>
      <p class="small faint" style="margin:12px 0 0">Real work per lesson is estimated: video × 1.5 for code-along, at least 20 min for exercises, 75 min for projects. Video time is not study time.</p>
    </section>

    <section class="card">
      <h2>Your system</h2>
      <div class="grid2">
        <div class="field"><label for="when">I will study at</label><input id="when" data-setting="when" value="${esc(s.when)}"/></div>
        <div class="field"><label for="where">Location</label><input id="where" data-setting="where" value="${esc(s.where)}"/></div>
      </div>
      <div class="field" style="margin-top:12px"><label for="identity">Identity statement</label><input id="identity" data-setting="identity" value="${esc(s.identity)}"/></div>
      <div class="field" style="margin-top:12px"><label for="bundle">Reward after 100% (temptation bundle)</label><input id="bundle" data-setting="bundle" placeholder="e.g. one episode of my show" value="${esc(s.bundle)}"/>
        <span class="hint">Something you actually want, that you only get after the list is done.</span></div>
      <div class="field" style="margin-top:12px"><label for="ritual">Motivation ritual (one step per line)</label><textarea id="ritual" data-setting="ritual">${esc(s.ritual.join("\n"))}</textarea></div>
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

function syncCard() {
  const st = Sync.status;
  let body;
  if (!st.enabled) {
    body = `<p class="small muted" style="margin:0">Cloud sync is not connected yet. Until it is, progress lives only in this browser.</p>`;
  } else if (!st.ready && !st.error) {
    body = `<p class="small muted" style="margin:0">Connecting…</p>`;
  } else if (!st.email) {
    body = `<p class="small muted" style="margin:0 0 12px">Sign in with your email to keep your phone and laptop in sync. You'll get a one-time login link, no password.</p>
      <div class="field"><label for="syncEmail">Email</label><input id="syncEmail" type="email" autocomplete="email" placeholder="you@example.com"/></div>
      <button class="btn primary block" data-action="signin">Email me a login link</button>`;
  } else {
    const when = st.lastSync ? st.lastSync.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "not yet";
    body = `<p class="small" style="margin:0 0 12px"><span class="dot ${st.error ? "bad" : "good"}"></span> Synced as <b>${esc(st.email)}</b> · last sync ${when}</p>
      <div class="btn-row"><button class="btn ghost" data-action="syncnow">Sync now</button><button class="btn ghost" data-action="signout">Sign out</button></div>`;
  }
  return `<section class="card"><h2>Sync across devices <span class="right">${st.enabled ? "Supabase" : "off"}</span></h2>
    ${st.error ? `<div class="banner bad" style="margin-bottom:12px"><span class="bi">⚠️</span><div>${esc(st.error)}</div></div>` : ""}${body}</section>`;
}

// ---------- render loop

const VIEWS = { today: viewToday, courses: viewCourses, system: viewSystem, settings: viewSettings };
let lastRingPct = 0;
let renderedDay = today();

function currentTab() {
  const h = location.hash.slice(1);
  return VIEWS[h] ? h : "today";
}

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

// ---------- actions

const CHEERS = [
  "Vote cast. +1 for future you.",
  "Locked in. Next.",
  "One more brick in the wall.",
  "That's how olympiad brains get built.",
  "Momentum. Don't stop now.",
  "Done is a habit. You're building it.",
];

function toggle(id, el) {
  const t = today();
  const wasDone = !!state.completed[id];
  const before = dayComplete(t);
  if (wasDone) delete state.completed[id];
  else state.completed[id] = t;
  save();

  if (!wasDone) {
    navigator.vibrate?.(12);
    const r = el?.getBoundingClientRect();
    if (r) burst(r.left + r.width / 2, r.top + r.height / 2, 28);
    const after = dayComplete(t);
    if (after && !before && !state.celebrated[t]) {
      state.celebrated[t] = true;
      save();
      setTimeout(() => bigCelebration(), 150);
      toast(state.settings.bundle ? `Day complete. Reward unlocked: ${state.settings.bundle}` : "Day complete. Chain unbroken. 🔥");
    } else {
      toast(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
    }
  } else {
    toast("Unchecked.");
  }
  render();
}

function dayComplete(t) {
  const plan = P.planDay({ lessons: planSet(), completed: state.completed, today: t, settings: state.settings });
  return plan.ids.length > 0 && plan.ids.every((id) => state.completed[id]);
}

document.addEventListener("click", (e) => {
  const tabBtn = e.target.closest("[data-tab]");
  if (tabBtn) {
    location.hash = tabBtn.dataset.tab;
    return;
  }
  const a = e.target.closest("[data-action]");
  if (!a) return;
  const act = a.dataset.action;
  if (act === "toggle") toggle(a.dataset.id, a);
  else if (act === "export") exportData();
  else if (act === "signin") {
    const email = ($("#syncEmail")?.value || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Enter a valid email.");
    a.disabled = true;
    Sync.signIn(email).then(({ error }) => {
      a.disabled = false;
      toast(error ? `Couldn't send: ${error}` : "Check your email and tap the login link on this device.");
    });
  } else if (act === "signout") Sync.signOut().then(() => toast("Signed out. Progress stays on this device."));
  else if (act === "syncnow") Sync.reconcile().then(() => toast(Sync.status.error || "Synced."));
  else if (act === "reset") {
    if (confirm("Erase all progress, streaks and settings on this device? Export a backup first if unsure.")) {
      state = fresh();
      save();
      toast("Reset.");
      render();
    }
  }
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
  const key = el.dataset.setting;
  if (!key) return;
  const s = state.settings;
  if (key === "includeOptional") {
    s.includeOptional = el.checked;
  } else if (["weekdayMin", "weekendMin", "bufferDays"].includes(key)) {
    const v = Math.max(0, Math.round(Number(el.value) || 0));
    s[key] = key === "bufferDays" ? Math.min(v, 10) : Math.min(v, 900);
  } else if (key === "deadline") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) s.deadline = el.value;
  } else if (key === "ritual") {
    s.ritual = el.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 8);
    state.ritual.checks = [];
  } else {
    s[key] = el.value.trim();
  }
  save();
  toast("Saved. Plan updated.");
});

function exportData() {
  const blob = new Blob([JSON.stringify({ app: "goals", version: 1, exportedAt: new Date().toISOString(), state }, null, 2)], {
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
      save();
      toast("Backup restored.");
      render();
    } catch {
      toast("That file is not a Goals backup.");
    }
  };
  reader.readAsText(file);
}

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
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

function bigCelebration() {
  navigator.vibrate?.([20, 60, 20, 60, 40]);
  burst(innerWidth * 0.2, innerHeight * 0.35, 90, 1.6);
  setTimeout(() => burst(innerWidth * 0.8, innerHeight * 0.35, 90, 1.6), 180);
  setTimeout(() => burst(innerWidth * 0.5, innerHeight * 0.25, 120, 1.8), 380);
}

// ---------- boot

addEventListener("hashchange", () => {
  render();
  scrollTo({ top: 0, behavior: "instant" });
});
// Roll over at midnight, and when you come back to a tab left open overnight.
const checkDay = () => today() !== renderedDay && render();
setInterval(checkDay, 60000);
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && checkDay());
addEventListener("storage", (e) => e.key === KEY && ((state = load()), render()));

render();

Sync.initSync({
  getState: () => state,
  setState: (remote) => {
    state = normalize(remote);
    save(false);
    toast("Pulled your latest progress from the cloud.");
    render();
  },
  onStatus: () => currentTab() === "settings" && !document.activeElement?.matches?.("input, textarea") && render(),
});
