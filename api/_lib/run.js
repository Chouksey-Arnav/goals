// Load your synced progress, decide, compose, claim, send.

import { config, missing } from "./env.js";
import * as DB from "./supabase.js";
import { sendMail, explainMailError } from "./mailer.js";
import { fetchAgenda } from "./calendar.js";
import { dayFacts, zonedParts, reachedHalfway, BY_ID } from "../../js/digest.js";
import { normalize } from "../../js/state.js";
import { compose, composePartner, composeDone, composeHabitNew, composeWeekly } from "../../js/emails.js";
import { completionEvents, newHabitEvents, isEventSlot } from "../../js/dailyhabits.js";
import { nudgeAllowed, isSchoolDay, workday, clockLabel } from "../../js/schedule.js";
import { workFacts, halftimeScore, halftimeWorth } from "../../js/worktime.js";
import { diffDays, addDays } from "../../js/planner.js";
import { TRACK_START } from "../../js/data.js";
import { reviewFacts, gradeDay, buildReviewMessages, checkReview, fallbackReview, composeReview, REVIEW_SCHEMA } from "../../js/review.js";
import { askGroq } from "./groq.js";

export { config, missing };

export function nowIn(cfg, at = new Date()) {
  return zonedParts(at, cfg.tz);
}

// Everything needed to write today's emails, or a clear reason why not.
export async function loadDay(cfg, at = new Date(), userId = null) {
  const { day, hour, min } = nowIn(cfg, at);
  // The schedule's clock: minutes since local midnight, and whether today
  // is a school day (work starts after school).
  const clock = { min, school: isSchoolDay(day) };
  let uid = userId;
  if (!uid) {
    const user = await DB.findUserByEmail(cfg, cfg.to);
    if (!user) return { day, hour, clock, problem: "no-user" };
    uid = user.id;
  }
  const row = await DB.loadProgress(cfg, uid);
  if (!row?.state) return { day, hour, clock, problem: "no-progress" };
  const state = normalize(row.state);
  const keyOf = (ms) => zonedParts(new Date(ms), cfg.tz).day;
  const F = dayFacts(state, day, keyOf);
  const synced = new Date(row.updated_at);
  const syncedAt = synced.toLocaleString("en-US", {
    timeZone: cfg.tz, weekday: "short", hour: "numeric", minute: "2-digit",
  });
  // Yesterday's facts, for the partner report.
  const Fy = dayFacts(state, addDays(day, -1), keyOf);
  return { day, hour, clock, state, F, Fy, syncedAt, userId: uid };
}

export function firstName(state, cfg) {
  if (cfg.name) return cfg.name;
  const signer = (state?.contract?.signer || "").trim();
  return signer ? signer.split(/\s+/)[0] : "";
}

// What every email composer gets besides the day's facts.
export function mailCtx(cfg, ctx) {
  return {
    name: firstName(ctx.state, cfg),
    appUrl: cfg.appUrl,
    syncedAt: ctx.syncedAt,
    dayIndex: diffDays(TRACK_START, ctx.day),
    state: ctx.state,
    middayHour: cfg.middayHour,
    // Today's calendar (calendar app), loaded by withAgenda for the morning email.
    agenda: ctx.agenda || null,
    workStart: clockLabel(workday(cfg, ctx.clock?.school ?? true).start),
    // The halftime email's numbers (withAgenda).
    work: ctx.work || null,
    halftime: ctx.halftime || null,
  };
}

// extra: { justDone } lists completions that rode along on this email.
export function buildEmail(cfg, slot, ctx, extra = {}) {
  if (slot === "review") return ctx.review?.mail || null;
  if (slot === "partner") return composePartner(ctx.Fy, ctx.F, { name: firstName(ctx.state, cfg), state: ctx.state });
  if (slot === "weekly") return composeWeekly(ctx.F, mailCtx(cfg, ctx));
  return compose(slot, ctx.F, { ...mailCtx(cfg, ctx), ...extra });
}

