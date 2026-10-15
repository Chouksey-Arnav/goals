// GET /api/cron
//
// Called every minute by Supabase pg_cron (?src=db, with the calendar's
// shared secret; see supabase/migrations/20261015000100_goals_tick.sql) and
// every hour by Vercel Cron as the backup (vercel.json). Sends whichever
// daily email is due in your time zone, at most once each per day (plus the
// partner report, and the weekly kickoff on Mondays). Every run also catches
// up on completion and new-habit emails the app's own /api/notify call
// missed (see sendEvents in api/_lib/run.js).
//
// Manual use (needs the secret, as a header or ?key=):
//   /api/cron?slot=morning&dry=1&key=SECRET    preview the email in the browser
//                                              (also slot=review, partner, weekly, done, new)
//   /api/cron?slot=review&dry=1&format=json&key=SECRET   the review's facts,
//                                              grade, and which Groq lines were dropped
//   /api/cron?slot=evening&force=1&key=SECRET  send it now, ignoring "already sent"
//   /api/cron?status=1&key=SECRET              what's been sent today, and config check

import { timingSafeEqual } from "node:crypto";
import { config, missing, loadDay, sendSlot, sendEvents, buildEmail, mailCtx, withAgenda, json, nowIn, isAlertHour, sendAlert } from "./_lib/run.js";
import { slotsSent } from "./_lib/supabase.js";
import { providers } from "./_lib/mailer.js";
import { dueSlots, windows, clockLabel, DAY_MIN } from "../js/schedule.js";
import { BY_ID } from "../js/digest.js";
import { completionEvents, newHabitEvents, isEventSlot, dowOf } from "../js/dailyhabits.js";
import { composeDone, composeHabitNew } from "../js/emails.js";

const SLOTS = ["morning", "midday", "halftime", "evening", "review", "partner", "weekly"];
// Preview only (?dry=1): today's completion email and the newest habit's plan.
const PREVIEWS = ["done", "new"];

// Slots due this run, given what's been sent today.
const due = (cfg, ctx, sent) => dueSlots(ctx.clock, sent, cfg, { partners: cfg.partners.length > 0, weekStart: dowOf(ctx.day) === 0 });

function preview(cfg, slot, ctx) {
  if (slot === "done") return composeDone(ctx.F, completionEvents(ctx.state, ctx.day, BY_ID).slice(-1), mailCtx(cfg, ctx));
  if (slot === "new") {
    const h = [...(ctx.state.habits || [])].sort((a, b) => b.createdAt - a.createdAt)[0];
    return h ? composeHabitNew(ctx.F, h, mailCtx(cfg, ctx)) : null;
  }
  return buildEmail(cfg, slot, ctx);
}

