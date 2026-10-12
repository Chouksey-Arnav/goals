// Minimal Supabase REST client for the server, using the secret key.
// No SDK: three endpoints, plain fetch, nothing to keep up to date.

function headers(cfg, extra = {}) {
  const h = { apikey: cfg.serviceKey, "Content-Type": "application/json", ...extra };
  // Legacy service_role keys are JWTs and also go in Authorization.
  // New sb_secret_ keys are not JWTs and must only be sent as apikey.
  if (!cfg.serviceKey.startsWith("sb_")) h.Authorization = `Bearer ${cfg.serviceKey}`;
  return h;
}

async function call(cfg, path, init = {}) {
  const res = await fetch(`${cfg.supabaseUrl}${path}`, { ...init, headers: headers(cfg, init.headers) });
  const body = await res.text();
  let json = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const msg = json?.msg || json?.message || json?.error_description || json?.error || body || res.statusText;
    const err = new Error(`Supabase ${res.status} on ${path.split("?")[0]}: ${msg}${hint(res.status, msg)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// The two misconfigurations that have actually happened, in plain words.
export function hint(status, msg) {
  if (/permission denied for (table|function)/i.test(msg))
    return " (the secret key's role has no grant on it: run supabase/migrations/20261012030000_grant_service_role.sql in the SQL editor)";
  if (status === 401 && /invalid api key|jwt/i.test(msg))
    return " (SUPABASE_SERVICE_ROLE_KEY is wrong or from another project: copy the secret key from Supabase, Project Settings, API Keys)";
  return "";
}

// The auth user for an email. Paginates, though a personal project has one.
export async function findUserByEmail(cfg, email) {
  const want = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const data = await call(cfg, `/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = data?.users || [];
    const hit = users.find((u) => (u.email || "").toLowerCase() === want);
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

export async function createUser(cfg, email) {
  return call(cfg, "/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, email_confirm: true }) });
}

// A one-time sign-in code for an existing user, without Supabase sending
// anything. We deliver it ourselves through Gmail.
export async function generateLoginCode(cfg, email, redirectTo) {
  const data = await call(cfg, "/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email, redirect_to: redirectTo }),
  });
  const p = data?.properties || data || {};
  return { code: p.email_otp, link: p.action_link, type: p.verification_type || "magiclink" };
}

// Who owns this access token (sent by the app).
export async function userFromToken(cfg, token) {
  const res = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function loadProgress(cfg, userId) {
  const rows = await call(cfg, `/rest/v1/progress?user_id=eq.${encodeURIComponent(userId)}&select=state,updated_at`);
  return rows?.[0] || null;
}

// Insert-or-nothing. Returns true only for the caller that created the row,
// so a cron run and a midday nudge racing each other can't both send.
//
// A claim with no sent_at that's older than STALE_MIN means the run that made
// it died between claiming and sending (a timeout, a crash) without giving it
// back. Clear it first, or that email would never go out today. The delete
// only matches unsent rows, and the insert still decides who wins.
export const STALE_MIN = 5;

export async function claimSlot(cfg, recipient, day, slot) {
  const cutoff = new Date(Date.now() - STALE_MIN * 60_000).toISOString();
  await call(
    cfg,
    `${logRow(recipient, day, slot)}&sent_at=is.null&claimed_at=lt.${encodeURIComponent(cutoff)}`,
    { method: "DELETE" }
  );
  const rows = await call(cfg, "/rest/v1/email_log?on_conflict=recipient,day,slot", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ recipient, day, slot }),
  });
  return Array.isArray(rows) && rows.length === 1;
}

const logRow = (recipient, day, slot) =>
  `/rest/v1/email_log?recipient=eq.${encodeURIComponent(recipient)}&day=eq.${day}&slot=eq.${slot}`;

// Slots that are sent or being sent right now. A stale claim (see claimSlot)
// is neither, so it's left out and the next run picks that email up again.
export async function slotsSent(cfg, recipient, day, now = Date.now()) {
  const rows = await call(
    cfg,
    `/rest/v1/email_log?recipient=eq.${encodeURIComponent(recipient)}&day=eq.${day}&select=slot,sent_at,claimed_at,error`
  );
  return Object.fromEntries((rows || []).filter((r) => !isStale(r, now)).map((r) => [r.slot, r]));
}

export const isStale = (r, now = Date.now()) => !r.sent_at && Date.parse(r.claimed_at) < now - STALE_MIN * 60_000;

// Retried once: an unmarked claim goes stale and the email would be resent.
export async function markSent(cfg, recipient, day, slot, patch) {
  const write = () => call(cfg, logRow(recipient, day, slot), { method: "PATCH", body: JSON.stringify(patch) });
  try {
    await write();
  } catch {
    await new Promise((r) => setTimeout(r, 500));
    await write();
  }
}

// Give the claim back when sending failed, so the next hourly run retries.
export async function releaseSlot(cfg, recipient, day, slot) {
  await call(cfg, logRow(recipient, day, slot), { method: "DELETE" });
}

export async function claimLoginSend(cfg, email) {
  return call(cfg, "/rest/v1/rpc/claim_login_send", { method: "POST", body: JSON.stringify({ p_email: email }) });
}

// "Send me motivation" throttle. Returns today's press count (1..8), or 0
// when it's too soon or the day's limit is reached.
export async function claimBoostSend(cfg, email, day) {
  return call(cfg, "/rest/v1/rpc/claim_boost_send", { method: "POST", body: JSON.stringify({ p_email: email, p_day: day }) });
}
