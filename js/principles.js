// Atomic Habits, as a daily operating manual instead of a book you finished.
//
// Every principle is paraphrased (not quoted) and paired with one concrete
// action computed from today's state. The emails pick the principle that
// fits the situation (missed yesterday, halfway, nothing done by evening...)
// and otherwise rotate through the book so no idea repeats for weeks.
//
// law: 0 = foundations, 1-4 = the Four Laws, 5 = advanced tactics.

const fmt = (m) => {
  m = Math.round(m);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${String(r).padStart(2, "0")}m` : `${h}h`;
};
const nextTitle = (F) => (F.next ? `"${F.next.title}"` : "the next lesson");

export const LAW_NAMES = {
  0: "Foundations",
  1: "1st Law · Make it obvious",
  2: "2nd Law · Make it attractive",
  3: "3rd Law · Make it easy",
  4: "4th Law · Make it satisfying",
  5: "Advanced tactics",
};

export const PRINCIPLES = [
  // ---------- foundations
  {
    id: "one-percent", law: 0, title: "1% better compounds",
    idea: "Tiny improvements look like nothing on any single day. Compounded, 1% better daily is about 37 times better in a year, and 1% worse daily decays to almost zero. Today only has to be a little better than nothing.",
    action: (F) => `Today's 1% is ${F.planLessons.length || "one"} lesson${F.planLessons.length === 1 ? "" : "s"}. Not the course, not the olympiad. Just ${nextTitle(F)} first.`,
  },
  {
    id: "systems", law: 0, title: "Systems beat goals",
    idea: "Winners and losers share the same goals. The goal sets direction; the system (when, where, how you work every day) decides the result. You don't rise to your goals, you fall to your systems.",
    action: (F) => `Don't think about Oct 31. Run the system: ${F.s.when} at ${F.s.where}, Up Next lesson, tick, repeat.`,
  },
  {
    id: "identity", law: 0, title: "Every action is a vote",
    idea: "Lasting change is identity change. You don't need a unanimous vote to become someone, only a majority. Each lesson finished is evidence for the person you're becoming.",
    action: (F) => `You've cast ${F.votes} vote${F.votes === 1 ? "" : "s"} for "${F.s.identity}" Today adds ${F.planLessons.length || 1} more.`,
  },
  {
    id: "plateau", law: 0, title: "The plateau of latent potential",
    idea: "Ice doesn't melt from 25 to 31 degrees, then melts at 32. The work wasn't wasted, it was stored. Early progress is invisible; quitting in the valley of disappointment is the most common failure.",
    action: (F) => `If the math still feels foggy, that's the plateau, not a verdict. ${F.shownUpDays} day${F.shownUpDays === 1 ? "" : "s"} stored so far. Keep heating the ice.`,
  },
  {
    id: "habit-loop", law: 0, title: "Cue, craving, response, reward",
    idea: "Every habit runs the same loop. Make the cue obvious, the craving attractive, the response easy and the reward satisfying. When a habit fails, one link in that loop is broken. Find it.",
    action: () => "If you stall today, name the broken link: no cue (didn't know when), no craving (dreaded it), too hard (didn't know where to start), or no reward. Then fix that link only.",
  },

  // ---------- 1st law: obvious
  {
    id: "implementation-intention", law: 1, title: "Implementation intention",
    idea: "People who decide exactly when and where they'll act are far more likely to follow through. Vague intent waits for motivation; a plan with a time and place doesn't.",
    action: (F) => `Say it once: "I will study ML at ${F.s.when} at ${F.s.where}." If today's time is different, decide the new time now, not later.`,
  },
  {
    id: "habit-stacking", law: 1, title: "Habit stacking",
    idea: "Attach the new habit to one you already do without thinking: After [current habit], I will [new habit]. The old habit becomes the cue.",
    action: (F) => `Use your stack: after ${F.s.stackAfter}, ${F.s.stackTrack}. Add one more: after you sit down at ${F.s.where}, open ${nextTitle(F)} before anything else.`,
  },
  {
    id: "environment", law: 1, title: "Environment beats motivation",
    idea: "Most behavior is a response to what's in front of you. Make the cues for good habits visible and the cues for bad ones invisible. Design the room, not your willpower.",
    action: () => "Before you start: Udemy open, notebook open, phone in another room. The fewer things in view that aren't ML, the less you negotiate.",
  },
  {
    id: "one-space", law: 1, title: "One space, one use",
    idea: "Context becomes the cue. If your desk is also where you scroll and game, it cues all three. Give studying its own place, even if it's one chair or one corner.",
    action: (F) => `${F.s.where} is for ML today. If you catch yourself scrolling there, stand up and do it somewhere else.`,
  },
  {
    id: "scorecard", law: 1, title: "Habits scorecard",
    idea: "You can't change what you don't notice. List what you actually do in a day and mark each habit as helping (+), hurting (-) or neutral (=) relative to who you want to be.",
    action: () => "Tonight, write down the 3 things that most often eat the time you planned for ML. Mark each one + or -. That's your next habit to redesign.",
  },

  // ---------- 2nd law: attractive
  {
    id: "temptation-bundling", law: 2, title: "Temptation bundling",
    idea: "Pair something you need to do with something you want to do. The anticipation of the reward, not the reward itself, is what gets you moving.",
    action: (F) => F.s.bundle ? `Your reward today: ${F.s.bundle}. It's locked until 100%. Think about it before you start, not after.` : "You haven't set a reward yet. Pick one in Settings that fits your identity, so 100% means something tonight.",
  },
  {
    id: "reframe", law: 2, title: "\"I get to\", not \"I have to\"",
    idea: "The same task feels different depending on how you frame it. \"I have to study\" is a burden. \"I get to build the skills for an olympiad\" is an opportunity most people never take.",
    action: () => "Rewrite today's plan in your head as \"I get to\". You get to understand the math that runs every model you've heard of.",
  },
  {
    id: "motivation-ritual", law: 2, title: "Motivation ritual",
    idea: "Do the same short routine before every session until the routine itself puts you in the mood. The ritual becomes a cue for focus.",
    action: (F) => `Your ritual: ${(F.s.ritual || []).join(" → ") || "pick 2-3 steps in Settings"}. Run it exactly, then press play.`,
  },
  {
    id: "culture", law: 2, title: "Join a culture where it's normal",
    idea: "We copy the close, the many and the powerful. Habits are easy when the people around you already do them. Find the group where studying ML is the normal thing to do.",
    action: (F) => F.partner ? `Send ${F.partner.name} today's check-in. Being seen by someone who expects it is half the effect.` : "Name one person or group (a friend prepping, a Discord, a class) and tell them what you're doing this month. Then add them as your partner.",
  },

  // ---------- 3rd law: easy
  {
    id: "two-minute", law: 3, title: "The two-minute rule",
    idea: "When starting is hard, scale the habit down to something that takes two minutes. You can't improve a habit that doesn't exist. Master showing up first.",
    action: (F) => `Two minutes: open ${nextTitle(F)} and press play. That's the whole commitment. Keep going only if you want to.`,
  },
  {
    id: "friction", law: 3, title: "Reduce friction",
    idea: "The habit that wins is usually the easiest one, not the best one. Remove steps between you and the good habit; add steps between you and the bad one.",
    action: () => "Remove one step tonight: leave the course tab pinned and the notebook open on the desk, so tomorrow starts at zero effort.",
  },
  {
    id: "prime", law: 3, title: "Prime the environment",
    idea: "Set the space up for the next action before you need it. Reset the room when you finish so the next session starts itself.",
    action: () => "When you finish today, leave tomorrow's first lesson loaded and a fresh notebook page with the lesson title already written.",
  },
  {
    id: "decisive-moments", law: 3, title: "Decisive moments",
    idea: "A few small choices each day act like forks in the road: what you do the moment you get home decides the next two hours. Win those moments and the rest follows.",
    action: (F) => `Your fork is the minute before ${F.s.when}. Phone away and Udemy open, and the next 2 hours mostly decide themselves.`,
  },
  {
    id: "repetitions", law: 3, title: "Repetitions, not time",
    idea: "Habits form from the number of times you do something, not how long you've been doing it. Optimizing the perfect plan is a way of avoiding action. Reps first.",
    action: (F) => `Today is rep #${F.shownUpDays + (F.shownToday ? 0 : 1)}. Don't redesign the plan, run it.`,
  },
  {
    id: "commitment-device", law: 3, title: "Commitment devices",
    idea: "Make the good choice now so future-you can't back out. A choice made in advance removes the decision when willpower is lowest.",
    action: (F) => F.signedDay ? "Your contract is signed. Missing twice costs money and face. Let that make tonight's decision for you." : "You haven't signed a habit contract yet. Ten minutes in the System tab turns \"I'll do it tomorrow\" into something that costs.",
  },

  // ---------- 4th law: satisfying
  {
    id: "cardinal-rule", law: 4, title: "What is rewarded is repeated",
    idea: "Your brain repeats what feels good immediately and avoids what feels bad immediately. The payoff of studying is months away, so give yourself a small reward right at the end of each session.",
    action: (F) => `After the last lesson today, take the reward on purpose${F.s.bundle ? `: ${F.s.bundle}` : ""}. Make finishing feel good tonight, not in February.`,
  },
  {
    id: "dont-break-chain", law: 4, title: "Don't break the chain",
    idea: "A visual record of your progress is satisfying on its own. Each day you show up adds a link; the chain itself becomes the motivation.",
    action: (F) =>
      F.shownToday
        ? `Today's link is already in: ${F.streak} day${F.streak === 1 ? "" : "s"} and counting. Finish the list and it's a perfect day, not just a kept one.`
        : F.streak > 0
          ? `Your chain is ${F.streak} day${F.streak === 1 ? "" : "s"}. One lesson keeps it alive.`
          : "Your chain starts at 1. Make today link one.",
  },
  {
    id: "never-miss-twice", law: 4, title: "Never miss twice",
    idea: "Missing once is an accident. Missing twice is the start of a new habit. The first mistake is never the one that ruins you; it's the spiral after it.",
    action: (F) => `${F.missRun ? "Yesterday was the miss. Today can't be." : "If today falls apart,"} do the minimum: ${F.s.minimum}`,
  },
  {
    id: "bad-days", law: 4, title: "Show up on bad days",
    idea: "Doing a smaller version on a bad day matters more than doing it perfectly on a good day. It keeps the identity alive and the streak honest.",
    action: (F) => `Bad-day mode is one lesson: ${F.next ? F.next.title : "the Up Next lesson"}. It counts for the chain, the rest re-plans itself.`,
  },
  {
    id: "measure-right", law: 4, title: "Don't measure the wrong thing",
    idea: "When a measure becomes the target, it stops being a good measure. Ticks are not learning. The real metric is whether you can explain it.",
    action: () => "After each lesson, write its core idea in one sentence. If you can't, you watched it, you didn't learn it.",
  },

  // ---------- advanced
  {
    id: "goldilocks", law: 5, title: "The Goldilocks rule",
    idea: "Peak motivation lives at the edge of your ability: about 4% harder than what you can already do. Too easy is boring, too hard is discouraging.",
    action: () => "Pick the Solve first exercise in today's plan and genuinely try it before the solution. That's the right difficulty: hard enough to stretch, not impossible.",
  },
  {
    id: "boredom", law: 5, title: "Fall in love with boredom",
    idea: "The greatest threat to success isn't failure, it's boredom. Professionals keep the schedule when the work stops being exciting; amateurs wait to feel like it.",
    action: () => "If today's lessons feel repetitive, good. Do them anyway. That is exactly what professionals do and amateurs don't.",
  },
  {
    id: "deliberate-practice", law: 5, title: "Habits + deliberate practice = mastery",
    idea: "Automatic habits free your mind for the next challenge, but they also stop you from noticing mistakes. Mastery means building a habit, then deliberately pushing on the part that's still weak.",
    action: () => "Pick the weakest topic from this week and redo one exercise from a blank page, no video. That's practice, not review.",
  },
  {
    id: "review", law: 5, title: "Reflection and review",
    idea: "Without review you repeat the same mistakes. A short, regular look back (what went well, what didn't, what you learned) keeps habits pointed at the person you want to be.",
    action: () => "Close the day in the app: rate energy, focus and calm, and write one win no number shows. 20 seconds.",
  },
  {
    id: "keep-identity-small", law: 5, title: "Keep your identity flexible",
    idea: "Tie your identity to a single result and losing it breaks you. Tie it to the kind of person you are (someone who learns from first principles) and it survives any score.",
    action: () => "Whatever Round 1 brings, you're someone who understands the math. That's the part no ranking can take away.",
  },
];