const given = (req) => (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || new URL(req.url, "http://x").searchParams.get("key") || "";
function same(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// CRON_SECRET can do everything. The calendar's secret (CALENDAR_SECRET,
// which the database already holds for its own minute job) may only trigger
// a plain scheduled run: no previews, no force, no status.
export function authorized(req, cfg) {
  const key = given(req);
  if (same(key, cfg.cronSecret)) return true;
  const q = new URL(req.url, "http://x").searchParams;
  const plain = q.get("src") === "db" && !["slot", "status", "dry", "force", "format"].some((k) => q.has(k));
  return plain && same(key, cfg.calendarSecret);
}

export default async function handler(req, res) {
  const cfg = config();
  const gaps = missing(cfg, ["mail", "db", "cron"]);
  if (!cfg.cronSecret) return json(res, 500, { error: "CRON_SECRET is not set.", missing: gaps });
  if (!authorized(req, cfg)) return json(res, 401, { error: "Unauthorized." });
  const q = new URL(req.url, "http://x").searchParams;
  // Only the scheduled runs alert; a manual ?slot= or ?status= call shows the error itself.
  const scheduled = !q.get("slot") && !q.get("status") && !q.get("dry");
  // ...and only the hourly Vercel runs: the minute clock would send an alert
  // every minute of an outage. The hourly run reports the same failure.
  const alerting = scheduled && q.get("src") !== "db";
  const alert = async (errors) => {
    try {
      const { day, hour } = nowIn(cfg);
      if (alerting && isAlertHour(cfg, hour)) await sendAlert(cfg, { day, hour, errors });
    } catch (e) {
      console.error("Alert skipped:", e.message);
    }
  };
  if (gaps.length) {
    if (providers(cfg).length) await alert([`Missing or invalid configuration: ${gaps.join(", ")}`]);
    return json(res, 500, { error: "Missing configuration.", missing: gaps });
  }

  const slotParam = q.get("slot");
  const dry = !!q.get("dry");
  if (slotParam && !SLOTS.includes(slotParam) && !(dry && PREVIEWS.includes(slotParam)))
    return json(res, 400, { error: `slot must be one of ${SLOTS.join(", ")}${dry ? `, ${PREVIEWS.join(", ")}` : ""}` });

  try {
    const ctx = await loadDay(cfg);

    if (q.get("status")) {
      const sent = await slotsSent(cfg, cfg.to, ctx.day);
      return json(res, 200, {
        to: cfg.to, from: providers(cfg).map((p) => `${p.name} <${p.from}>`), copies: cfg.cc.length, partners: cfg.partners.length, warnings: cfg.warnings,
        timeZone: cfg.tz, localDay: ctx.day, localTime: clockLabel(ctx.clock.min), schoolDay: ctx.clock.school,
        windows: Object.fromEntries(Object.entries(windows(cfg, ctx.clock)).map(([k, [a, b]]) => [k, a < b ? `${clockLabel(a)} – ${clockLabel(b % DAY_MIN)}` : "off"])), sentToday: sent,
        due: due(cfg, ctx, sent), problem: ctx.problem || null,
        today: ctx.F ? { lessons: ctx.F.planLessons.length, done: ctx.F.planDone.length, pct: ctx.F.pct, streak: ctx.F.streak } : null,
        habits: ctx.F ? { live: ctx.F.habits.list.length, dueToday: ctx.F.habits.due.length, doneToday: ctx.F.habits.done.length } : null,
        eventEmails: ctx.F ? {
          mode: ctx.state.settings.emailEachTick ? "every tick" : "quiet: one email when the whole day is done (pending ticks wait for it)",
          sentToday: Object.keys(sent).filter(isEventSlot).length,
          pending: [...newHabitEvents(ctx.state, ctx.day), ...completionEvents(ctx.state, ctx.day, BY_ID)].filter((e) => !sent[e.slot]).map((e) => e.slot),
        } : null,
        syncedAt: ctx.syncedAt || null,
        review: { groq: cfg.groqKey ? cfg.groqModel : "not configured (GROQ_API_KEY): written from your record by rules", calendar: cfg.calendarSecret ? "configured" : "not configured (CALENDAR_SECRET): no to-dos in the review" },
      });
    }

    if (dry) {
      const slot = slotParam || "morning";
      if (ctx.problem) return json(res, 200, { slot, problem: ctx.problem, note: "No synced progress to build from yet." });
      await withAgenda(cfg, ctx, slot);
      if (slot === "review" && q.get("format") === "json") {
        const r = ctx.review || {};
        return json(res, 200, { grade: r.grade, source: r.source, model: r.model, error: r.error || null, dropped: r.dropped || [], facts: r.facts, subject: r.mail?.subject || null });
      }
      const mail = preview(cfg, slot, ctx);
      if (!mail) return json(res, 200, { slot, note: "Nothing to show: this email would not be sent today (rest day, finished, nothing completed yet, or no habits)." });
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
    const slots = slotParam ? [slotParam] : due(cfg, ctx, await slotsSent(cfg, cfg.to, ctx.day));
    // One failing email must not stop the others in the same run.
    const results = [];
    for (const slot of slots) {
      try {
        results.push(await sendSlot(cfg, ctx, slot, { force: !!q.get("force") }));
      } catch (e) {
        results.push({ slot, sent: false, error: String(e.message || e) });
      }
    }
    // Catch-up for completion and new-habit emails (scheduled runs only).
    if (scheduled) {
      try {
        results.push(...(await sendEvents(cfg, ctx)));
      } catch (e) {
        results.push({ slot: "events", sent: false, error: String(e.message || e) });
      }
      if (!results.length) return json(res, 200, { sent: false, reason: "nothing due now", localTime: clockLabel(ctx.clock.min), warnings: cfg.warnings });
    }
    console.log(JSON.stringify({ at: new Date().toISOString(), day: ctx.day, time: clockLabel(ctx.clock.min), results }));
    const failed = results.some((r) => r.error);
    if (failed) await alert(results.filter((r) => r.error).map((r) => `${r.slot} email: ${r.error}`));
    return json(res, failed ? 502 : 200, slotParam ? results[0] : { results, warnings: cfg.warnings });
  } catch (e) {
    console.error(e);
    await alert([String(e.message || e)]);
    return json(res, e.status && e.status < 600 ? e.status : 500, { error: String(e.message || e) });
  }
}
