// Server configuration, read from Vercel environment variables.
// Files under api/_lib are helpers, not routes (Vercel skips "_" paths).

import { SUPABASE_URL as PUBLIC_URL } from "../../js/config.js";

const DEFAULT_APP_URL = "https://goals-taupe-six.vercel.app";

export function config() {
  const env = process.env;
  const gmailUser = (env.GMAIL_USER || "").trim();
  const to = (env.EMAIL_TO || gmailUser).trim();
  const hour = (v, d) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : d;
  };
  return {
    gmailUser,
    // Google shows app passwords as "abcd efgh ijkl mnop"; the spaces aren't part of it.
    gmailPass: (env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, ""),
    fromName: env.EMAIL_FROM_NAME || "Goals",
    to: to.toLowerCase(),
    supabaseUrl: (env.SUPABASE_URL || PUBLIC_URL || "").replace(/\/+$/, ""),
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || "",
    cronSecret: env.CRON_SECRET || "",
    tz: env.GOALS_TZ || "America/New_York",
    appUrl: (env.APP_URL || DEFAULT_APP_URL).replace(/\/+$/, ""),
    name: (env.GOALS_NAME || "").trim(),
    // Local hours (in GOALS_TZ). Each slot sends at the first hourly check
    // inside its window, then never again that day.
    morningHour: hour(env.EMAIL_MORNING_HOUR, 7),
    middayHour: hour(env.EMAIL_MIDDAY_HOUR, 14),
    eveningHour: hour(env.EMAIL_EVENING_HOUR, 20),
  };
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
