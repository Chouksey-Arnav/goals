// GET /api/cron
//
// Called by Vercel Cron every hour (see vercel.json). Sends whichever of the
// three daily emails is due in your time zone, at most once each per day.
//
// Manual use (needs the secret, as a header or ?key=):
//   /api/cron?slot=morning&dry=1&key=SECRET    preview the email in the browser
//                                              (slot=partner previews the partner report)
//   /api/cron?slot=evening&force=1&key=SECRET  send it now, ignoring "already sent"
//   /api/cron?status=1&key=SECRET              what's been sent today, and config check

import { timingSafeEqual } from "node:crypto";
import { config, missing, loadDay, sendSlot, buildEmail, withAgenda, json, nowIn, isAlertHour, sendAlert } from "./_lib/run.js";
import { slotsSent } from "./_lib/supabase.js";
import { dueSlots, windows } from "../js/schedule.js";

const SLOTS = ["morning", "midday", "evening", "partner"];

function authorized(req, secret) {
  if (!secret) return false;
  const url = new URL(req.url, "http://x");
  const given = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("key") || "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  const cfg = config();
  const gaps = missing(cfg, ["mail", "db", "cron"]);
  if (!cfg.cronSecret) return json(res, 500, { error: "CRON_SECRET is not set.", missing: gaps });
  if (!authorized(req, cfg.cronSecret)) return json(res, 401, { error: "Unauthorized." });
  const q = new URL(req.url, "http://x").searchParams;
  // Only the scheduled runs alert; a manual ?slot= or ?status= call shows the error itself.
  const scheduled = !q.get("slot") && !q.get("status") && !q.get("dry");
  const alert = async (errors) => {
    try {
      const { day, hour } = nowIn(cfg);
      if (scheduled && isAlertHour(cfg, hour)) await sendAlert(cfg, { day, hour, errors });
    } catch (e) {
      console.error("Alert skipped:", e.message);
    }
  };
  if (gaps.length) {
    if (cfg.gmailUser && cfg.gmailPass) await alert([`Missing or invalid configuration: ${gaps.join(", ")}`]);
    return json(res, 500, { error: "Missing configuration.", missing: gaps });
  }

  const slotParam = q.get("slot");
  if (slotParam && !SLOTS.includes(slotParam)) return json(res, 400, { error: `slot must be one of ${SLOTS.join(", ")}` });

  try {
    const ctx = await loadDay(cfg);

    if (q.get("status")) {
      const sent = await slotsSent(cfg, cfg.to, ctx.day);
      return json(res, 200, {
        to: cfg.to, from: cfg.gmailUser, copies: cfg.cc.length, partners: cfg.partners.length, warnings: cfg.warnings,
        timeZone: cfg.tz, localDay: ctx.day, localHour: ctx.hour, windows: windows(cfg), sentToday: sent,
        due: dueSlots(ctx.hour, sent, cfg, { partners: cfg.partners.length > 0 }), problem: ctx.problem || null,
        today: ctx.F ? { lessons: ctx.F.planLessons.length, done: ctx.F.planDone.length, pct: ctx.F.pct, streak: ctx.F.streak } : null,
        syncedAt: ctx.syncedAt || null,
      });
    }

    if (q.get("dry")) {
      const slot = slotParam || "morning";
      if (ctx.problem) return json(res, 200, { slot, problem: ctx.problem, note: "No synced progress to build from yet." });
      await withAgenda(cfg, ctx, slot);
      const mail = buildEmail(cfg, slot, ctx);
      if (!mail) return json(res, 200, { slot, note: "This email would not be sent today (rest day or finished)." });
      res.statusCode = 200;
      res.setHeader("Cache-Control", "no-store");
      if (q.get("format") === "text") {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.end(`Subject: ${mail.subject}\n\n${mail.text}`);
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(mail.html.replace("<body", `<body data-subject="${mail.subject.replace(/"/g, "&quot;")}"`));
    }

    if (cfg.warnings.length) console.warn(JSON.stringify({ warnings: cfg.warnings }));
    let slots = slotParam ? [slotParam] : null;
    if (!slots) {
      const sent = await slotsSent(cfg, cfg.to, ctx.day);
      slots = dueSlots(ctx.hour, sent, cfg, { partners: cfg.partners.length > 0 });
      if (!slots.length) return json(res, 200, { sent: false, reason: "nothing due this hour", localHour: ctx.hour, warnings: cfg.warnings });
    }
    // One failing email must not stop the others in the same run.
    const results = [];
    for (const slot of slots) {
      try {
        results.push(await sendSlot(cfg, ctx, slot, { force: !!q.get("force") }));
      } catch (e) {
        results.push({ slot, sent: false, error: String(e.message || e) });
      }
    }
    console.log(JSON.stringify({ at: new Date().toISOString(), day: ctx.day, hour: ctx.hour, results }));
    const failed = results.some((r) => r.error);
    if (failed) await alert(results.filter((r) => r.error).map((r) => `${r.slot} email: ${r.error}`));
    return json(res, failed ? 502 : 200, slotParam ? results[0] : { results, warnings: cfg.warnings });
  } catch (e) {
    console.error(e);
    await alert([String(e.message || e)]);
    return json(res, e.status && e.status < 600 ? e.status : 500, { error: String(e.message || e) });
  }
}
