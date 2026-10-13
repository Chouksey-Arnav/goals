// The three daily emails: morning plan, midday check-in, evening wrap.
// Pure: takes dayFacts() output and returns { subject, text, html }, or null
// when an email would be noise (rest day evenings, after you've finished).
//
// Writing rules, so the emails stay worth opening:
// - Lead with the one thing to do next. Never make you open the app to find out.
// - Every number is real and comes from your synced record.
// - One Atomic Habits idea per email, turned into one action for today.
// - Honest, not hype. Praise what happened; name what didn't.

import { COURSES, KIND_LABEL, KIND_TIP } from "./data.js";
import * as P from "./planner.js";
import { LAW_NAMES, PRINCIPLES, pickPrinciple, principle, rotation, fmtMinutes as fmt } from "./principles.js";
import { LESSONS } from "./digest.js";
import { plannable } from "./data.js";
import { intention, stack, daysLabel } from "./dailyhabits.js";

const COURSE = Object.fromEntries(COURSES.map((c) => [c.id, c]));
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dateLabel = (k, opts = { weekday: "long", month: "long", day: "numeric" }) =>
  P.parseKey(k).toLocaleDateString("en-US", opts);
const weekday = (k) => dateLabel(k, { weekday: "long" });
// 14 -> "2 pm". The weekend morning block is due by the midday email.
export const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
const amDue = (ctx) => hourLabel(ctx.middayHour ?? 14);

function money(F, x) {
  const n = Math.round(x * 100) / 100;
  return `${F.s.currency || "$"}${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

// Tomorrow's plan as if today ended right now.
function tomorrow(F, state) {
  const k = P.addDays(F.t, 1);
  const lessons = plannable(LESSONS, F.s.includeOptional);
  const plan = P.planDay({ lessons, completed: state.completed, today: k, settings: F.s });
  const byId = Object.fromEntries(lessons.map((l) => [l.id, l]));
  return { k, plan, first: byId[plan.ids[0]] };
}

// ---------- building blocks (each returns { text, html })

const block = (text, html) => ({ text, html });

function para(t, { muted = false, size = 15 } = {}) {
  return block(t, `<p style="margin:0 0 14px;font-size:${size}px;line-height:1.55;color:${muted ? "#6b7280" : "#1f2937"}">${esc(t)}</p>`);
}

