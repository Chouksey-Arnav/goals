// Focus guard: what to block and when. Pure (no chrome.*, no clock), so it's
// unit tested from the goals repo (tests/extension.test.js).
//
// The schedule mirrors Goals' work day (js/schedule.js): school days
// (Mon-Fri) from 14:32, weekends from 09:00, until 22:00. Inside it the sites
// below open a "blocked" page instead. You can still get in, but it costs
// something: type a sentence, wait a minute, and it's counted. Two unlocks
// a day, 15 minutes each.

export const SITES = ["youtube.com", "youtu.be", "youtube-nocookie.com"];
export const SCHEDULE = { school: [14 * 60 + 32, 22 * 60], weekend: [9 * 60, 22 * 60] };
export const UNLOCK = { minutes: 15, perDay: 2, waitSeconds: 60 };
export const SENTENCE = "I am choosing YouTube over my work right now.";
export const GOALS_URL = "https://www.arnavcalendar.online/goals/#today";

// A Date -> { day: "YYYY-MM-DD", min, school } in the computer's own time zone.
export function clock(d) {
  const p = (n) => String(n).padStart(2, "0");
  const dow = d.getDay();
  return { day: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, min: d.getHours() * 60 + d.getMinutes(), school: dow >= 1 && dow <= 5 };
}

export function windowFor(c, schedule = SCHEDULE) {
  return c.school ? schedule.school : schedule.weekend;
}

// state: { unlockUntil (ms), unlocks: { "YYYY-MM-DD": n } }
export function blockedNow(now, state = {}, schedule = SCHEDULE) {
  const c = clock(new Date(now));
  const [a, b] = windowFor(c, schedule);
  if (c.min < a || c.min >= b) return false;
  return !(state.unlockUntil && state.unlockUntil > now);
}

export function unlocksLeft(now, state = {}) {
  const used = state.unlocks?.[clock(new Date(now)).day] || 0;
  return Math.max(0, UNLOCK.perDay - used);
}

// Typing the sentence exactly (case and spaces forgiven) is the price.
export const sentenceOk = (typed) => String(typed || "").trim().replace(/\s+/g, " ").toLowerCase() === SENTENCE.toLowerCase();

// -> the new state, or { error } when it isn't allowed.
export function unlock(now, state = {}, typed = "", waitedSeconds = 0) {
  if (!blockedNow(now, state)) return { error: "Not blocked right now." };
  if (!sentenceOk(typed)) return { error: "Type the sentence exactly." };
  if (waitedSeconds < UNLOCK.waitSeconds) return { error: `Wait the full ${UNLOCK.waitSeconds} seconds.` };
  if (unlocksLeft(now, state) <= 0) return { error: `No unlocks left today (${UNLOCK.perDay} a day). It opens again at 10 PM.` };
  const day = clock(new Date(now)).day;
  return { ...state, unlockUntil: now + UNLOCK.minutes * 60_000, unlocks: { [day]: (state.unlocks?.[day] || 0) + 1 } };
}

// When the block ends today, for the blocked page: "10 PM".
export function endsLabel(now, schedule = SCHEDULE) {
  const m = windowFor(clock(new Date(now)), schedule)[1];
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

// Is this URL one of the blocked sites? (Also guards where "unlock" sends
// you back to, so the blocked page can't be used to open anything else.)
export function isBlockedUrl(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    return SITES.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

// The declarativeNetRequest rule: whole-page visits to the sites go to the
// blocked page, with the address they wanted after the "#". page: the
// extension's blocked.html URL (chrome.runtime.getURL). Embeds on other
// sites aren't touched.
export const RULE_ID = 1;
const escape = (d) => d.replace(/[.]/g, "\\.");
export function redirectRule(page) {
  return {
    id: RULE_ID,
    priority: 1,
    action: { type: "redirect", redirect: { regexSubstitution: `${page}#\\0` } },
    condition: { regexFilter: `^https?://([a-z0-9-]+\\.)*(${SITES.map(escape).join("|")})(/.*)?$`, resourceTypes: ["main_frame"] },
  };
}
