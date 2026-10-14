// Server configuration, read from Vercel environment variables.
// Files under api/_lib are helpers, not routes (Vercel skips "_" paths).

import { SUPABASE_URL as PUBLIC_URL } from "../../js/config.js";
import { parseHM, DEFAULT_WORKDAY_START, DEFAULT_WEEKEND_START, workday } from "../../js/schedule.js";

// The address you actually use. Sign-in and local progress are per address,
// so a link to any other alias (even of this same deployment) opens a
// signed-out, empty copy of the app. APP_URL overrides it. Goals lives at
// /goals on the calendar's domain (see README, "One site").
export const DEFAULT_CALENDAR_URL = "https://www.arnavcalendar.online";
const DEFAULT_APP_URL = `${DEFAULT_CALENDAR_URL}/goals`;

export const MAX_EXTRA = 15;

// Groq's larger open model with strict JSON-schema output (checked on
// console.groq.com/docs/structured-outputs, Oct 2026). One call a day, so the
// bigger model costs well under a cent and judges the day better than 20b.
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

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
  const brevoSet = [env.BREVO_SMTP_LOGIN, env.BREVO_SMTP_KEY, env.EMAIL_FROM].filter((v) => String(v || "").trim()).length;
  if (brevoSet && brevoSet < 3) warnings.push("Brevo is half set up (needs BREVO_SMTP_LOGIN, BREVO_SMTP_KEY and EMAIL_FROM), so email goes through Gmail only.");
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
    // The end-of-day review (js/review.js) is written by Groq. Optional:
    // without a key it's written from your record by rules, and still sends.
    groqKey: (env.GROQ_API_KEY || "").trim(),
    groqModel: (env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim(),
    // Local hours (in GOALS_TZ). Each slot sends at the first hourly check
    // inside its window, then never again that day.
    ...emailHours(env, warnings),
    ...workStarts(env, warnings),
    // Brevo (optional): sends from your own domain. With Gmail also set,
    // Gmail is the automatic backup (api/_lib/mailer.js).
    brevoLogin: (env.BREVO_SMTP_LOGIN || "").trim(),
    brevoKey: (env.BREVO_SMTP_KEY || "").trim(),
    fromEmail: (env.EMAIL_FROM || "").trim().toLowerCase(),
    replyTo: to.toLowerCase(),
  };
}

// When the work day starts: WORKDAY_START on school days (Mon-Fri, when you
// get home), WEEKEND_START on weekends. "HH:MM", local time. It must leave
// room for the midday email and the halftime before the evening wrap; a bad
// value falls back to the default, loudly.
export function workStarts(env, warnings = []) {
  const read = (name, d) => {
    const raw = env[name];
    if (raw === undefined || String(raw).trim() === "") return d;
    const m = parseHM(raw);
    if (m != null) return m;
    warnings.push(`${name}: "${raw}" is not a time like 14:32, using the default.`);
    return d;
  };
  const out = { workdayStart: read("WORKDAY_START", DEFAULT_WORKDAY_START), weekendStart: read("WEEKEND_START", DEFAULT_WEEKEND_START) };
  const hours = emailHours(env);
  for (const [key, school, d] of [["workdayStart", true, DEFAULT_WORKDAY_START], ["weekendStart", false, DEFAULT_WEEKEND_START]]) {
    const wd = workday({ ...hours, ...out }, school);
    const midday = school ? out.workdayStart : hours.middayHour * 60;
    if (!(out[key] > hours.morningHour * 60 && midday < wd.half && wd.half < hours.eveningHour * 60)) {
      warnings.push(`${key === "workdayStart" ? "WORKDAY_START" : "WEEKEND_START"} leaves no room for the halftime email before the evening wrap, using the default.`);
      out[key] = d;
    }
  }
  return out;
}

export const DEFAULT_HOURS = { morningHour: 7, middayHour: 14, eveningHour: 20, reviewHour: 22 };

// Hours must be whole numbers 0-23 in order morning < midday < evening <
// review, or a window comes out empty and that email silently never sends.
// Anything else falls back to the defaults, loudly.
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
    reviewHour: read("EMAIL_REVIEW_HOUR", DEFAULT_HOURS.reviewHour),
  };
  if (!(h.morningHour < h.middayHour && h.middayHour < h.eveningHour && h.eveningHour < h.reviewHour)) {
    warnings.push(`Email hours must go morning < midday < evening < review (got ${h.morningHour} / ${h.middayHour} / ${h.eveningHour} / ${h.reviewHour}), using 7 / 14 / 20 / 22.`);
    return { ...DEFAULT_HOURS };
  }
  return h;
}

// Names of required variables that are missing, so failures say exactly what to fix.
export function missing(cfg, need = ["mail", "db"]) {
  const out = [];
  if (need.includes("mail") && !(cfg.brevoLogin && cfg.brevoKey && cfg.fromEmail)) {
    const anyBrevo = cfg.brevoLogin || cfg.brevoKey || cfg.fromEmail;
    if (anyBrevo && !(cfg.gmailUser && cfg.gmailPass)) {
      // Half a Brevo setup and no Gmail: name exactly what Brevo still needs.
      if (!cfg.brevoLogin) out.push("BREVO_SMTP_LOGIN");
      if (!cfg.brevoKey) out.push("BREVO_SMTP_KEY");
      if (!cfg.fromEmail) out.push("EMAIL_FROM");
    } else {
      if (!cfg.gmailUser) out.push("GMAIL_USER");
      if (!cfg.gmailPass) out.push("GMAIL_APP_PASSWORD");
    }
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