// The morning email lists today's calendar; the review judges it. Fetched
// only for those slots. The review is written here (it needs Groq, which is
// async) and buildEmail just picks it up.
export async function withAgenda(cfg, ctx, slot, io = {}) {
  if (["morning", "halftime", "review"].includes(slot) && !ctx.problem && ctx.agenda === undefined) ctx.agenda = await (io.agenda || fetchAgenda)(cfg, ctx.day);
  if (slot === "halftime" && !ctx.problem && ctx.halftime === undefined) {
    ctx.work = workFacts(ctx.F, ctx.agenda, cfg, { day: ctx.day, now: ctx.clock.min });
    ctx.halftime = halftimeScore(ctx.F, ctx.agenda);
  }
  if (slot === "review" && !ctx.problem && ctx.review === undefined) ctx.review = await writeReview(cfg, ctx, io);
  return ctx;
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The end-of-day review (js/review.js): facts and grade from the record,
// words from Groq, every line checked. Returns { mail, grade, facts, source,
// dropped, error } or { mail: null } when there's nothing to judge.
// io: { ask, agenda } swap Groq and the calendar for tests.
export async function writeReview(cfg, ctx, { ask = askGroq, agenda = fetchAgenda } = {}) {
  const tomorrowAgenda = await agenda(cfg, addDays(ctx.day, 1)).catch(() => null);
  const { facts, tomorrow } = reviewFacts(ctx.F, ctx.state, { agenda: ctx.agenda || null, tomorrowAgenda, syncedAt: ctx.syncedAt, cfg });
  const grade = gradeDay(facts);
  if (!grade) return { mail: null, facts, grade: null };
  const workStart = clockLabel(workday(cfg, isSchoolDay(addDays(ctx.day, 1))).start);
  let review = null;
  let error = null;
  let model = null;
  if (cfg.groqKey) {
    try {
      const weekday = WEEKDAY[new Date(`${ctx.day}T12:00:00Z`).getUTCDay()];
      const r = await ask(cfg, buildReviewMessages({ day: ctx.day, weekday, grade, facts, tomorrow, name: firstName(ctx.state, cfg), workStart }), REVIEW_SCHEMA);
      model = r.model;
      review = checkReview(r.json, { facts, grade, tomorrow });
      if (!review) error = "Groq's answer didn't survive the checks (no usable verdict).";
    } catch (e) {
      error = e.message;
      console.error("Review: Groq failed, writing it from the record:", e.message);
    }
  }
  if (!review) review = fallbackReview({ facts, grade, workStart });
  const mail = composeReview(review, grade, { day: ctx.day, appUrl: cfg.appUrl, calendarUrl: ctx.agenda?.appUrl || cfg.calendarUrl });
  return { mail, grade, facts, source: review.source, model, dropped: review.dropped, error };
}

// When there's no data to work from, say so once a morning instead of going
// silent: silence looks exactly like "the system works and I'm fine".
export function setupEmail(cfg, problem) {
  const why =
    problem === "no-user"
      ? `No account exists yet for ${cfg.to}.`
      : `${cfg.to} has an account, but no progress has synced yet.`;
  const text = `${why}\n\nYour daily emails are built from your synced progress. Open ${cfg.appUrl}/#settings, sign in with ${cfg.to} (you'll get a 6-digit code), and tick one lesson. Tomorrow's emails will have your real plan.`;
  return {
    subject: "Goals: sign in once so your daily emails can see your progress",
    text,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;max-width:520px">
      <p>${why}</p><p>Your daily emails are built from your synced progress. Open <a href="${cfg.appUrl}/#settings">Settings</a>, sign in with <b>${cfg.to}</b> (you'll get a 6-digit code), and tick one lesson. Tomorrow's emails will have your real plan.</p></div>`,
  };
}

// Who gets each slot. Your three emails go to you, with EMAIL_CC as BCC.
// The partner report goes to PARTNER_EMAILS only, all BCC with no To, so
// partners never see each other's addresses and your inbox stays at three.
export function addressing(cfg, slot) {
  if (slot === "partner") return cfg.partners.length ? { to: undefined, bcc: cfg.partners } : null;
  return { to: cfg.to, bcc: cfg.cc };
}

// Claim the slot, send, record. Returns a small report for logs and the API.
export async function sendSlot(cfg, ctx, slot, { force = false } = {}) {
  const addr = addressing(cfg, slot);
  if (!addr) return { slot, sent: false, reason: "PARTNER_EMAILS is empty" };
  // Checked before fetching anything: the minute clock asks every minute.
  if (slot === "halftime" && !ctx.problem && !halftimeWorth(ctx.F)) return { slot, sent: false, reason: "everything is already done" };
  if (slot === "halftime" && ctx.problem) return { slot, sent: false, reason: ctx.problem };
  await withAgenda(cfg, ctx, slot);
  const mail = ctx.problem ? (slot === "morning" ? setupEmail(cfg, ctx.problem) : null) : buildEmail(cfg, slot, ctx);
  if (!mail) return { slot, sent: false, reason: ctx.problem || "nothing worth sending (rest day, before tracking, or finished)" };
  // The sign-in reminder is for you only, never for copies or partners.
  if (ctx.problem) addr.bcc = [];
  if (!force) {
    const mine = await DB.claimSlot(cfg, cfg.to, ctx.day, slot);
    if (!mine) return { slot, sent: false, reason: "already sent today" };
  }
  let id;
  try {
    id = await sendMail(cfg, { ...addr, ...mail });
  } catch (e) {
    // Not sent: give the claim back so the next hourly run retries.
    if (!force) await DB.releaseSlot(cfg, cfg.to, ctx.day, slot).catch(() => {});
    const err = new Error(explainMailError(e));
    err.status = 502;
    throw err;
  }
  // Sent. The claim row already blocks a resend, so a failed bookkeeping
  // write must never release it (that would email you twice).
  if (!force) {
    await DB.markSent(cfg, cfg.to, ctx.day, slot, { sent_at: new Date().toISOString(), subject: mail.subject.slice(0, 200) })
      .catch((e) => console.error("Sent, but could not record sent_at:", e.message));
  }
  return { slot, sent: true, subject: mail.subject, recipients: (addr.to ? 1 : 0) + addr.bcc.length, messageId: id };
}

// ---------- emails triggered by doing things
//
// Every lesson ticked today, every habit done today and every habit created
// today gets an email, exactly once, decided from the database (never from
// what the app claims). Called by POST /api/notify right after a sync, and
// by every hourly cron run as a catch-up, so a dropped request costs at most
// an hour, not the email.
//
// - A new habit: its own "here's how to make it stick" email.
// - Completions: one email for whatever finished since the last one (usually
//   exactly one thing). If that same moment also earns the midday email
//   (weekend morning block done, or the whole day done), the completions
//   ride on the midday email instead of arriving as a second one.
// - At most MAX_EVENT_ROWS completions/new habits a day, so a stuck client
//   or a stolen session can't burn through Gmail's daily sending limit.

export const MAX_EVENT_ROWS = 60;

// io: { db, send } swaps the database and Gmail for tests.
export async function sendEvents(cfg, ctx, { midday = true, io = { db: DB, send: sendMail } } = {}) {
  if (ctx.problem) return [];
  const { db } = io;
  const sent = await db.slotsSent(cfg, cfg.to, ctx.day);
  const used = Object.keys(sent).filter(isEventSlot).length;
  if (used >= MAX_EVENT_ROWS) return [{ slot: "events", sent: false, reason: `daily cap of ${MAX_EVENT_ROWS} reached` }];
  const addr = addressing(cfg, "morning");
  const mctx = mailCtx(cfg, ctx);
  const results = [];

  for (const ev of newHabitEvents(ctx.state, ctx.day).filter((e) => !sent[e.slot]).slice(0, 5)) {
    if (!(await db.claimSlot(cfg, cfg.to, ctx.day, ev.slot))) continue;
    results.push(await sendClaimed(cfg, ctx.day, [ev.slot], composeHabitNew(ctx.F, ev.habit, mctx), addr, io));
  }

  const pending = completionEvents(ctx.state, ctx.day, BY_ID)
    .filter((e) => !sent[e.slot])
    .slice(0, MAX_EVENT_ROWS - used);
  const middayNow = midday && reachedHalfway(ctx.F) && nudgeAllowed(ctx.clock, sent, cfg);
  if (!pending.length && !middayNow) return results;
  // Claim first: whoever inserts the row sends. A racing run skips what it lost.
  const mine = [];
  for (const e of pending) if (await db.claimSlot(cfg, cfg.to, ctx.day, e.slot)) mine.push(e);
  const withMidday = middayNow && (await db.claimSlot(cfg, cfg.to, ctx.day, "midday"));
  const middayMail = withMidday ? buildEmail(cfg, "midday", ctx, { justDone: mine }) : null;
  if (withMidday && !middayMail) await db.releaseSlot(cfg, cfg.to, ctx.day, "midday").catch(() => {});
  const mail = middayMail || composeDone(ctx.F, mine, mctx);
  if (!mail) return results; // nothing claimed that needs sending
  const slots = [...mine.map((e) => e.slot), ...(middayMail ? ["midday"] : [])];
  results.push(await sendClaimed(cfg, ctx.day, slots, mail, addr, io));
  return results;
}

// Send for slots this run already claimed. Failure gives every claim back so
// the next run retries; success marks every one sent. Never throws.
async function sendClaimed(cfg, day, slots, mail, addr, { db, send }) {
  try {
    const id = await send(cfg, { ...addr, ...mail });
    for (const slot of slots) {
      await db.markSent(cfg, cfg.to, day, slot, { sent_at: new Date().toISOString(), subject: mail.subject.slice(0, 200) })
        .catch((e) => console.error(`Sent, but could not record ${slot}:`, e.message));
    }
    return { slot: slots.length === 1 ? slots[0] : slots, sent: true, subject: mail.subject, recipients: 1 + addr.bcc.length, messageId: id };
  } catch (e) {
    for (const slot of slots) await db.releaseSlot(cfg, cfg.to, day, slot).catch(() => {});
    return { slot: slots.length === 1 ? slots[0] : slots, sent: false, error: explainMailError(e) };
  }
}

// When the automated emails can't go out (database down, a key revoked, a
// permission missing), say so by email instead of failing silently in a log
// nobody reads. Sent only on runs at the start of a window (morning, midday,
// evening hour), so an outage costs at most three alerts a day, and each one
// lines up with an email you should have had. Gmail itself failing can't be
// reported this way; that's what /api/cron?status=1 is for.
export function isAlertHour(cfg, hour) {
  return [cfg.morningHour, cfg.middayHour, cfg.eveningHour, cfg.reviewHour].includes(hour);
}

export async function sendAlert(cfg, { day, hour, errors }) {
  const lines = errors.map((e) => `- ${e}`).join("\n");
  const text = `Your automated Goals emails failed at ${hour}:00 on ${day}. The next hourly run retries on its own.\n\n${lines}\n\nCheck: ${cfg.appUrl}/api/cron?status=1&key=YOUR_CRON_SECRET`;
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  try {
    await sendMail(cfg, {
      to: cfg.to,
      subject: "Goals: your daily emails are failing",
      text,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;max-width:560px">
        <p>Your automated Goals emails failed at <b>${hour}:00</b> on ${day}. The next hourly run retries on its own.</p>
        <pre style="white-space:pre-wrap;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px;font-size:13px">${esc(lines)}</pre>
        <p style="font-size:13px;color:#6b7280">Check status: ${esc(cfg.appUrl)}/api/cron?status=1&amp;key=YOUR_CRON_SECRET</p></div>`,
    });
    return true;
  } catch (e) {
    console.error("Could not send the failure alert either:", explainMailError(e));
    return false;
  }
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body, null, 2));
}
