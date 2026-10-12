// POST /api/nudge   Authorization: Bearer <your Supabase access token>
//
// The app calls this right after a tick has synced. If you've just reached
// halfway (or finished), the midday email goes out now instead of waiting
// for the afternoon fallback. The server re-reads your progress from the
// database and decides for itself; the app can't make it send anything else.

import { config, missing, loadDay, sendSlot, json } from "./_lib/run.js";
import { userFromToken, slotsSent } from "./_lib/supabase.js";
import { nudgeAllowed } from "../js/schedule.js";
import { reachedHalfway } from "../js/digest.js";

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
    if (ctx.problem) return json(res, 200, { sent: false, reason: ctx.problem });
    if (!reachedHalfway(ctx.F)) return json(res, 200, { sent: false, reason: "not halfway yet" });
    const sent = await slotsSent(cfg, cfg.to, ctx.day);
    if (!nudgeAllowed(ctx.hour, sent, cfg)) return json(res, 200, { sent: false, reason: sent.midday ? "already sent today" : "outside the midday window" });

    const out = await sendSlot(cfg, ctx, "midday");
    console.log(JSON.stringify({ at: new Date().toISOString(), via: "nudge", day: ctx.day, ...out }));
    return json(res, 200, out);
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: String(e.message || e) });
  }
}
