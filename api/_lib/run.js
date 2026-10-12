// Load your synced progress, decide, compose, claim, send.

import { config, missing } from "./env.js";
import * as DB from "./supabase.js";
import { sendMail, explainMailError } from "./mailer.js";
import { dayFacts, zonedParts } from "../../js/digest.js";
import { normalize } from "../../js/state.js";
import { compose } from "../../js/emails.js";
import { diffDays } from "../../js/planner.js";
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
  return { day, hour, state, F, syncedAt, userId: uid };
}

function firstName(state, cfg) {
  if (cfg.name) return cfg.name;
  const signer = (state?.contract?.signer || "").trim();
  return signer ? signer.split(/\s+/)[0] : "";
}

export function buildEmail(cfg, slot, ctx) {
  return compose(slot, ctx.F, {
    name: firstName(ctx.state, cfg),
    appUrl: cfg.appUrl,
    syncedAt: ctx.syncedAt,
    dayIndex: diffDays(TRACK_START, ctx.day),
    state: ctx.state,
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

// Claim the slot, send, record. Returns a small report for logs and the API.
export async function sendSlot(cfg, ctx, slot, { force = false } = {}) {
  const mail = ctx.problem ? (slot === "morning" ? setupEmail(cfg, ctx.problem) : null) : buildEmail(cfg, slot, ctx);
  if (!mail) return { slot, sent: false, reason: ctx.problem || "nothing worth sending (rest day or finished)" };
  if (!force) {
    const mine = await DB.claimSlot(cfg, cfg.to, ctx.day, slot);
    if (!mine) return { slot, sent: false, reason: "already sent today" };
  }
  let id;
  try {
    id = await sendMail(cfg, { to: cfg.to, ...mail });
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
  return { slot, sent: true, subject: mail.subject, messageId: id };
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body, null, 2));
}
