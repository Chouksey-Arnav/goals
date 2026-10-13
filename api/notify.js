// POST /api/notify   Authorization: Bearer <your Supabase access token>
//
// The app calls this right after a sync that followed something you did
// (ticked a lesson, did a habit, created a habit). The server re-reads your
// progress from the database and emails whatever is new, exactly once each:
// a completion email, a new-habit plan, or the midday email when the weekend
// morning block (or the whole day) just got done. The app can't make it send
// anything else; the hourly cron runs the same check as a catch-up.

import { config, missing, loadDay, sendEvents, json } from "./_lib/run.js";
import { userFromToken } from "./_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only." });
  const cfg = config();
  const gaps = missing(cfg, ["mail", "db"]);
  if (gaps.length) return json(res, 503, { error: "Email is not configured.", missing: gaps });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(res, 401, { error: "Sign in first." });

  try {
    const user = await userFromToken(cfg, token);
    if (!user?.id) return json(res, 401, { error: "Session expired. Sign in again." });
    if ((user.email || "").toLowerCase() !== cfg.to) return json(res, 403, { error: "Emails are only sent to the owner's address." });

    const ctx = await loadDay(cfg, new Date(), user.id);
    if (ctx.problem) return json(res, 200, { sent: [], reason: ctx.problem });
    const results = await sendEvents(cfg, ctx);
    console.log(JSON.stringify({ at: new Date().toISOString(), via: "notify", day: ctx.day, results }));
    const failed = results.filter((r) => r.error);
    return json(res, failed.length ? 502 : 200, {
      sent: results.filter((r) => r.sent).map((r) => ({ slot: r.slot, subject: r.subject })),
      ...(failed.length ? { error: failed.map((r) => r.error).join(" | ") } : {}),
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: String(e.message || e) });
  }
}
