// Load your synced progress, decide, compose, claim, send.

import { config, missing } from "./env.js";
import * as DB from "./supabase.js";
import { sendMail, explainMailError } from "./mailer.js";
import { dayFacts, zonedParts } from "../../js/digest.js";
import { normalize } from "../../js/state.js";
import { compose, composePartner } from "../../js/emails.js";
import { diffDays, addDays } from "../../js/planner.js";
import { TRACK_START } from "../../js/data.js";

export { config, missing };

export function nowIn(cfg, at = new Date()) {
  return zonedParts(at, cfg.tz);
}

// Everything needed to write today's emails, or a clear reason why not.
export async function loadDay(cfg, at = new Date(), userId = null) {
  const { day, hour } = nowIn(cfg, at);
  let uid = userId;
  if (!uid) {
    const user = await DB.findUserByEmail(cfg, cfg.to);
    if (!user) return { day, hour, problem: "no-user" };
    uid = user.id;
  }
  const row = await DB.loadProgress(cfg, uid);
  if (!row?.state) return { day, hour, problem: "no-progress" };
  const state = normalize(row.state);
  const keyOf = (ms) => zonedParts(new Date(ms), cfg.tz).day;
  const F = dayFacts(state, day, keyOf);
  const synced = new Date(row.updated_at);
  const syncedAt = synced.toLocaleString("en-US", {
    timeZone: cfg.tz, weekday: "short", hour: "numeric", minute: "2-digit",
  });
  // Yesterday's facts, for the partner report.
  const Fy = dayFacts(state, addDays(day, -1), keyOf);
  return { day, hour, state, F, Fy, syncedAt, userId: uid };
}

export function firstName(state, cfg) {
  if (cfg.name) return cfg.name;
  const signer = (state?.contract?.signer || "").trim();
  return signer ? signer.split(/\s+/)[0] : "";
}

export function buildEmail(cfg, slot, ctx) {
  if (slot === "partner") return composePartner(ctx.Fy, ctx.F, { name: firstName(ctx.state, cfg), state: ctx.state });
  return compose(slot, ctx.F, {
    name: firstName(ctx.state, cfg),
    appUrl: cfg.appUrl,
    syncedAt: ctx.syncedAt,
    dayIndex: diffDays(TRACK_START, ctx.day),
    state: ctx.state,
    middayHour: cfg.middayHour,
  });
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

// When the automated emails can't go out (database down, a key revoked, a
// permission missing), say so by email instead of failing silently in a log
// nobody reads. Sent only on runs at the start of a window (morning, midday,
// evening hour), so an outage costs at most three alerts a day, and each one
// lines up with an email you should have had. Gmail itself failing can't be
// reported this way; that's what /api/cron?status=1 is for.
export function isAlertHour(cfg, hour) {
  return [cfg.morningHour, cfg.middayHour, cfg.eveningHour].includes(hour);
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
