// Optional cross-device sync through Supabase.
//
// Model: the whole app state is one JSON blob per user in table `progress`.
// Whichever copy was changed by a user action most recently wins
// (state.updatedAt vs the row's copy). Fine for one person switching between
// a phone and a laptop; not built for two devices editing at the same moment.

import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm";

let client = null;
let user = null;
let pushTimer = null;
let hooks = { getState: () => null, setState: () => {}, onStatus: () => {}, onPushed: () => {} };

export const status = { enabled: !!(SUPABASE_URL && SUPABASE_KEY), ready: false, email: null, lastSync: null, error: null, busy: false };

function emit() {
  status.email = user?.email || null;
  hooks.onStatus(status);
}

export async function initSync(h) {
  hooks = { ...hooks, ...h };
  if (!status.enabled) return;
  try {
    const { createClient } = await import(SDK);
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    client.auth.onAuthStateChange((_evt, session) => {
      const was = user?.id;
      user = session?.user || null;
      emit();
      // Defer: querying inside this callback can deadlock supabase-js's auth lock.
      if (user && user.id !== was) setTimeout(reconcile, 0);
    });
    const { data } = await client.auth.getSession();
    user = data.session?.user || null;
    status.ready = true;
    emit();
    if (user) await reconcile();
    // Coming back to the tab (e.g. after using the other device): pull.
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && reconcile());
  } catch (e) {
    status.error = "Could not load sync. Working offline.";
    emit();
  }
}

// Step 1 of sign-in: a 6-digit code by email, sent by this app's server
// through Gmail (Nodemailer, api/login-code.js). Never Supabase's own mailer:
// it only delivers to the project's team and caps out at a few an hour, so a
// "fallback" to it just hides the real problem.
export async function signIn(email) {
  if (!client) return { error: "Sync is not set up." };
  try {
    const res = await fetch("/api/login-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) return { error: null, via: "gmail" };
    const body = await res.json().catch(() => ({}));
    const why = body.missing?.length ? ` Missing on the server: ${body.missing.join(", ")}.` : "";
    return { error: (body.error || `Error ${res.status}`) + why };
  } catch {
    return { error: "Couldn't reach the server. Check your connection." };
  }
}

// Step 2: the code from the email. Works in an installed home-screen app,
// where tapping a login link would open the browser instead.
export async function verifyCode(email, code) {
  if (!client) return { error: "Sync is not set up." };
  let { error } = await client.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) ({ error } = await client.auth.verifyOtp({ email, token: code, type: "magiclink" }));
  return { error: error ? "That code is wrong or expired. Request a new one." : null };
}

// Ask the server to send the midday email if you've just reached halfway.
// The server re-checks everything from the database; this is only a hint.
export async function nudge() {
  if (!client || !user) return null;
  try {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetch("/api/nudge", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

// For calls to the calendar app (same Supabase project, so it accepts this token).
export async function accessToken() {
  if (!client || !user) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token || null;
}

export async function signOut() {
  if (!client) return;
  await client.auth.signOut();
  user = null;
  emit();
}

// Decide which copy wins, then make both sides equal.
export async function reconcile() {
  if (!client || !user || status.busy) return;
  status.busy = true;
  try {
    const { data, error } = await client.from("progress").select("state, updated_at").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    const local = hooks.getState();
    const localAt = local?.updatedAt || 0;
    const remoteAt = data ? Date.parse(data.updated_at) : 0;
    if (data && remoteAt > localAt) {
      hooks.setState(data.state);
    } else if (!data || localAt > remoteAt) {
      await write(local);
    }
    status.lastSync = new Date();
    status.error = null;
  } catch (e) {
    status.error = "Sync failed. Your progress is still saved on this device.";
  } finally {
    status.busy = false;
    emit();
  }
}

async function write(state) {
  const { error } = await client
    .from("progress")
    .upsert({ user_id: user.id, state, updated_at: new Date(state.updatedAt || Date.now()).toISOString() });
  if (error) throw error;
}

// Called after every user action; batches rapid ticks into one write.
export function schedulePush() {
  if (!client || !user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      await write(hooks.getState());
      status.lastSync = new Date();
      status.error = null;
      hooks.onPushed();
    } catch {
      status.error = "Sync failed. Your progress is still saved on this device.";
    }
    emit();
  }, 800);
}

// "Send me motivation". Saves any tick still waiting in the push batch
// first, so the email is built from what you did a second ago.
export async function boost() {
  if (!client || !user) return { error: "Sign in first (Settings), so the email knows your progress." };
  try {
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
      await write(hooks.getState());
      status.lastSync = new Date();
    }
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { error: "Session expired. Sign in again in Settings." };
    const res = await fetch("/api/boost", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));
    return res.ok ? body : { error: body.error || `Error ${res.status}` };
  } catch {
    return { error: "Couldn't reach the server. Check your connection." };
  }
}
