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
let hooks = { getState: () => null, setState: () => {}, onStatus: () => {} };

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

export async function signIn(email) {
  if (!client) return { error: "Sync is not set up." };
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true },
  });
  return { error: error?.message || null };
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
    } catch {
      status.error = "Sync failed. Your progress is still saved on this device.";
    }
    emit();
  }, 800);
}
