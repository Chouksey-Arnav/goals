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
import { LAW_NAMES, pickPrinciple, fmtMinutes as fmt } from "./principles.js";
import { LESSONS } from "./digest.js";
import { plannable } from "./data.js";

const COURSE = Object.fromEntries(COURSES.map((c) => [c.id, c]));
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dateLabel = (k, opts = { weekday: "long", month: "long", day: "numeric" }) =>
  P.parseKey(k).toLocaleDateString("en-US", opts);
const weekday = (k) => dateLabel(k, { weekday: "long" });

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

function checklist(F, title = "Today's checklist") {
  if (!F.planLessons.length) return block("", "");
  const done = (l) => F.planDone.includes(l);
  const rows = F.planLessons.map((l) => ({ l, ok: done(l), c: COURSE[l.course] }));
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
export function compose(slot, F, ctx) {
  if (slot === "morning") return morning(F, ctx);
  if (slot === "midday") return midday(F, ctx);
  if (slot === "evening") return evening(F, ctx);
  throw new Error(`Unknown slot: ${slot}`);
}

function footerFor(F, ctx) {
  return [
    `Based on progress synced ${ctx.syncedAt}. Tick lessons while signed in so these stay accurate.`,
    "Three emails a day: a morning plan, a check-in the moment you hit halfway (or mid-afternoon), and an evening wrap.",
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
  } else {
    subject = `${weekday(F.t)}: ${plural(n, "lesson")}, ~${time}. Start with "${first}"`;
    opener = F.streak > 0
      ? `Your chain is at ${plural(F.streak, "day")}. Today is ${plural(n, "lesson")}, about ${time} of real work. Get all of it done today. You've got this.`
      : `Today is ${plural(n, "lesson")}, about ${time} of real work. Day one of a chain is the most important link. Get all of it done today. You've got this.`;
  }

  blocks.unshift(heading(hi(ctx, "Good morning")));
  blocks.push(para(opener));
  if (!F.complete) blocks.push(nextBlock(F));
  if (F.planDone.length) blocks.push(progressBar(F));
  if (F.mode !== "min") blocks.push(checklist(F));
  blocks.push(para(`The plan: ${F.s.when} at ${F.s.where}. Math first while your brain is fresh, then code. Solve first means attempt it before the answer.`, { muted: true }));
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
  const blocks = [heading(hi(ctx, "Check-in"))];
  let subject;
  let opener;

  if (F.complete) {
    subject = F.mode === "min" ? "Minimum done. Chain intact." : `Day complete. ${F.s.bundle ? `Reward unlocked: ${cut(F.s.bundle, 40)}` : `${F.streak}-day chain.`}`;
    opener = F.mode === "min"
      ? "You showed up on a bad day. That matters more than a perfect day you skipped."
      : `All ${plural(n, "lesson")} done, ${fmt(F.doneMin)} of real work. ${F.s.bundle ? `Take your reward now, while it still means something: ${F.s.bundle}.` : "Pick a reward in Settings so tomorrow's 100% pays out."}`;
    blocks.push(para(opener));
    blocks.push(para("Anything more today is a bonus that lightens the rest of the month. Rest is also a fine answer.", { muted: true }));
  } else if (d === 0 && !F.shownToday) {
    subject = `0 of ${n} done. Two minutes, that's all.`;
    opener = `Nothing is ticked yet today. No lecture: just open "${F.next?.title || "the next lesson"}" and press play. Starting is the hard part; continuing is easy.`;
    blocks.push(para(opener));
    blocks.push(nextBlock(F, "Two-minute start"));
  } else if (d * 2 >= n || F.pct >= 50) {
    subject = `Halfway. ${d} down, ${left} to go. You've got this.`;
    opener = `${d} of ${n} lessons done. ${plural(left, "lesson")} left, about ${fmt(leftMin)}. You're past the hardest part of any day, which is starting. Finish it.`;
    blocks.push(para(opener));
    blocks.push(progressBar(F));
    blocks.push(nextBlock(F));
  } else {
    subject = `${d} of ${n} done. ${left} to go.`;
    opener = `You're moving: ${d} of ${n} lessons done. ${plural(left, "lesson")} left, about ${fmt(leftMin)}. Keep the next one small and immediate.`;
    blocks.push(para(opener));
    blocks.push(progressBar(F));
    blocks.push(nextBlock(F));
  }
  if (!F.complete && F.mode !== "min") blocks.push(checklist(F, "Today so far"));
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
    opener = `${F.planDone.length} of ${n} done, so the chain is safe. ${plural(left, "lesson")} left, about ${fmt(leftMin)}. If you have it in you, finish the day. If not, stop cleanly; whatever is left re-plans into the coming days.`;
    blocks.push(para(opener));
    blocks.push(progressBar(F));
    blocks.push(nextBlock(F));
  }
  const pr = pickPrinciple(F, "evening", ctx.dayIndex);
  blocks.push(principleHtml(pr, pr.action(F)));
  if (pr.id !== "review") blocks.push(para(`After ${F.s.stackAfter}, ${F.s.stackTrack}: rate energy, focus and calm, and write one win no number shows. 20 seconds.`, { muted: true }));
  blocks.push(paceBlock(F, tm.plan));
  blocks.push(statsLine(F));
  blocks.push(button(F.complete ? "Close the day" : F.shownToday ? "Finish today" : "Do one lesson now", `${ctx.appUrl}/#today${F.complete ? "/close" : ""}`));
  return wrap(subject, opener, blocks, footerFor(F, ctx));
}
