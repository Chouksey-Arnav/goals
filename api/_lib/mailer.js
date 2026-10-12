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

// A wrong password fails the same way every time; anything else (a dropped
// connection, a timeout, Gmail's 4xx "try again later") gets one more try
// on a fresh connection before the caller gives up for this run.
export const isAuthError = (e) => /535|Username and Password not accepted|BadCredentials|EAUTH/i.test(String(e?.code || "") + String(e?.message || e));

export async function sendMail(cfg, mail, { retries = 1, wait = 1500 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await sendOnce(cfg, mail);
    } catch (e) {
      if (attempt >= retries || isAuthError(e)) throw e;
      console.warn(`Gmail send failed (${e.code || e.message}), retrying once.`);
      transport?.close?.();
      transport = null;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function sendOnce(cfg, { to, bcc, subject, text, html }) {
  const info = await getTransport(cfg).sendMail({
    // Gmail rewrites From to the authenticated account anyway; say so honestly.
    from: { name: cfg.fromName, address: cfg.gmailUser },
    ...(to ? { to } : {}),
    ...(bcc?.length ? { bcc } : {}),
    subject,
    text,
    html,
  });
  return info.messageId;
}

// Gmail's errors are cryptic; translate the common one.
export function explainMailError(e) {
  const m = String(e?.message || e);
  if (isAuthError(e))
    return "Gmail rejected the login. GMAIL_USER must be the full Gmail address and GMAIL_APP_PASSWORD a 16-character app password (2-Step Verification must be on). Your normal Gmail password will not work.";
  return m;
}
