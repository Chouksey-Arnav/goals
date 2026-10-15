// GET /api/today   Authorization: Bearer <your Supabase access token>
//
// Where today's study plan stands, as JSON, for the calendar app
// (calendarforarnav) to show next to your schedule. Same account, same
// Supabase project, so the calendar's session token works here. Read-only.
// Same origin as the calendar on the site; CORS allows CALENDAR_URL's origin otherwise.
//
// For the calendar's To-do tab it also returns:
//   habits  { done, total, open: [names] } for today
//   work    today's work day in local minutes { startMin, endMin, breaksMin }
//           (2:32 PM school days / 9 AM weekends until the review hour), so
//           its "does it fit" math matches halftime's
//   grade   the day review's grade if the day ended now (gradeNow: the same
//           facts and gradeDay as the 10 PM review), with parts per area.
//           Uses the calendar's agenda (server-side, CALENDAR_SECRET); without
//           it the grade covers Goals only and grade.calendar is false.

import { config, missing, loadDay, json } from "./_lib/run.js";
import { userFromToken } from "./_lib/supabase.js";
import { fetchAgenda } from "./_lib/calendar.js";
import { gradeNow } from "../js/review.js";
import { workday, isSchoolDay } from "../js/schedule.js";
import { BREAKS } from "../js/worktime.js";

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
    const school = isSchoolDay(ctx.day);
    const wd = workday(cfg, school);
    const agenda = await fetchAgenda(cfg, ctx.day, { timeoutMs: 3000 });
    let grade = null;
    try {
      grade = gradeNow(F, ctx.state, { agenda, cfg });
    } catch (e) {
      console.error("gradeNow:", e.message);
    }
    return json(res, 200, {
      habits: { done: F.habits.due.filter((x) => x.status === "full" || x.status === "min").length, total: F.habits.due.length, open: F.habits.open.map((x) => x.h.name) },
      work: { startMin: wd.start, endMin: wd.end, breaksMin: school ? BREAKS.school : BREAKS.weekend },
      grade,
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
