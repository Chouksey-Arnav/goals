// POST /api/boost   Authorization: Bearer <your Supabase access token>
//
// The "Send me motivation" button. Emails a push built from where you stand
// right now to you (EMAIL_TO) and your copies (EMAIL_CC, as BCC). Partners
// don't get these: they're for you, not a report about you.
//
// Owner only, at most once a minute and 8 times a day, so a stuck finger
// or a stolen session can't burn through the Gmail account's sending limit.

import { config, missing, loadDay, json, addressing, firstName } from "./_lib/run.js";
import { userFromToken, claimBoostSend } from "./_lib/supabase.js";
import { sendMail, explainMailError } from "./_lib/mailer.js";
import { composeBoost } from "../js/emails.js";
import { diffDays } from "../js/planner.js";
import { TRACK_START } from "../js/data.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only." });
  const cfg = config();
  const gaps = missing(cfg, ["mail", "db"]);
  if (gaps.length) return json(res, 503, { error: "Email is not configured.", missing: gaps });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(res, 401, { error: "Sign in first (Settings), so the email knows your progress." });

  try {
    const user = await userFromToken(cfg, token);
    if (!user?.id) return json(res, 401, { error: "Session expired. Sign in again in Settings." });
    if ((user.email || "").toLowerCase() !== cfg.to) return json(res, 403, { error: "Only the owner's account can send these." });

    const ctx = await loadDay(cfg, new Date(), user.id);
    if (ctx.problem) return json(res, 409, { error: "No synced progress yet. Tick a lesson first." });

    const n = Number(await claimBoostSend(cfg, cfg.to, ctx.day)) || 0;
    if (n < 1) return json(res, 429, { error: "Just sent one. Check your inbox, then go do the lesson. (Max 1 a minute, 8 a day.)" });

    const mail = composeBoost(ctx.F, {
      name: firstName(ctx.state, cfg),
      appUrl: cfg.appUrl,
      syncedAt: ctx.syncedAt,
      dayIndex: diffDays(TRACK_START, ctx.day),
      middayHour: cfg.middayHour,
    }, n);
    const addr = addressing(cfg, "morning");
    try {
      await sendMail(cfg, { ...addr, ...mail });
    } catch (e) {
      return json(res, 502, { error: explainMailError(e) });
    }
    console.log(JSON.stringify({ at: new Date().toISOString(), via: "boost", day: ctx.day, n, recipients: 1 + addr.bcc.length }));
    return json(res, 200, { sent: true, subject: mail.subject, recipients: 1 + addr.bcc.length, today: n, left: 8 - n });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: String(e.message || e) });
  }
}