function nextBlock(F, label = "Up next · do exactly this") {
  const l = F.next;
  if (!l) return block("", "");
  const c = COURSE[l.course];
  const meta = `${c.short} · ${l.label} · ${KIND_LABEL[l.kind]} · about ${fmt(l.effort)}`;
  return block(
    `${label.toUpperCase()}\n${l.title}\n${meta}\n${KIND_TIP[l.kind]}`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;border-collapse:separate">
      <tr><td style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:14px;padding:16px 18px">
        <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#4f46e5;font-weight:700">${esc(label)}</div>
        <div style="font-size:19px;font-weight:700;color:#111827;margin:6px 0 4px;line-height:1.3">${esc(l.title)}</div>
        <div style="font-size:13px;color:#4b5563">${esc(meta)}</div>
        <div style="font-size:13px;color:#374151;margin-top:8px">${esc(KIND_TIP[l.kind])}</div>
      </td></tr></table>`
  );
}

function progressBar(F) {
  const n = F.planLessons.length;
  const d = F.planDone.length;
  const label = F.mode === "min" ? (F.complete ? "Minimum done" : "Bad-day minimum: 1 lesson") : `${d} of ${n} lessons · ${F.pct}% of today's work`;
  const color = F.complete ? "#059669" : "#6366f1";
  return block(
    label,
    `<div style="margin:0 0 6px;font-size:13px;color:#374151;font-weight:600">${esc(label)}</div>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr><td style="background:#e5e7eb;border-radius:99px;height:10px;line-height:10px;font-size:0">
       <div style="width:${Math.max(2, F.pct)}%;background:${color};height:10px;border-radius:99px"></div></td></tr></table>`
  );
}

// Weekends list the morning and afternoon blocks separately.
function checklist(F, title = "Today's checklist", ctx = {}) {
  if (!F.planLessons.length) return block("", "");
  if (!F.sessions) return lessonList(F, F.planLessons, `${title} · one sitting`);
  const { am, pm } = F.sessions;
  const a = lessonList(F, am.lessons, `Morning block · ~${fmt(am.min)} · done by ${amDue(ctx)}`);
  const b = lessonList(F, pm.lessons, `Afternoon block · ~${fmt(pm.min)}`);
  return block(`${a.text}\n\n${b.text}`, a.html + b.html);
}

function lessonList(F, lessons, title) {
  const done = (l) => F.planDone.includes(l);
  const rows = lessons.map((l) => ({ l, ok: done(l), c: COURSE[l.course] }));
  return block(
    `${title}:\n${rows.map(({ l, ok, c }) => `${ok ? "[x]" : "[ ]"} ${c.short}, ${l.label}: ${l.title} (~${fmt(l.effort)})`).join("\n")}`,
    `<div style="font-size:13px;font-weight:700;color:#111827;margin:0 0 8px">${esc(title)}</div>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:14px">
     ${rows
       .map(
         ({ l, ok, c }) => `<tr>
         <td width="22" valign="top" style="padding:5px 0;color:${ok ? "#059669" : "#9ca3af"};font-weight:700">${ok ? "✓" : "○"}</td>
         <td valign="top" style="padding:5px 0;color:${ok ? "#9ca3af" : "#1f2937"};${ok ? "text-decoration:line-through;" : ""}line-height:1.4">${esc(l.title)}
           <span style="color:#9ca3af;font-size:12px;text-decoration:none"> · ${esc(c.short)} ${esc(l.label)}${l.kind !== "video" ? ` · ${esc(KIND_LABEL[l.kind])}` : ""}</span></td>
         <td valign="top" align="right" style="padding:5px 0 5px 8px;color:#6b7280;font-size:12px;white-space:nowrap">~${fmt(l.effort)}</td></tr>`
       )
       .join("")}
     </table>`
  );
}

function principleBlock(F, slot, dayIndex) {
  const pr = pickPrinciple(F, slot, dayIndex);
  const act = pr.action(F);
  return principleHtml(pr, act);
}
function principleHtml(pr, act) {
  return block(
    `ATOMIC HABITS · ${LAW_NAMES[pr.law]}\n${pr.title}\n${pr.idea}\nToday: ${act}`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr>
      <td style="border-left:3px solid #f59e0b;background:#fffbeb;border-radius:0 12px 12px 0;padding:14px 16px">
        <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#b45309;font-weight:700">Atomic Habits · ${esc(LAW_NAMES[pr.law])}</div>
        <div style="font-size:16px;font-weight:700;color:#111827;margin:6px 0">${esc(pr.title)}</div>
        <div style="font-size:14px;color:#374151;line-height:1.55">${esc(pr.idea)}</div>
        <div style="font-size:14px;color:#111827;line-height:1.55;margin-top:8px"><b>Today:</b> ${esc(act)}</div>
      </td></tr></table>`
  );
}

function statsLine(F) {
  const parts = [`Chain: ${plural(F.streak, "day")} (best ${F.best})`, `${F.votes} identity votes`];
  const left = P.diffDays(F.t, F.s.deadline) + 1;
  if (left > 0) parts.push(`${plural(left, "day")} to ${dateLabel(F.s.deadline, { month: "short", day: "numeric" })}`);
  const t = parts.join(" · ");
  return block(t, `<p style="margin:0 0 14px;font-size:13px;color:#6b7280">${esc(t)}</p>`);
}

// plan: today's plan in the morning; tomorrow's (which counts today's
// ticks) in the evening, so the "left" number is never stale.
function paceBlock(F, p = F.plan) {
  if (F.finished || p.totalRemaining <= 0) return block("", "");
  const t = p.onTrack
    ? `On pace: at your stated capacity you finish ${dateLabel(p.finishAtCapacity, { weekday: "short", month: "short", day: "numeric" })}. ${fmt(p.totalRemaining)} of real work left.`
    : `Behind: at your stated capacity you finish ${p.finishAtCapacity ? dateLabel(p.finishAtCapacity, { weekday: "short", month: "short", day: "numeric" }) : "never"}, after the deadline. ${fmt(p.totalRemaining)} left, about ${fmt(p.requiredAvg)} a day needed. Raise your minutes in Settings or accept the slip. Don't pretend.`;
  return block(t, `<p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:${p.onTrack ? "#065f46" : "#b91c1c"}">${esc(t)}</p>`);
}

function banner(t, tone = "bad") {
  const bg = { bad: "#fef2f2", warn: "#fffbeb", good: "#ecfdf5" }[tone];
  const bd = { bad: "#fecaca", warn: "#fde68a", good: "#a7f3d0" }[tone];
  return block(
    t,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="background:${bg};border:1px solid ${bd};border-radius:12px;padding:12px 14px;font-size:14px;line-height:1.5;color:#1f2937">${esc(t)}</td></tr></table>`
  );
}

function button(label, url) {
  return block(
    `${label}: ${url}`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr><td style="background:#4f46e5;border-radius:12px">
      <a href="${esc(url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none">${esc(label)}</a></td></tr></table>`
  );
}

function wrap(subject, preheader, blocks, footer) {
  const body = blocks.filter((b) => b && (b.text || b.html));
  const text = [...body.map((b) => b.text).filter(Boolean), "—", footer].join("\n\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px"><tr><td style="padding:26px 24px 8px">
${body.map((b) => b.html).join("\n")}
</td></tr><tr><td style="padding:0 24px 22px;font-size:12px;line-height:1.5;color:#9ca3af;border-top:1px solid #f3f4f6">${esc(footer).replace(/\n/g, "<br>")}</td></tr></table>
</td></tr></table></body></html>`;
  return { subject, text, html, preheader };
}

function heading(t) {
  return block(t, `<h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;color:#111827">${esc(t)}</h1>`);
}

// ---------- the three emails

// ctx: { name, appUrl, syncedAt (human string), dayIndex, state }
// ctx.justDone (optional): completions that triggered this email, listed first.
// When the course plan has nothing to say (rest day, finished), your habits
// still get their morning list and evening reminder.
export function compose(slot, F, ctx) {
  let mail;
  if (slot === "morning") mail = morning(F, ctx);
  else if (slot === "midday") mail = midday(F, ctx);
  else if (slot === "evening") mail = evening(F, ctx);
  else throw new Error(`Unknown slot: ${slot}`);
  return mail || habitsOnly(slot, F, ctx);
}

function footerFor(F, ctx) {
  return [
    `Based on progress synced ${ctx.syncedAt}. Tick lessons while signed in so these stay accurate.`,
    F.sessions
      ? "Weekend: three emails. The morning plan, the afternoon block the moment your morning block is done (or mid-afternoon), and an evening wrap."
      : "Weekday: three emails. The morning plan, a mid-afternoon check-in (or the moment the whole sitting is done), and an evening wrap.",
    `${ctx.appUrl}`,
  ].join("\n");
}

const hi = (ctx, word) => `${word}${ctx.name ? `, ${ctx.name}` : ""}.`;

function morning(F, ctx) {
  const today = `${ctx.appUrl}/#today`;
  const n = F.planLessons.length;
  const foot = footerFor(F, ctx);

  if (F.finished) {
    // Celebrate once, then stop: emails about a finished plan are noise.
    if (F.finishedOn && F.finishedOn < P.addDays(F.t, -1)) return null;
    return wrap(
      "Both courses are done. Now the real olympiad work starts.",
      "Every planned lesson is finished.",
      [
        heading("Both courses complete."),
        para(`Every planned lesson is done. ${F.votes} votes for "${F.s.identity}" That's not a streak anymore, it's who you are.`),
        para("Oct 31 was the end of the foundation, not the end of prep. The System tab lists what these courses don't cover: PyTorch, CNNs, transformers, training craft. That's November to February."),
        habitsBlock(F),
        principleBlock(F, "morning", ctx.dayIndex),
        button("See the olympiad roadmap", `${ctx.appUrl}/#system`),
      ],
      foot
    );
  }

  if (F.rest) {
    return wrap(
      `${weekday(F.t)} is a rest day. Your ${F.streak}-day chain is safe.`,
      "No lessons planned today.",
      [
        heading(hi(ctx, "Rest day")),
        para("Nothing is planned today and the chain can't break. Rest is part of the system, not a break from it."),
        para("If you want to get ahead anyway, any lesson you finish today lightens the rest of the plan.", { muted: true }),
        habitsBlock(F, "Your habits still run today"),
        principleBlock(F, "morning", ctx.dayIndex),
        statsLine(F),
      ],
      foot
    );
  }

  const blocks = [];
  let subject;
  let opener;
  const time = fmt(F.plan.targetMin);
  const first = F.next ? cut(F.next.title, 48) : "";

  if (F.unpaid.length) {
    blocks.push(
      banner(
        `Contract breach: you missed twice (${F.unpaid.map((d) => dateLabel(d, { month: "short", day: "numeric" })).join(", ")}). You owe ${F.partner?.name || "your partner"} ${money(F, F.owed)}. Pay it today, then mark it paid in the app.`,
        "bad"
      )
    );
  }

  if (F.complete) {
    subject = `Already done today. ${F.streak}-day chain.`;
    opener = "You've already finished today's plan. Anything else today is a bonus that lightens the coming days.";
  } else if (F.missRun >= 2) {
    subject = `${F.missRun} days missed. Break it today with one lesson.`;
    opener = `You've missed ${plural(F.missRun, "scheduled day")} in a row. That's how a new habit (not studying) forms. Not today. One lesson breaks it, and one lesson is all today has to be.`;
  } else if (F.missRun === 1) {
    subject = `Never miss twice. Today: ${plural(n, "lesson")}, start with "${first}"`;
    opener = "Yesterday was a miss. That's an accident, not a pattern, as long as today isn't one too. If the day gets away from you, the minimum still counts.";
  } else if (F.mode === "min") {
    subject = `Bad-day mode: one lesson. "${first}"`;
    opener = `You switched today to the minimum. ${F.s.minimum} That keeps the chain and the identity. The rest re-plans itself.`;
  } else if (F.planDone.length > 0) {
    subject = `${F.planDone.length}/${n} done already. Keep it rolling.`;
    opener = `You've started before this email even landed. ${plural(F.leftLessons.length, "lesson")} left, about ${fmt(F.plan.targetMin - F.doneMin)}.`;
    if (F.sessions && !F.sessions.am.done) opener += ` Finish the morning block (${plural(F.sessions.am.left.length, "lesson")}, ~${fmt(F.sessions.am.leftMin)}) by ${amDue(ctx)}.`;
    else if (F.sessions) opener += " Morning block already done. The afternoon block is all that's left.";
    else opener += " Same sitting: keep going until the list is empty.";
  } else if (F.sessions) {
    const { am, pm } = F.sessions;
    subject = `${weekday(F.t)}: ${plural(am.lessons.length, "lesson")} this morning, ${pm.lessons.length} this afternoon. Start with "${first}"`;
    opener = `${F.streak > 0 ? `Your chain is at ${plural(F.streak, "day")}. ` : "Day one of a chain is the most important link. "}Weekend split: ${plural(n, "lesson")}, about ${time}, in two blocks. Morning block: ${plural(am.lessons.length, "lesson")}, ~${fmt(am.min)}, done by ${amDue(ctx)}. Afternoon block: ${plural(pm.lessons.length, "lesson")}, ~${fmt(pm.min)}. You've got this.`;
  } else {
    subject = `${weekday(F.t)}: ${plural(n, "lesson")}, ~${time}, one sitting. Start with "${first}"`;
    opener = `${F.streak > 0 ? `Your chain is at ${plural(F.streak, "day")}. ` : "Day one of a chain is the most important link. "}Today is ${plural(n, "lesson")}, about ${time} of real work, in one sitting: ${F.s.when} at ${F.s.where}, start to finish in one go. No splitting it up. You've got this.`;
  }

  blocks.unshift(heading(hi(ctx, "Good morning")));
  blocks.push(para(opener));
  if (!F.complete) blocks.push(nextBlock(F));
  if (F.planDone.length) blocks.push(progressBar(F));
  if (F.mode !== "min") blocks.push(checklist(F, "Today's checklist", ctx));
  blocks.push(habitsBlock(F));
  blocks.push(para(
    F.sessions
      ? `The plan: morning block now at ${F.s.where}, afternoon block after lunch. Math first while your brain is fresh, then code. Solve first means attempt it before the answer.`
      : `The plan: ${F.s.when} at ${F.s.where}, everything in one go. Math first while your brain is fresh, then code. Solve first means attempt it before the answer.`,
    { muted: true }
  ));
  blocks.push(principleBlock(F, "morning", ctx.dayIndex));
  blocks.push(paceBlock(F));
  blocks.push(statsLine(F));
  blocks.push(button("Open today's plan", today));
  return wrap(subject, opener, blocks, footerFor(F, ctx));
}

function midday(F, ctx) {
  if (F.finished || F.rest) return null;
  const n = F.planLessons.length;
  const d = F.planDone.length;
  const left = F.leftLessons.length;
  const leftMin = Math.max(0, F.plan.targetMin - F.doneMin);
  const blocks = [heading(hi(ctx, "Check-in")), justDoneBlock(ctx.justDone)];
  let subject;
  let opener;

  if (F.complete) {
    subject = F.mode === "min" ? "Minimum done. Chain intact." : `Day complete. ${F.s.bundle ? `Reward unlocked: ${cut(F.s.bundle, 40)}` : `${F.streak}-day chain.`}`;
    opener = F.mode === "min"
      ? "You showed up on a bad day. That matters more than a perfect day you skipped."
      : `All ${plural(n, "lesson")} done, ${fmt(F.doneMin)} of real work. ${F.s.bundle ? `Take your reward now, while it still means something: ${F.s.bundle}.` : "Pick a reward in Settings so tomorrow's 100% pays out."}`;
    blocks.push(para(opener));
    blocks.push(para("Anything more today is a bonus that lightens the rest of the month. Rest is also a fine answer.", { muted: true }));
  } else if (F.mode === "min") {
    subject = `Bad-day mode: one lesson. "${cut(F.next?.title || "", 44)}"`;
    opener = `Today is the minimum. ${F.s.minimum} That one lesson keeps the chain.`;
    blocks.push(para(opener));
    blocks.push(nextBlock(F, "Just this one"));
  } else if (F.sessions) {
    const { am, pm } = F.sessions;
    if (am.done) {
      subject = `Morning block done. Afternoon block: ${plural(pm.left.length, "lesson")}, ~${fmt(pm.leftMin)}.`;
      opener = `Morning block finished: half the day is banked. Now the afternoon block: ${plural(pm.left.length, "lesson")}, about ${fmt(pm.leftMin)}. Take a short break if you need one, then start. Don't let the break become the afternoon.`;
      blocks.push(para(opener));
      blocks.push(progressBar(F));
      blocks.push(nextBlock(F, "Afternoon block · start here"));
    } else if (d === 0 && !F.shownToday) {
      subject = `0 of ${n} done. Start the morning block now, two minutes.`;
      opener = `Nothing is ticked yet, and the morning block was due by ${amDue(ctx)}. Don't write the day off. Do the morning block now (${plural(am.left.length, "lesson")}, ~${fmt(am.leftMin)}), then roll straight into the afternoon block. Just open "${F.next?.title || "the next lesson"}" and press play.`;
      blocks.push(para(opener));
      blocks.push(nextBlock(F, "Two-minute start"));
    } else {
      subject = `Morning block: ${plural(am.left.length, "lesson")} left. Finish it, then the afternoon.`;
      opener = `${d} of ${n} done, but the morning block isn't finished: ${plural(am.left.length, "lesson")}, ~${fmt(am.leftMin)} left in it. Close it out now, then the afternoon block (${plural(pm.lessons.length, "lesson")}, ~${fmt(pm.min)}).`;
      blocks.push(para(opener));
      blocks.push(progressBar(F));
      blocks.push(nextBlock(F));
    }
  } else if (d === 0 && !F.shownToday) {
    subject = `Today: ${plural(n, "lesson")}, ~${fmt(F.plan.targetMin)}, one sitting. Prime it now.`;
    opener = `Nothing is ticked yet, which is fine: today is one sitting (your plan: ${F.s.when} at ${F.s.where}). Prime it now so it starts at zero effort, and when you sit down, do all ${plural(n, "lesson")} in one go. First up: "${F.next?.title || "the next lesson"}".`;
    blocks.push(para(opener));
    blocks.push(nextBlock(F, "First up when you sit down"));
  } else {
    subject = `${d} of ${n} done. Same sitting: ${left} to go.`;
    opener = `You're in the middle of today's sitting: ${d} of ${n} lessons done, ${plural(left, "lesson")} left, about ${fmt(leftMin)}. Don't stop and promise to come back later. Finish all of it in one go.`;
    blocks.push(para(opener));
    blocks.push(progressBar(F));
    blocks.push(nextBlock(F));
  }
  if (!F.complete && F.mode !== "min") blocks.push(checklist(F, "Today so far", ctx));
  if (F.habits.open.length) blocks.push(habitsBlock(F));
  blocks.push(principleBlock(F, "midday", ctx.dayIndex));
  blocks.push(statsLine(F));
  blocks.push(button(F.complete ? "Close the day" : "Back to it", `${ctx.appUrl}/#today`));
  return wrap(subject, opener, blocks, footerFor(F, ctx));
}

function evening(F, ctx) {
  if (F.finished || F.rest) return null;
  const n = F.planLessons.length;
  const left = F.leftLessons.length;
  const leftMin = Math.max(0, F.plan.targetMin - F.doneMin);
  const blocks = [heading(hi(ctx, "Evening"))];
  const contract = !!F.signedDay;
  const tm = tomorrow(F, ctx.state);
  let subject;
  let opener;

  if (F.complete) {
    subject = `Day complete. Vote #${F.votes}. Chain at ${F.streak}.`;
    opener = F.mode === "min"
      ? "Minimum done on a bad day. You kept the chain and the identity. Tomorrow is a normal day."
      : `Every lesson on today's list is done: ${plural(F.doneToday.length, "lesson")}, about ${fmt(F.doneToday.reduce((a, l) => a + l.effort, 0))} of real work. That's a vote for "${F.s.identity}"`;
    blocks.push(para(opener));
    if (tm.plan.ids.length) {
      blocks.push(para(`Tomorrow: ${plural(tm.plan.ids.length, "lesson")}, about ${fmt(tm.plan.targetMin)}. First up: "${tm.first?.title}". Prime it tonight: leave it open and ready, so tomorrow starts at zero effort.`, { muted: true }));
    }
  } else if (!F.shownToday) {
    subject = F.streak > 0 ? `Your ${F.streak}-day chain breaks at midnight.` : "Nothing yet today. One lesson before bed.";
    const stake = F.missRun >= 1
      ? contract
        ? `Yesterday was a miss. If today is too, that's a contract breach and you owe ${F.partner?.name || "your partner"} ${money(F, Number(ctx.state.contract?.penaltyAmount) || 0)}.`
        : "Yesterday was a miss. Missing twice is how the old habit comes back."
      : "You don't lose a streak by doing too little. You lose it by doing nothing.";
    opener = `${stake} Do the minimum now: ${F.s.minimum}`;
    blocks.push(banner(opener, F.missRun >= 1 ? "bad" : "warn"));
    blocks.push(nextBlock(F, "Just this one"));
    blocks.push(para("Switch to bad-day mode in the app if you need to: one lesson counts for the chain, and the rest re-plans automatically. No debt, no guilt.", { muted: true }));
  } else {
    subject = `${left} left, ~${fmt(leftMin)}. Finish strong or bank the minimum.`;
    const where = F.sessions
      ? F.sessions.am.done
        ? " The morning block is done; what's left is the afternoon block."
        : ` The morning block still has ${plural(F.sessions.am.left.length, "lesson")} open.`
      : " The sitting stopped short of the end.";
    opener = `${F.planDone.length} of ${n} done, so the chain is safe.${where} ${plural(left, "lesson")} left, about ${fmt(leftMin)}. If you have it in you, finish the day in one go now. If not, stop cleanly; whatever is left re-plans into the coming days.`;
    blocks.push(para(opener));
    blocks.push(progressBar(F));
    blocks.push(nextBlock(F));
  }
  blocks.push(habitsBlock(F, F.habits.open.length ? "Habits: finish them before bed" : "Habits today"));
  const pr = pickPrinciple(F, "evening", ctx.dayIndex);
  blocks.push(principleHtml(pr, pr.action(F)));
  if (pr.id !== "review") blocks.push(para(`After ${F.s.stackAfter}, ${F.s.stackTrack}: rate energy, focus and calm, and write one win no number shows. 20 seconds.`, { muted: true }));
  blocks.push(paceBlock(F, tm.plan));
  blocks.push(statsLine(F));
  blocks.push(button(F.complete ? "Close the day" : F.shownToday ? "Finish today" : "Do one lesson now", `${ctx.appUrl}/#today${F.complete ? "/close" : ""}`));
  return wrap(subject, opener, blocks, footerFor(F, ctx));
}

// ---------- the partner report (the "second email")
//
// Sent each morning to PARTNER_EMAILS about yesterday, once the day is final.
// Atomic Habits: an accountability partner makes inaction immediately costly,
// because someone is watching. So this states facts, not spin: what happened,
// how many misses in a row, and what's owed under the contract.
//
// Fy: dayFacts for yesterday. F: dayFacts for today (for misses and debts).

export function composePartner(Fy, F, ctx) {
  const y = Fy.t;
  if (Fy.ctx.trackStart > y) return null;
  if (Fy.finishedOn && y > Fy.finishedOn) return null;
  if (Fy.rest && !Fy.shownToday) return null;

  const who = ctx.name || "Your friend";
  const day = dateLabel(y, { weekday: "short", month: "short", day: "numeric" });
  const n = Fy.planLessons.length;
  const lessons = Fy.doneToday.length;
  const minutes = Fy.doneToday.reduce((a, l) => a + l.effort, 0);
  const log = (ctx.state.dayLog || {})[y] || {};
  const ci = (ctx.state.checkins || {})[y] || {};
  const missed = !Fy.shownToday;
  const inARow = missed ? F.missRun : 0;

  let status;
  let short;
  let tone;
  if (missed) {
    tone = "bad";
    short = inARow >= 2 ? `❌ missed (${inARow} days in a row)` : "❌ missed";
    status = inARow >= 2
      ? `Missed. That's ${inARow} scheduled days in a row with nothing done. Missing twice is how a habit dies.`
      : "Missed. Nothing done on a scheduled day. Once is an accident; today decides if it's a pattern.";
  } else if (Fy.mode === "min") {
    tone = "warn";
    short = "🌧️ bad day, did the minimum";
    status = `Bad day, but showed up: did the minimum (${plural(lessons, "lesson")}). The chain held.`;
  } else if (Fy.complete) {
    tone = "good";
    short = `✅ 100%, ${plural(lessons, "lesson")}`;
    status = `Hit 100% of the plan: ${plural(lessons, "lesson")}, about ${fmt(minutes)} of real work.`;
  } else {
    tone = "good";
    short = `✅ ${Fy.planDone.length}/${n} planned`;
    const extra = lessons - Fy.planDone.length;
    status = `Showed up: ${Fy.planDone.length} of ${n} planned lessons (${Fy.pct}% of the day's work)${extra > 0 ? `, plus ${extra} extra` : ""}. Chain kept, plan not finished.`;
  }

  const blocks = [heading(`${who}'s check-in for ${day}`), banner(status, tone)];
  const facts = [
    `Chain: ${plural(missed ? 0 : Fy.streak, "day")} (best ${Fy.best})`,
    `${plural(Fy.shownUpDays, "day")} showed up so far`,
    F.plan.onTrack ? `On pace for ${dateLabel(F.s.deadline, { month: "short", day: "numeric" })}` : `Behind pace for ${dateLabel(F.s.deadline, { month: "short", day: "numeric" })}`,
  ];
  blocks.push(para(facts.join(" · "), { muted: true }));
  if (F.unpaid.length) {
    const p = F.partner?.name;
    blocks.push(banner(`Under their signed habit contract, ${who === "Your friend" ? "they" : who} owe${who === "Your friend" ? "" : "s"} ${p ? p : "their accountability partner"} ${money(F, F.owed)} for missing twice (${F.unpaid.map((d) => dateLabel(d, { month: "short", day: "numeric" })).join(", ")}). Not yet marked paid.`, "bad"));
  }
  if (Fy.habits?.due.length) {
    blocks.push(para(`Daily habits: ${Fy.habits.due.map((x) => `${x.h.name} ${x.status ? "✓" : "✗"}`).join(", ")} (${Fy.habits.done.length}/${Fy.habits.due.length}).`));
  }
  if (log.nsv) blocks.push(para(`Their win of the day: "${log.nsv}"`));
  const mood = ["energy", "focus", "calm"].filter((k) => ci[k]).map((k) => `${k} ${ci[k]}/5`);
  if (mood.length) blocks.push(para(`How they felt: ${mood.join(", ")}.`, { muted: true }));
  blocks.push(
    para(
      missed
        ? "What helps: a short message today. Not a lecture, just \"saw you missed, what's the plan for tonight?\" Knowing someone noticed is the whole point."
        : "What helps: a one-line reply. Being seen keeps the habit going.",
    )
  );
  const footer = `You're getting this because ${who === "Your friend" ? "a friend" : who} added you as an accountability partner in their Goals habit tracker (from Atomic Habits: someone watching makes skipping costly). Reply to reach them directly. To stop these, ask them to remove you.`;
  return wrap(`${ctx.name ? `${ctx.name}'s` : "Goals"} check-in, ${day}: ${short}`, status, blocks, footer);
}

// ---------- on demand: the "Send me motivation" button
//
// Pressed when you need a push right now. Built from this moment's record,
// not a canned quote: the one next action, what's left, why it matters, and
// a different Atomic Habits idea on every press (n = presses today, 1..8).

export function composeBoost(F, ctx, n = 1) {
  const notStarted = !F.shownToday && !F.finished && !F.rest;
  const pr = boostPrinciple(F, ctx.dayIndex, n, notStarted ? "two-minute" : undefined);
  const left = F.leftLessons.length;
  const leftMin = Math.max(0, F.plan.targetMin - F.doneMin);
  const daysLeft = P.diffDays(F.t, F.s.deadline) + 1;
  const first = F.next ? cut(F.next.title, 44) : "";
  const blocks = [heading(ctx.name ? `${ctx.name}, here's your push.` : "Here's your push.")];
  let subject;
  let opener;

  if (F.finished) {
    subject = "⚡ Both courses are done. Aim it at the olympiad.";
    opener = "The foundation is finished. Motivation now goes into what the courses didn't cover: PyTorch, CNNs, transformers. Pick one and start a 25-minute block.";
    blocks.push(para(opener));
  } else if (F.complete) {
    subject = "⚡ Today's already done. Here's what that's worth.";
    opener = `You finished today's plan: ${plural(F.planDone.length || F.doneToday.length, "lesson")}. The motivation you feel right now is the reward working. Either bank one more lesson to lighten tomorrow, or rest without guilt. Both are wins.`;
    blocks.push(para(opener));
  } else if (F.rest) {
    subject = "⚡ Rest day, but you've got energy. Use it.";
    opener = "Nothing is planned today, so anything you do now is pure gain: it comes straight off the rest of the month.";
    blocks.push(para(opener));
    blocks.push(nextBlock(F, "If you want to get ahead"));
  } else if (!F.shownToday) {
    subject = `⚡ Right now: open "${first}". Just 2 minutes.`;
    const scope = F.sessions
      ? `the morning block (${plural(F.sessions.am.lessons.length, "lesson")}, ~${fmt(F.sessions.am.min)})`
      : `all ${plural(F.planLessons.length, "lesson")}`;
    opener = `You asked for a push, so here it is: don't think about ${scope}. Open "${F.next?.title}" and press play. Two minutes. Motivation follows action, not the other way round.`;
    blocks.push(para(opener));
    blocks.push(nextBlock(F, "Start here, right now"));
  } else if (F.sessions && !F.sessions.am.done) {
    const { am } = F.sessions;
    subject = `⚡ Morning block: ${plural(am.left.length, "lesson")} left, ~${fmt(am.leftMin)}. Next: "${first}"`;
    opener = `You're ${F.pct}% through today. The morning block has ${plural(am.left.length, "lesson")} left, about ${fmt(am.leftMin)}. Close it out, and half the weekend day is banked.`;
    blocks.push(para(opener));
    blocks.push(progressBar(F));
    blocks.push(nextBlock(F));
  } else if (F.sessions) {
    subject = `⚡ Afternoon block: ${plural(left, "lesson")} left, ~${fmt(leftMin)}. Next: "${first}"`;
    opener = `Morning block done. ${plural(left, "lesson")} left in the afternoon block, about ${fmt(leftMin)}. Start it now, before the break turns into the rest of the day.`;
    blocks.push(para(opener));
    blocks.push(progressBar(F));
    blocks.push(nextBlock(F));
  } else {
    subject = `⚡ ${plural(left, "lesson")} left, ~${fmt(leftMin)}. Next: "${first}"`;
    opener = `You're ${F.pct}% through today: ${F.planDone.length} of ${F.planLessons.length} done, about ${fmt(leftMin)} to go. You've already done the hardest part, which is starting. Stay in the sitting and finish it in one go.`;
    blocks.push(para(opener));
    blocks.push(progressBar(F));
    blocks.push(nextBlock(F));
  }

  const why = [
    F.votes ? `Every lesson is a vote for "${F.s.identity}" You've cast ${F.votes}.` : `Every lesson is a vote for "${F.s.identity}" Cast your first one now.`,
    daysLeft > 0 && !F.finished ? `${plural(daysLeft, "day")} to ${dateLabel(F.s.deadline, { month: "short", day: "numeric" })}.` : "",
    F.streak > 0 ? `Your chain is at ${plural(F.streak, "day")}.` : "",
  ].filter(Boolean).join(" ");
  blocks.push(para(why, { muted: true }));
  blocks.push(principleHtml(pr, pr.action(F)));
  blocks.push(button(F.complete || F.finished ? "Open Goals" : "Start now", `${ctx.appUrl}/#today`));
  const footer = `You pressed "Send me motivation"${n > 1 ? ` (#${n} today)` : ""}. Based on progress synced ${ctx.syncedAt}.\n${ctx.appUrl}`;
  return wrap(subject, opener, blocks, footer);
}

// Every press that day gets a distinct idea, never the one this morning's
// email already taught. `prefer` (the two-minute rule when you haven't
// started) takes the first press; the rotation fills the rest.
export function boostPrinciple(F, dayIndex, n, prefer) {
  const morning = pickPrinciple(F, "morning", dayIndex).id;
  const lead = prefer && prefer !== morning ? [principle(prefer)] : [];
  const order = [...lead];
  for (let k = 0; k < PRINCIPLES.length; k++) {
    const pr = rotation(dayIndex + 11 + k, "boost");
    if (pr.id !== morning && pr.id !== prefer) order.push(pr);
  }
  return order[(n - 1) % order.length];
}

// ---------- your daily habits (js/dailyhabits.js)

const weekDots = (week) =>
  week.days.map((d) => (d.status ? "●" : d.sched ? (d.future ? "·" : "○") : " ")).join("");

// Today's habits as a checklist: done ones crossed off, open ones with the
// two-minute version so there's no excuse.
function habitsBlock(F, title = "Your habits today") {
  const due = F.habits?.due || [];
  if (!due.length) return block("", "");
  const head = `${title} · ${F.habits.done.length}/${due.length}`;
  const line = (x) =>
    x.status
      ? `${x.h.name}${x.status === "min" ? " (two-minute version)" : ""} · ${plural(x.streak, "day")} in a row`
      : `${x.h.name}${x.h.amount ? ` (${x.h.amount})` : ""}${x.h.time ? ` · ${x.h.time}` : ""} · bad day? ${x.h.twoMin}`;
  return block(
    `${head}:\n${due.map((x) => `${x.status ? "[x]" : "[ ]"} ${line(x)}${!x.status && x.missRun === 1 ? " · missed last time, never miss twice" : ""}`).join("\n")}`,
    `<div style="font-size:13px;font-weight:700;color:#111827;margin:0 0 8px">${esc(head)}</div>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:14px">
     ${due
       .map(
         (x) => `<tr><td width="22" valign="top" style="padding:5px 0;color:${x.status ? "#059669" : "#9ca3af"};font-weight:700">${x.status ? "✓" : "○"}</td>
         <td valign="top" style="padding:5px 0;line-height:1.4;color:${x.status ? "#9ca3af" : "#1f2937"}">${x.status ? `<s>${esc(x.h.name)}</s>` : `<b>${esc(x.h.name)}</b>${x.h.amount ? ` · ${esc(x.h.amount)}` : ""}${x.h.time ? ` · ${esc(x.h.time)}` : ""}`}
           ${x.status ? "" : `<div style="font-size:12px;color:#6b7280">Bad day? ${esc(x.h.twoMin)}. That still counts.${x.missRun === 1 ? ` <b style="color:#b91c1c">Missed last time: never miss twice.</b>` : x.missRun >= 2 ? ` <b style="color:#b91c1c">Missed ${x.missRun} in a row. Today breaks it.</b>` : ""}</div>`}</td>
         <td valign="top" align="right" style="padding:5px 0 5px 8px;color:#6b7280;font-size:12px;white-space:nowrap">🔥 ${x.streak}</td></tr>`
       )
       .join("")}
     </table>`
  );
}

function justDoneBlock(items) {
  if (!items?.length) return block("", "");
  const names = items.map(itemName);
  const t = `Just done: ${names.join(", ")}.`;
  return block(t, `<p style="margin:0 0 14px;font-size:14px;color:#065f46;font-weight:600">✓ ${esc(names.join(" · "))}</p>`);
}

const itemName = (e) => (e.kind === "lesson" ? `${COURSE[e.lesson.course]?.short || ""} ${e.lesson.label}: ${e.lesson.title}`.trim() : e.habit.name);

// Course rest day, or the courses are finished: the habits carry on.
function habitsOnly(slot, F, ctx) {
  const H = F.habits;
  if (!H?.due.length) return null;
  const foot = `Your daily habits, from progress synced ${ctx.syncedAt}.\n${ctx.appUrl}/#habits`;
  if (slot === "morning") {
    const subject = `Today's habits: ${H.due.map((x) => cut(x.h.name, 30)).join(", ")}`;
    const opener = `${plural(H.due.length, "habit")} today. Each one is a vote for who you're becoming. Start the first at its time and place, not "later".`;
    return wrap(subject, opener, [heading(hi(ctx, "Good morning")), para(opener), habitsBlock(F), button("Open your habits", `${ctx.appUrl}/#habits`)], foot);
  }
  if (slot === "evening" && H.open.length) {
    const subject = `${plural(H.open.length, "habit")} still open. Two minutes each, before bed.`;
    const opener = H.open.some((x) => x.missRun >= 1)
      ? "You missed one of these last time. Missing once is an accident; missing twice is the start of a new habit. Do the two-minute version now."
      : "The day isn't over. The two-minute version of each one still counts for the chain.";
    return wrap(subject, opener, [heading(hi(ctx, "Evening")), banner(opener, "warn"), habitsBlock(F, "Still open"), button("Tick them off", `${ctx.appUrl}/#habits`)], foot);
  }
  return null;
}

function weekBlock(x, title) {
  const w = x.week;
  const t = `${title}: ${w.done}/${w.scheduled} (${w.pct}%)  ${weekDots(w)}`;
  const cells = w.days
    .map((d) => {
      const bg = d.status ? "#10b981" : d.sched ? (d.future ? "#e5e7eb" : "#fecaca") : "#f9fafb";
      return `<td align="center" style="padding:2px"><div style="width:30px;height:30px;line-height:30px;border-radius:8px;background:${bg};color:${d.status ? "#fff" : "#6b7280"};font-size:11px;font-weight:700">${d.name[0]}</div></td>`;
    })
    .join("");
  return block(
    t,
    `<div style="font-size:13px;font-weight:700;color:#111827;margin:0 0 6px">${esc(title)} · ${w.done}/${w.scheduled}</div>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px"><tr>${cells}</tr></table>`
  );
}

// ---------- the moment you finish something
//
// One email per completion. Ticks synced together (e.g. offline, then back
// online) share one email so nothing is lost and the inbox isn't flooded.
// items: completionEvents() entries: { kind: "lesson", lesson } | { kind: "habit", habit, mode }

export function composeDone(F, items, ctx) {
  if (!items?.length) return null;
  const lessons = items.filter((e) => e.kind === "lesson");
  const habits = items.filter((e) => e.kind === "habit");
  const hx = (h) => F.habits.list.find((x) => x.h.id === h.id);
  const leftMin = Math.max(0, F.plan.targetMin - F.doneMin);
  const left = F.leftLessons.length;
  const blocks = [];
  let subject;
  let opener;

  if (items.length === 1 && habits.length === 1) {
    const e = habits[0];
    const x = hx(e.habit);
    const w = x?.week;
    subject = `✓ ${cut(e.habit.name, 40)}${e.mode === "min" ? " (two-minute version)" : ""}. ${x ? `${plural(x.streak, "day")} in a row` : "Done"}${w ? `, ${w.done}/${w.scheduled} this week` : ""}.`;
    opener = e.mode === "min"
      ? `Bad day, and you still showed up: the two-minute version counts. The chain holds at ${plural(x?.streak || 1, "day")}. Showing up on the bad days is what makes the habit yours.`
      : `Done. ${e.habit.identity ? `That's a vote for "${e.habit.identity}"` : "That's a vote for who you're becoming."} ${x && x.streak > 1 ? `${plural(x.streak, "day")} in a row (best ${x.best}).` : "Day one of a chain is the most important link."}`;
    blocks.push(heading(`✓ ${e.habit.name}`), para(opener));
    if (x) blocks.push(weekBlock(x, "This week"));
  } else if (items.length === 1) {
    const l = lessons[0].lesson;
    const inPlan = F.planLessons.some((p) => p.id === l.id);
    if (F.complete && inPlan) {
      subject = `✓ Day complete: ${plural(F.planDone.length, "lesson")} done. Chain at ${F.streak}.`;
      opener = `"${l.title}" was the last one. Today's plan is finished: about ${fmt(F.doneMin)} of real work. ${F.s.bundle ? `Reward unlocked: ${F.s.bundle}. Take it now.` : "That's a vote for who you're becoming."}`;
    } else if (!inPlan) {
      subject = `✓ Bonus: ${cut(l.title, 50)}. That lightens the coming days.`;
      opener = `"${l.title}" wasn't on today's list, so it comes straight off the rest of the plan.`;
    } else {
      subject = `✓ ${cut(l.title, 44)}. ${left} left today, ~${fmt(leftMin)}.`;
      opener = `${F.planDone.length} of ${F.planLessons.length} done. ${left === 1 ? "One lesson left: finish the day." : `${plural(left, "lesson")} to go, about ${fmt(leftMin)}. Stay in the sitting.`}`;
    }
    blocks.push(heading(`✓ ${l.title}`), para(opener));
    if (F.planLessons.length) blocks.push(progressBar(F));
    if (!F.complete) blocks.push(nextBlock(F, "Next, right now"));
  } else {
    subject = `✓ ${items.length} done: ${cut(items.map((e) => (e.kind === "lesson" ? e.lesson.label : e.habit.name)).join(", "), 70)}`;
    opener = `${plural(items.length, "thing")} finished and synced together. Every one of them counts.`;
    blocks.push(heading(`✓ ${items.length} done`), para(opener), justDoneBlock(items));
    if (lessons.length && F.planLessons.length) blocks.push(progressBar(F));
    if (lessons.length && !F.complete) blocks.push(nextBlock(F, "Next, right now"));
  }
  if (F.habits.open.length) blocks.push(habitsBlock(F));
  blocks.push(statsLine(F));
  blocks.push(button("Open Goals", `${ctx.appUrl}/#${lessons.length ? "today" : "habits"}`));
  const footer = `Sent because you just finished something. Every completion gets one of these.\n${ctx.appUrl}`;
  return wrap(subject, opener, blocks, footer);
}

// ---------- the moment you create a habit
//
// Creating a habit is the easy part. This email is the implementation plan,
// built from what you typed, law by law.

export function composeHabitNew(F, h, ctx) {
  const today = F.habits.list.find((x) => x.h.id === h.id);
  const startsToday = today?.sched;
  const firstDay = startsToday ? "today" : "on your next scheduled day";
  const subject = `New habit: ${cut(h.name, 50)}. Here's how to make it stick.`;
  const opener = `You just committed to "${h.name}". The commitment is the easy part. Here's the system that makes it happen ${firstDay}, and every scheduled day after.`;
  const steps = [
    ["1 · Make it obvious", `${h.after ? "The habit you already do is the cue, so there's nothing to remember." : "Same time, same place, every time, so there's nothing to decide."} Put what you need for it where you'll see it at that moment${h.place ? ` (${h.place})` : ""}. Tonight, not tomorrow.`],
    ["2 · Make it attractive", h.identity ? `Every time you do it you cast a vote for: "${h.identity}" You're not trying to do a habit; you're becoming the kind of person who does it.` : "Pair it with something you enjoy, and do it alongside people who already do it. Add an identity to the habit in the app: \"I am someone who ...\""],
    ["3 · Make it easy", `On a bad day, do the two-minute version: ${h.twoMin}. That still counts. The goal is to never miss, not to be perfect.`],
    ["4 · Make it satisfying", "Tick it in Goals the moment you finish. You'll get an email for every completion, a chain that grows, and a week score every Monday."],
  ];
  const blocks = [
    heading(`Here's your habit. Let's make it real.`),
    para(opener),
    block(
      `YOUR IMPLEMENTATION INTENTION\n${intention(h)}${h.after ? `\n${stack(h)}` : ""}`,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px"><tr><td style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:14px;padding:16px 18px">
        <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#4f46e5;font-weight:700">Your implementation intention</div>
        <div style="font-size:18px;font-weight:700;color:#111827;margin:6px 0 4px;line-height:1.35">${esc(intention(h))}</div>
        ${h.after ? `<div style="font-size:14px;color:#374151">${esc(stack(h))}</div>` : ""}
      </td></tr></table>`
    ),
    ...steps.map(([t, d]) =>
      block(`${t.toUpperCase()}\n${d}`, `<div style="margin:0 0 14px"><div style="font-size:13px;font-weight:800;color:#b45309">${esc(t)}</div><div style="font-size:14px;color:#1f2937;line-height:1.55">${esc(d)}</div></div>`)
    ),
    para(`The rule that matters most: never miss twice. Missing once is an accident. Missing twice is the start of a new habit, the one you don't want. If you miss, do the two-minute version the very next day.`, { muted: true }),
    para(startsToday ? `First rep: today${h.time ? ` at ${h.time}` : ""}. Do it, then tick it.` : `Scheduled ${daysLabel(h.days)}. First rep: the next one of those.`),
    button("Open your habits", `${ctx.appUrl}/#habits`),
  ];
  const footer = `Sent because you created this habit in Goals. Every scheduled day it shows up in your morning and evening emails.\n${ctx.appUrl}`;
  return wrap(subject, opener, blocks, footer);
}

// ---------- start of the week (Monday morning)
//
// Last week's honest scorecard, this week's plan, and the one habit to fix.

export function composeWeekly(F, ctx) {
  const H = F.habits;
  const blocks = [heading(hi(ctx, "New week"))];
  const last = H.lastWeek;
  const done = last.reduce((a, x) => a + x.week.done, 0);
  const sched = last.reduce((a, x) => a + x.week.scheduled, 0);
  const pct = sched ? Math.round((done / sched) * 100) : 0;
  let subject;
  let opener;
  if (!H.list.length) {
    subject = "New week. Put your habits in: one tap each.";
    opener = "You have no daily habits set yet. Pick the one to three that matter this week (Read Atomic Habits, your AP World History book, ...). Each one gets a time, a place and a two-minute version, and every completion is emailed to you.";
    blocks.push(para(opener), button("Add your habits", `${ctx.appUrl}/#habits/add`));
  } else {
    const weakest = [...last].sort((a, b) => a.week.pct - b.week.pct)[0];
    subject = last.length
      ? `Last week: ${done}/${sched} habit reps (${pct}%). This week: ${plural(H.list.length, "habit")}.`
      : `New week: ${plural(H.list.length, "habit")}. Here's the plan.`;
    opener = last.length
      ? pct >= 90
        ? `Last week you did ${done} of ${sched} scheduled reps. That's who you are now. Keep the same times and places; don't add more until this feels automatic.`
        : pct >= 60
          ? `Last week: ${done} of ${sched} reps. Good, not automatic yet. The gap is almost always the cue: fix the time and place of the weakest habit below.`
          : `Last week: ${done} of ${sched} reps. Honest number, and it's fixable. Make the habits smaller this week: do the two-minute version every day and protect the chain before the volume.`
      : "Your habits start their first full week today. The goal this week is simple: never miss twice.";
    blocks.push(para(opener));
    for (const x of last) blocks.push(weekBlock(x, x.h.name));
    if (weakest && weakest.week.pct < 100) {
      blocks.push(banner(`Fix this one first: ${weakest.h.name} (${weakest.week.done}/${weakest.week.scheduled}). ${intention(weakest.h)} If that time keeps failing, change it today in the app. Bad day? ${weakest.h.twoMin}.`, "warn"));
    }
    const plan = H.list.map((x) => `${x.h.name}: ${daysLabel(x.h.days)}${x.h.time ? ` at ${x.h.time}` : ""}${x.h.after ? `, after ${x.h.after}` : ""}`);
    blocks.push(block(`THIS WEEK\n${plan.join("\n")}`, `<div style="font-size:13px;font-weight:700;color:#111827;margin:0 0 8px">This week</div><ul style="margin:0 0 18px;padding-left:18px;font-size:14px;line-height:1.6;color:#1f2937">${plan.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`));
  }
  if (!F.finished && F.planLessons.length) blocks.push(paceBlock(F));
  if (H.list.length) blocks.push(button("Review your habits", `${ctx.appUrl}/#habits`));
  const footer = `Every Monday morning: last week's habit scorecard and this week's plan.\n${ctx.appUrl}`;
  return wrap(subject, opener, blocks, footer);
}
