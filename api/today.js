// GET /api/today   Authorization: Bearer <your Supabase access token>
//
// Where today's study plan stands, as JSON, for the calendar app
// (calendarforarnav) to show next to your schedule. Same account, same
// Supabase project, so the calendar's session token works here. Read-only.
// Same origin as the calendar on the site; CORS allows CALENDAR_URL's origin otherwise.

import { config, missing, loadDay, json } from "./_lib/run.js";
import { userFromToken } from "./_lib/supabase.js";

const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};

// On the site both apps share one origin and this never triggers; it's for
// a CALENDAR_URL on another address.
function cors(req, res, url) {
  const origin = originOf(url);
  if (origin && req.headers.origin === origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  const cfg = config();
  if (cors(req, res, cfg.calendarUrl)) return;
  if (req.method !== "GET") return json(res, 405, { error: "GET only." });
  const gaps = missing(cfg, ["db"]);
  if (gaps.length) return json(res, 503, { error: "Not configured.", missing: gaps });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(res, 401, { error: "Sign in first." });
  try {
    const user = await userFromToken(cfg, token);
    if (!user?.id) return json(res, 401, { error: "Session expired. Sign in again." });
    if ((user.email || "").toLowerCase() !== cfg.to) return json(res, 403, { error: "Only the owner's plan is shared." });

    const ctx = await loadDay(cfg, new Date(), user.id);
    if (ctx.problem) return json(res, 200, { problem: ctx.problem });
    const F = ctx.F;
    return json(res, 200, {
      day: ctx.day,
      pct: F.pct,
      done: F.planDone.length,
      total: F.planLessons.length,
      leftMin: Math.max(0, F.plan.targetMin - F.doneMin),
      complete: F.complete,
      finished: F.finished,
      rest: F.rest,
      mode: F.mode,
      streak: F.streak,
      next: F.next ? { title: F.next.title, minutes: Math.round(F.next.effort) } : null,
      syncedAt: ctx.syncedAt,
      appUrl: cfg.appUrl,
    });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: String(e.message || e) });
  }
}
