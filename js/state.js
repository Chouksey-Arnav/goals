// The saved state's shape and defaults. Pure, shared by the app and the
// email server, so both read an old or partial save the same way.

import { COURSES, DEADLINE } from "./data.js";
import { normalizeHabits } from "./dailyhabits.js";

export const DEFAULT_SETTINGS = {
  weekdayMin: 150,
  weekendMin: 240,
  deadline: DEADLINE,
  bufferDays: 2,
  includeOptional: false,
  when: "7:00 pm",
  where: "my desk",
  identity: "I am someone who understands machine learning from first principles.",
  // Habit stacking + habit tracking: "After [CURRENT HABIT], I will [TRACK MY HABIT]."
  stackAfter: "I finish dinner",
  stackTrack: "close the day in Goals",
  minimum: "Open the Up Next lesson and finish just that one.",
  bundle: "",
  bundleAligned: "",
  ritual: ["Phone in another room", "Water and a snack on the desk", "Udemy open next to a blank notebook"],
  avoid: [
    { id: "phone-in-another-room-while-studying", name: "Phone in another room while studying", amount: 0 },
    { id: "skip-buying-snacks-or-coffee-out", name: "Skip buying snacks or coffee out", amount: 4 },
  ],
  jarLabel: "Olympiad fund",
  jarTarget: 100,
  currency: "$",
  sound: true,
};

export const DEFAULT_CONTRACT = {
  goal: "Finish both ML courses by October 31, 2026, as the foundation for AI Olympiad prep.",
  habits: [
    "Show up every scheduled day and finish at least the Up Next lesson.",
    "Follow the daily plan the app builds, math first, then code.",
    "Attempt every Solve first exercise before watching the answer.",
    "Send my partner a check-in every evening.",
  ],
  penaltyAmount: 10,
  penaltyAction: "pay my accountability partner the same day",
  publicPenalty: "",
  partners: [
    { name: "", contact: "" },
    { name: "", contact: "" },
  ],
  signer: "",
  partnerSigs: ["", ""],
  signedAt: null,
};

export function fresh() {
  const completed = {};
  for (const c of COURSES) for (const n of c.preDone || []) completed[`${c.id}-${n}`] = "pre";
  return normalize({ completed, settings: { ...DEFAULT_SETTINGS } });
}

export function normalize(s) {
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  s.completed = s.completed || {};
  s.ritual = s.ritual || { date: null, checks: [] };
  s.history = s.history || {};
  s.celebrated = s.celebrated || {};
  s.dayLog = s.dayLog || {}; // { date: { mode: "full"|"min", closed, nsv } }
  s.checkins = s.checkins || {}; // { date: { energy, focus, calm } }
  s.notes = s.notes || {}; // { lessonId: { text, at } }
  s.actual = s.actual || {}; // { lessonId: measured minutes }
  s.tickAt = s.tickAt || {}; // { lessonId: ms }
  s.session = s.session || null; // running lesson timer
  s.avoidLog = s.avoidLog || {};
  s.transferred = Number(s.transferred) || 0;
  s.milestones = s.milestones || {};
  s.penaltyPaid = s.penaltyPaid || {};
  s.contractLog = s.contractLog || [];
  s.habits = normalizeHabits(s.habits); // your own daily habits (js/dailyhabits.js)
  s.habitLog = s.habitLog && typeof s.habitLog === "object" ? s.habitLog : {}; // { date: { habitId: "full"|"min" } }
  const c = { ...DEFAULT_CONTRACT, ...(s.contract || {}) };
  c.partners = [0, 1].map((i) => ({ name: "", contact: "", ...(c.partners?.[i] || {}) }));
  c.partnerSigs = [0, 1].map((i) => c.partnerSigs?.[i] || "");
  c.habits = Array.isArray(c.habits) ? c.habits : DEFAULT_CONTRACT.habits;
  s.contract = c;
  return s;
}
