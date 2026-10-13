// Server configuration, read from Vercel environment variables.
// Files under api/_lib are helpers, not routes (Vercel skips "_" paths).

import { SUPABASE_URL as PUBLIC_URL } from "../../js/config.js";

// The address you actually use. Sign-in and local progress are per address,
// so a link to any other alias (even of this same deployment) opens a
// signed-out, empty copy of the app. APP_URL overrides it.
const DEFAULT_APP_URL = "https://goalsforarnav.vercel.app";
export const DEFAULT_CALENDAR_URL = "https://calendarforarnav.vercel.app";

export const MAX_EXTRA = 15;

// "a@x.com, b@y.com; c@z.com" -> unique, lowercased, without the owner.
export function parseList(raw, exclude = []) {
  const skip = new Set(exclude.map((e) => e.toLowerCase()));
  const out = [];
  for (const part of String(raw || "").split(/[,;\s]+/)) {
    const e = part.trim().toLowerCase();
    if (e && !skip.has(e) && !out.includes(e)) out.push(e);
  }
  return out;
}
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// A typo drops that one address; more than 15 drops the whole list (better
// to notice than to silently pick which friends stop hearing from you).
function recipients(name, raw, owner, warnings) {
  const list = parseList(raw, [owner]);
  const bad = list.filter((e) => !isEmail(e));
  if (bad.length) warnings.push(`${name}: skipped, not an email: ${bad.join(", ")}`);
  const good = list.filter(isEmail);
  if (good.length > MAX_EXTRA) {
    warnings.push(`${name}: ${good.length} addresses, the limit is ${MAX_EXTRA}. Nobody on this list gets email until you trim it.`);
    return [];
  }
  return good;
}

export function config() {
  const env = process.env;
  const gmailUser = (env.GMAIL_USER || "").trim();
  const to = (env.EMAIL_TO || gmailUser).trim();
  const warnings = [];
  return {
    gmailUser,
    // Google shows app passwords as "abcd efgh ijkl mnop"; the spaces aren't part of it.
    gmailPass: (env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, ""),
    fromName: env.EMAIL_FROM_NAME || "Goals",
    to: to.toLowerCase(),
    // Up to 15 people who get copies of your three daily emails (BCC).
    cc: recipients("EMAIL_CC", env.EMAIL_CC, to, warnings),
    // Up to 15 accountability partners who get the morning partner report (BCC).
    partners: recipients("PARTNER_EMAILS", env.PARTNER_EMAILS, to, warnings),
    // Problems with the optional lists. They never block your own emails.
    warnings,
    supabaseUrl: (env.SUPABASE_URL || PUBLIC_URL || "").replace(/\/+$/, ""),
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || "",
    cronSecret: env.CRON_SECRET || "",
    tz: env.GOALS_TZ || "America/New_York",
    appUrl: (env.APP_URL || DEFAULT_APP_URL).replace(/\/+$/, ""),
    // The calendar app (calendarforarnav): its agenda goes into the morning
    // email. CALENDAR_SECRET is that app's CRON_SECRET. Optional: without it
    // the morning email just has no calendar section.
    calendarUrl: (env.CALENDAR_URL || DEFAULT_CALENDAR_URL).replace(/\/+$/, ""),
    calendarSecret: (env.CALENDAR_SECRET || "").trim(),
    name: (env.GOALS_NAME || "").trim(),
    // Local hours (in GOALS_TZ). Each slot sends at the first hourly check
    // inside its window, then never again that day.
    ...emailHours(env, warnings),
  };
}

export const DEFAULT_HOURS = { morningHour: 7, middayHour: 14, eveningHour: 20 };

// Hours must be whole numbers 0-23 in order morning < midday < evening, or a
// window comes out empty and that email silently never sends. Anything else
// falls back to the defaults, loudly.
export function emailHours(env, warnings = []) {
  const read = (name, d) => {
    const raw = env[name];
    if (raw === undefined || String(raw).trim() === "") return d;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n <= 23) return n;
    warnings.push(`${name}: "${raw}" is not a whole hour 0-23, using ${d}.`);
    return d;
  };
  const h = {
    morningHour: read("EMAIL_MORNING_HOUR", DEFAULT_HOURS.morningHour),
    middayHour: read("EMAIL_MIDDAY_HOUR", DEFAULT_HOURS.middayHour),
    eveningHour: read("EMAIL_EVENING_HOUR", DEFAULT_HOURS.eveningHour),
  };
  if (!(h.morningHour < h.middayHour && h.middayHour < h.eveningHour)) {
    warnings.push(`Email hours must go morning < midday < evening (got ${h.morningHour} / ${h.middayHour} / ${h.eveningHour}), using 7 / 14 / 20.`);
    return { ...DEFAULT_HOURS };
  }
  return h;
}

// Names of required variables that are missing, so failures say exactly what to fix.
export function missing(cfg, need = ["mail", "db"]) {
  const out = [];
  if (need.includes("mail")) {
    if (!cfg.gmailUser) out.push("GMAIL_USER");
    if (!cfg.gmailPass) out.push("GMAIL_APP_PASSWORD");
  }
  if (need.includes("db")) {
    if (!cfg.supabaseUrl) out.push("SUPABASE_URL");
    if (!cfg.serviceKey) out.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (need.includes("cron") && !cfg.cronSecret) out.push("CRON_SECRET");
  if (!/^\S+@\S+\.\S+$/.test(cfg.to)) out.push("EMAIL_TO");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: cfg.tz });
  } catch {
    out.push("GOALS_TZ (not a valid IANA time zone)");
  }
  return out;
}
