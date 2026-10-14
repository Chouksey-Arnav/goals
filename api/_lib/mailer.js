// Email over SMTP through Nodemailer: Brevo when it's configured, Gmail
// (app password) otherwise. With both set, Brevo sends and Gmail is the
// backup: if Brevo fails (down, key revoked, daily limit), the same email
// goes out through Gmail in the same run instead of waiting for a retry.

import nodemailer from "nodemailer";

const pool = new Map();

// The providers to try, in order. Pure: exported for tests.
export function providers(cfg) {
  const out = [];
  if (cfg.brevoLogin && cfg.brevoKey && cfg.fromEmail) {
    out.push({
      name: "Brevo",
      from: cfg.fromEmail,
      smtp: { host: "smtp-relay.brevo.com", port: 587, secure: false, requireTLS: true, auth: { user: cfg.brevoLogin, pass: cfg.brevoKey } },
    });
  }
  if (cfg.gmailUser && cfg.gmailPass) {
    out.push({ name: "Gmail", from: cfg.gmailUser, smtp: { host: "smtp.gmail.com", port: 465, secure: true, auth: { user: cfg.gmailUser, pass: cfg.gmailPass } } });
  }
  return out;
}

function transportFor(p) {
  const key = `${p.name}:${p.smtp.auth.user}:${p.smtp.auth.pass}`;
  if (!pool.has(key)) {
    pool.set(key, nodemailer.createTransport({ ...p.smtp, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 }));
  }
  return { key, t: pool.get(key) };
}

// A wrong password or key fails the same way every time; anything else (a
// dropped connection, a timeout, a 4xx "try again later") gets one more try
// on a fresh connection before moving to the next provider.
export const isAuthError = (e) => /535|Username and Password not accepted|BadCredentials|EAUTH|Authentication failed/i.test(String(e?.code || "") + String(e?.message || e));

export async function sendMail(cfg, mail, { retries = 1, wait = 1500 } = {}) {
  // Tests hand in a fake transport ({ sendMail }); production never sets it.
  if (cfg.transport) return send(cfg.transport, cfg, cfg.gmailUser || cfg.fromEmail, mail);
  const list = providers(cfg);
  if (!list.length) throw new Error("No way to send email: set GMAIL_USER + GMAIL_APP_PASSWORD, or BREVO_SMTP_LOGIN + BREVO_SMTP_KEY + EMAIL_FROM.");
  let last;
  for (const [i, p] of list.entries()) {
    for (let attempt = 0; ; attempt++) {
      const { key, t } = transportFor(p);
      try {
        return await send(t, cfg, p.from, mail);
      } catch (e) {
        e.provider = p.name;
        last = e;
        pool.get(key)?.close?.();
        pool.delete(key);
        if (attempt >= retries || isAuthError(e)) break;
        console.warn(`${p.name} send failed (${e.code || e.message}), retrying once.`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    if (i < list.length - 1) console.warn(`${p.name} failed (${last.message}); sending through ${list[i + 1].name} instead.`);
  }
  throw last;
}

async function send(t, cfg, from, { to, bcc, subject, text, html }) {
  const info = await t.sendMail({
    // Gmail rewrites From to the authenticated account anyway; say so honestly.
    from: { name: cfg.fromName, address: from },
    // Replies reach you even when the email came from the Brevo address.
    ...(cfg.replyTo && cfg.replyTo !== from ? { replyTo: cfg.replyTo } : {}),
    ...(to ? { to } : {}),
    ...(bcc?.length ? { bcc } : {}),
    subject,
    text,
    html,
  });
  return info.messageId;
}

// SMTP errors are cryptic; translate the common ones.
export function explainMailError(e) {
  const m = String(e?.message || e);
  if (isAuthError(e) && e?.provider === "Brevo")
    return "Brevo rejected the login. BREVO_SMTP_LOGIN is the login shown in Brevo → SMTP & API → SMTP (an @smtp-brevo.com address), and BREVO_SMTP_KEY an SMTP key from that page, not an API key.";
  if (isAuthError(e))
    return "Gmail rejected the login. GMAIL_USER must be the full Gmail address and GMAIL_APP_PASSWORD a 16-character app password (2-Step Verification must be on). Your normal Gmail password will not work.";
  if (e?.provider === "Brevo" && /sender|not (yet )?(valid|verified|authorized)/i.test(m))
    return `Brevo refused the sender: ${m}. EMAIL_FROM must be a verified sender or on a domain authenticated in Brevo → Senders, Domains & Dedicated IPs.`;
  return m;
}
