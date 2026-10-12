// POST /api/login-code   { "email": "you@gmail.com" }
//
// Emails a one-time sign-in code through your Gmail (Nodemailer), instead of
// Supabase's built-in mailer, which only delivers to a project's team members
// and caps out at a few emails an hour. The app then verifies the code with
// Supabase directly; this server never sees your session.
//
// Private by design: it only ever sends to EMAIL_TO. That also means a
// stranger can't create an account on your project through this route.

import { config, missing, json } from "./_lib/run.js";
import * as DB from "./_lib/supabase.js";
import { sendMail, explainMailError } from "./_lib/mailer.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only." });
  const cfg = config();
  const gaps = missing(cfg, ["mail", "db"]);
  if (gaps.length) return json(res, 503, { error: "Email sign-in is not configured.", missing: gaps });

  let email = "";
  try {
    email = String((await readBody(req)).email || "").trim().toLowerCase();
  } catch {
    return json(res, 400, { error: "Bad request." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: "Enter a valid email." });
  if (email !== cfg.to) return json(res, 403, { error: "This is a private app. Sign-in is limited to its owner's email." });

  try {
    if (!(await DB.claimLoginSend(cfg, email))) return json(res, 429, { error: "A code was just sent. Wait a minute, then try again." });
    if (!(await DB.findUserByEmail(cfg, email))) await DB.createUser(cfg, email);
    const { code, link } = await DB.generateLoginCode(cfg, email, cfg.appUrl);
    if (!code) throw new Error("Supabase did not return a code.");

    const subject = `${code} is your Goals sign-in code`;
    const text = `Your sign-in code: ${code}\n\nType it into Goals on the device you're signing in on. It works once and expires in an hour.${link ? `\n\nOr open this link on that device: ${link}` : ""}\n\nDidn't ask for this? Ignore it; nobody can sign in without the code.`;
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;color:#1f2937;font-size:15px;line-height:1.55">
      <p style="margin:0 0 8px">Your Goals sign-in code:</p>
      <p style="font-size:34px;font-weight:800;letter-spacing:.18em;margin:0 0 14px;color:#111827">${esc(code)}</p>
      <p style="margin:0 0 14px">Type it into Goals on the device you're signing in on. It works once and expires in an hour.</p>
      ${link ? `<p style="margin:0 0 14px;font-size:13px;color:#6b7280">Or <a href="${esc(link)}">tap here to sign in</a> on that device.</p>` : ""}
      <p style="margin:0;font-size:12px;color:#9ca3af">Didn't ask for this? Ignore it; nobody can sign in without the code.</p></div>`;
    await sendMail(cfg, { to: email, subject, text, html });
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: explainMailError(e) });
  }
}