const BY_ID = Object.fromEntries(PRINCIPLES.map((p) => [p.id, p]));
export const principle = (id) => BY_ID[id];

// Stable rotation: a different principle each day, cycling through the book.
export function rotation(dayIndex, slot) {
  const offset = { morning: 0, midday: 11, evening: 19 }[slot] || 0;
  const n = PRINCIPLES.length;
  return PRINCIPLES[(((dayIndex * 7 + offset) % n) + n) % n]; // 7 is coprime with n, so all are visited
}

// Situations first, rotation second. The situation wins because the right
// idea at the right moment beats the next idea in the list. The three emails
// of one day never teach the same idea twice.
function situational(F, slot, dayIndex) {
  const p = (id) => BY_ID[id];
  if (slot === "morning") {
    if (F.missRun >= 2) return p("two-minute");
    if (F.missRun === 1) return p("never-miss-twice");
    if (F.mode === "min") return p("bad-days");
    if (F.shownUpDays === 0) return p("implementation-intention");
  }
  if (slot === "midday") {
    if (F.complete) return p("cardinal-rule");
    if (!F.shownToday) return p("two-minute");
    if (F.pct >= 50) return p("dont-break-chain");
  }
  if (slot === "evening") {
    if (F.complete) return dayIndex % 2 ? p("review") : p("identity");
    if (!F.shownToday) return F.missRun >= 1 ? p("never-miss-twice") : p("two-minute");
    return p("decisive-moments");
  }
  return null;
}

const SLOTS = ["morning", "midday", "evening"];

export function pickPrinciple(F, slot, dayIndex) {
  const used = new Set();
  let out = null;
  for (const sl of SLOTS) {
    let pr = situational(F, sl, dayIndex) || rotation(dayIndex, sl);
    for (let i = 1; used.has(pr.id) && i <= PRINCIPLES.length; i++) pr = rotation(dayIndex + i, sl);
    used.add(pr.id);
    if (sl === slot) out = pr;
  }
  return out || rotation(dayIndex, slot);
}

export { fmt as fmtMinutes };
