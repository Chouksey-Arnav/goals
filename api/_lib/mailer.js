// Gmail over SMTP with an app password, through Nodemailer.

import nodemailer from "nodemailer";

let transport = null;
let transportKey = "";

function getTransport(cfg) {
  const key = `${cfg.gmailUser}:${cfg.gmailPass}`;
  if (!transport || key !== transportKey) {
    transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: cfg.gmailUser, pass: cfg.gmailPass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    transportKey = key;
  }
  return transport;
}

export async function sendMail(cfg, { to, subject, text, html }) {
  const info = await getTransport(cfg).sendMail({
    // Gmail rewrites From to the authenticated account anyway; say so honestly.
    from: { name: cfg.fromName, address: cfg.gmailUser },
    to,
    subject,
    text,
    html,
  });
  return info.messageId;
}

// Gmail's errors are cryptic; translate the common one.
export function explainMailError(e) {
  const m = String(e?.message || e);
  if (/535|Username and Password not accepted|BadCredentials/i.test(m))
    return "Gmail rejected the login. GMAIL_USER must be the full Gmail address and GMAIL_APP_PASSWORD a 16-character app password (2-Step Verification must be on). Your normal Gmail password will not work.";
  return m;
}
