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
    const err = new Error(`Supabase ${res.status} on ${path.split("?")[0]}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
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
export async function claimSlot(cfg, recipient, day, slot) {
  const rows = await call(cfg, "/rest/v1/email_log?on_conflict=recipient,day,slot", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ recipient, day, slot }),
  });
  return Array.isArray(rows) && rows.length === 1;
}

export async function slotsSent(cfg, recipient, day) {
  const rows = await call(
    cfg,
    `/rest/v1/email_log?recipient=eq.${encodeURIComponent(recipient)}&day=eq.${day}&select=slot,sent_at,error`
  );
  return Object.fromEntries((rows || []).map((r) => [r.slot, r]));
}

export async function markSent(cfg, recipient, day, slot, patch) {
  await call(
    cfg,
    `/rest/v1/email_log?recipient=eq.${encodeURIComponent(recipient)}&day=eq.${day}&slot=eq.${slot}`,
    { method: "PATCH", body: JSON.stringify(patch) }
  );
}

// Give the claim back when sending failed, so the next hourly run retries.
export async function releaseSlot(cfg, recipient, day, slot) {
  await call(
    cfg,
    `/rest/v1/email_log?recipient=eq.${encodeURIComponent(recipient)}&day=eq.${day}&slot=eq.${slot}`,
    { method: "DELETE" }
  );
}

export async function claimLoginSend(cfg, email) {
  return call(cfg, "/rest/v1/rpc/claim_login_send", { method: "POST", body: JSON.stringify({ p_email: email }) });
}
