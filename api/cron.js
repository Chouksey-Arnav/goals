// GET /api/cron
//
// Called by Vercel Cron every hour (see vercel.json). Sends whichever of the
// three daily emails is due in your time zone, at most once each per day.
//
// Manual use (needs the secret, as a header or ?key=):
//   /api/cron?slot=morning&dry=1&key=SECRET    preview the email in the browser
//   /api/cron?slot=evening&force=1&key=SECRET  send it now, ignoring "already sent"
//   /api/cron?status=1&key=SECRET              what's been sent today, and config check

import { timingSafeEqual } from "node:crypto";
import { config, missing, loadDay, sendSlot, buildEmail, json } from "./_lib/run.js";
import { slotsSent } from "./_lib/supabase.js";
import { dueSlot, windows } from "../js/schedule.js";

const SLOTS = ["morning", "midday", "evening"];

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
  if (gaps.length) return json(res, 500, { error: "Missing configuration.", missing: gaps });

  const q = new URL(req.url, "http://x").searchParams;
  const slotParam = q.get("slot");
  if (slotParam && !SLOTS.includes(slotParam)) return json(res, 400, { error: `slot must be one of ${SLOTS.join(", ")}` });

  try {
    const ctx = await loadDay(cfg);

    if (q.get("status")) {
      const sent = await slotsSent(cfg, cfg.to, ctx.day);
      return json(res, 200, {
        to: cfg.to, from: cfg.gmailUser, timeZone: cfg.tz, localDay: ctx.day, localHour: ctx.hour,
        windows: windows(cfg), sentToday: sent, due: dueSlot(ctx.hour, sent, cfg), problem: ctx.problem || null,
        today: ctx.F ? { lessons: ctx.F.planLessons.length, done: ctx.F.planDone.length, pct: ctx.F.pct, streak: ctx.F.streak } : null,
        syncedAt: ctx.syncedAt || null,
      });
    }

    if (q.get("dry")) {
      const slot = slotParam || "morning";
      if (ctx.problem) return json(res, 200, { slot, problem: ctx.problem, note: "No synced progress to build from yet." });
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

    let slot = slotParam;
    if (!slot) {
      const sent = await slotsSent(cfg, cfg.to, ctx.day);
      slot = dueSlot(ctx.hour, sent, cfg);
      if (!slot) return json(res, 200, { sent: false, reason: "nothing due this hour", localHour: ctx.hour });
    }
    const out = await sendSlot(cfg, ctx, slot, { force: !!q.get("force") });
    console.log(JSON.stringify({ at: new Date().toISOString(), day: ctx.day, hour: ctx.hour, ...out }));
    return json(res, 200, out);
  } catch (e) {
    console.error(e);
    return json(res, e.status && e.status < 600 ? e.status : 500, { error: String(e.message || e) });
  }
}
