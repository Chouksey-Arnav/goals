import { test } from "node:test";
import assert from "node:assert/strict";
import { fresh } from "../js/state.js";
import { dayFacts } from "../js/digest.js";
import { reviewFacts, gradeDay, checkReview, fallbackReview, composeReview, buildReviewMessages, REVIEW_SCHEMA } from "../js/review.js";
import { writeReview } from "../api/_lib/run.js";
import { dueSlots } from "../js/schedule.js";

const T = "2026-10-14"; // a Wednesday

function day({ lessons = 0, habit = null, closed = false, fastTicks = false } = {}) {
  const s = fresh();
  const F0 = dayFacts(s, T);
  const base = Date.parse(`${T}T20:00:00Z`);
  F0.planLessons.slice(0, lessons).forEach((l, i) => {
    s.completed[l.id] = T;
    s.tickAt[l.id] = base + i * (fastTicks ? 60_000 : 40 * 60_000);
  });
  if (habit !== undefined) {
    s.habits = [{ id: "h1", name: "Read Atomic Habits", amount: "10 pages", twoMin: "One page", time: "9:30 pm", place: "bed", after: "", identity: "", days: [0, 1, 2, 3, 4, 5, 6], created: "2026-10-01", createdAt: 1, archived: null }];
    if (habit) s.habitLog = { [T]: { h1: habit } };
  }
  if (closed) s.dayLog[T] = { closed: true };
  return { s, F: dayFacts(s, T) };
}

const AGENDA = {
  day: T,
  appUrl: "https://cal.example",
  events: [
    { title: "Soccer practice", time: "4:00 PM – 6:00 PM", allDay: false },
    { title: "Due: Lab report", time: "Due 11:59 PM", allDay: false },
  ],
  tasks: {
    open: [
      { title: "Email Mr. Patel", due: T, overdue: false },
      { title: "History essay outline", due: "2026-10-11", overdue: true },
      { title: "Someday idea", due: null, overdue: false },
    ],
    doneToday: [{ title: "Sign permission slip" }],
    blocks: [{ title: "Essay session 1/3", time: "7:00 PM", done: false, past: true }],
    addedToday: { count: 1 },
  },
};

test("facts: a half day is recorded as partial and missed, never as done", () => {
  const { s, F } = day({ lessons: 1, habit: null });
  const { facts } = reviewFacts(F, s, { agenda: AGENDA });
  const course = facts.find((f) => f.area === "courses" && /Course plan/.test(f.text));
  assert.equal(course.status, "partial");
  assert.match(course.text, /1 of \d+ planned lessons done/);
  assert.equal(facts.find((f) => /Read Atomic Habits/.test(f.text)).status, "missed");
  const missed = facts.filter((f) => f.status === "missed").map((f) => f.text).join("\n");
  assert.match(missed, /Email Mr\. Patel/, "due today, not done");
  assert.match(missed, /History essay outline.*3 days late/, "overdue, with how late");
  assert.match(missed, /Essay session 1\/3.*picked that time yourself/, "a skipped block you scheduled");
  assert.doesNotMatch(missed, /Someday idea/, "an undated to-do isn't a miss");
  assert.match(facts.find((f) => f.status === "done" && /Sign permission slip/.test(f.text)).text, /To-do done/);
  // Events are context, never accomplishments.
  const ev = facts.find((f) => /Soccer practice/.test(f.text));
  assert.equal(ev.status, "info");
  assert.match(ev.text, /attendance not tracked/);
  assert.equal(facts.find((f) => /Lab report/.test(f.text)).status, "info", "a deadline isn't proof you submitted");
});

test("facts: fast ticks, unexplained lessons and list-making are called out", () => {
  const { s, F } = day({ lessons: 4, fastTicks: true });
  const agenda = { ...AGENDA, tasks: { ...AGENDA.tasks, addedToday: { count: 9 }, doneToday: [{ title: "x" }] } };
  const { facts } = reviewFacts(F, s, { agenda });
  assert.ok(facts.some((f) => f.flag === "fast" && f.status === "missed"));
  assert.equal(facts.find((f) => /core idea/.test(f.text)).status, "missed", "no notes written");
  assert.ok(facts.some((f) => f.flag === "listing" && /Jotted 9 new to-dos today and finished 1/.test(f.text)));
  const g = gradeDay(facts);
  assert.ok(g.pct <= 74 && g.capped.some((c) => /too fast/.test(c)), "fast ticks cap the grade at C");
});

test("grade: computed by code; a perfect day is an A, nothing done is an F", () => {
  const all = day({ lessons: 99, habit: "full", closed: true });
  const good = gradeDay(reviewFacts(all.F, all.s, { agenda: { ...AGENDA, tasks: { open: [], doneToday: [{ title: "a" }], blocks: [] } } }).facts);
  assert.equal(good.letter, "A");
  assert.equal(good.pct, 100);
  const none = day({ lessons: 0, habit: null });
  const bad = gradeDay(reviewFacts(none.F, none.s, { agenda: { ...AGENDA, tasks: { ...AGENDA.tasks, doneToday: [] } } }).facts);
  assert.equal(bad.letter, "F");
  assert.equal(bad.pct, 0);
  // Two-minute version is half credit, not full.
  const min = day({ lessons: 99, habit: "min", closed: true });
  assert.ok(gradeDay(reviewFacts(min.F, min.s, { agenda: null }).facts).pct < 100);
});

test("grade: nothing to judge means no review", () => {
  assert.equal(gradeDay([{ id: "F1", area: "self", status: "info", text: "x" }]), null);
});

const setup = () => {
  const { s, F } = day({ lessons: 1, habit: null });
  const { facts, tomorrow } = reviewFacts(F, s, { agenda: AGENDA });
  return { facts, grade: gradeDay(facts), tomorrow };
};
const idOf = (facts, re) => facts.find((f) => re.test(f.text)).id;

test("checkReview: claiming a missed thing as done is dropped", () => {
  const { facts, grade, tomorrow } = setup();
  const habit = idOf(facts, /Read Atomic Habits/);
  const r = checkReview(
    {
      headline: `${grade.letter}. Not enough.`,
      verdict: "You did one lesson. The habit didn't happen.",
      did: [{ fact: habit, line: "You read Atomic Habits." }, { fact: "F999", line: "You went to soccer." }],
      missed: [],
      pattern: "",
      tomorrow: [],
      question: "Why?",
    },
    { facts, grade, tomorrow }
  );
  assert.equal(r.did.length, 0, "a missed habit can't be listed as done, an unknown fact can't be cited");
  assert.ok(r.dropped.length >= 2);
  // Every missed fact is in the email even though the model listed none.
  for (const f of facts.filter((x) => x.status === "missed")) assert.ok(r.missed.some((m) => m.fact === f.id), `${f.text} is shown`);
});

test("checkReview: invented numbers, praise and comfort are stripped", () => {
  const { facts, grade, tomorrow } = setup();
  const course = idOf(facts, /Course plan/);
  const r = checkReview(
    {
      headline: "A+ day! Great job!",
      verdict: "Great job today! You finished 1 lesson. You studied for 5 hours. It's okay, tomorrow is a new day. The overdue outline is 3 days late.",
      did: [{ fact: course, line: "You did 7 lessons." }],
      missed: [{ fact: idOf(facts, /Email Mr\. Patel/), line: "Mr. Patel never got the email." }],
      pattern: "Don't worry about it. You keep scheduling work blocks and skipping them.",
      tomorrow: [{ order: "4 PM: open the outline and write the first paragraph.", fact: null }, { order: "Keep it up!", fact: null }],
      question: "What will you cut?",
    },
    { facts, grade, tomorrow }
  );
  assert.ok(r.headline.startsWith(grade.letter), "a headline with the wrong grade is replaced");
  assert.doesNotMatch(r.headline, /great job|!/i);
  assert.equal(r.verdict, "You finished 1 lesson. The overdue outline is 3 days late.", "praise, comfort and the invented 5 hours are gone");
  assert.equal(r.did.length, 0, "7 lessons isn't in the record");
  assert.equal(r.pattern, "You keep scheduling work blocks and skipping them.");
  assert.deepEqual(r.tomorrow, ["4 PM: open the outline and write the first paragraph."], "orders may name a time; cheerleading is dropped");
});

test("checkReview: an answer with no usable verdict falls back", () => {
  const { facts, grade, tomorrow } = setup();
  assert.equal(checkReview({ headline: "x", verdict: "Amazing work!", did: [], missed: [], pattern: "", tomorrow: [], question: "" }, { facts, grade, tomorrow }), null);
  assert.equal(checkReview("not json", { facts, grade, tomorrow }), null);
  assert.equal(checkReview(null, { facts, grade, tomorrow }), null);
});

test("fallbackReview: blunt, complete, no Groq needed", () => {
  const { facts, grade } = setup();
  const r = fallbackReview({ facts, grade });
  assert.equal(r.source, "rules");
  assert.ok(r.headline.startsWith(grade.letter));
  assert.equal(r.missed.length, facts.filter((f) => f.status === "missed").length);
  assert.ok(r.tomorrow.length >= 1 && r.tomorrow.length <= 3);
  const mail = composeReview(r, grade, { day: T, appUrl: "https://goals.example", calendarUrl: "https://cal.example" });
  assert.match(mail.subject, /^Day review · [A-F]\./);
  assert.match(mail.text, /DIDN'T HAPPEN[\s\S]*Email Mr\. Patel/);
  assert.ok(mail.text.indexOf("DIDN'T HAPPEN") < mail.text.indexOf("DONE"), "misses first");
  assert.match(mail.html, /Written without Groq/);
  assert.doesNotMatch(mail.html, /<script/i);
});

test("prompt: the grade is fixed, every fact has an id and status, schema is strict", () => {
  const { facts, grade, tomorrow } = setup();
  const [sys, user] = buildReviewMessages({ day: T, weekday: "Wednesday", grade, facts, tomorrow, name: "Sam" });
  assert.match(sys.content, /Do not change it/);
  assert.match(sys.content, /ruthless mentor/);
  assert.match(user.content, new RegExp(`GRADE \\(fixed\\): ${grade.letter}`));
  for (const f of facts) assert.ok(user.content.includes(`${f.id} [${f.status}]`));
  assert.equal(REVIEW_SCHEMA.additionalProperties, false);
  assert.deepEqual(REVIEW_SCHEMA.required.sort(), Object.keys(REVIEW_SCHEMA.properties).sort());
});

test("writeReview: Groq down or answering nonsense still sends the review", async () => {
  const { s, F } = day({ lessons: 1, habit: null });
  const ctx = { day: T, F, state: s, agenda: AGENDA, syncedAt: "Wed 9:58 PM" };
  const cfg = { groqKey: "k", groqModel: "m", appUrl: "https://goals.example", calendarUrl: "https://cal.example", name: "" };
  const io = { agenda: async () => null };
  const down = await writeReview(cfg, ctx, { ...io, ask: async () => { throw new Error("Groq 429"); } });
  assert.equal(down.source, "rules");
  assert.match(down.error, /429/);
  assert.match(down.mail.subject, /Day review/);
  const junk = await writeReview(cfg, ctx, { ...io, ask: async () => ({ json: { verdict: "Great job!" }, model: "m" }) });
  assert.equal(junk.source, "rules");
  const ok = await writeReview(cfg, ctx, {
    ...io,
    ask: async () => ({ json: { headline: `${down.grade.letter}. One lesson is not a plan.`, verdict: "You did 1 lesson and skipped the rest.", did: [], missed: [], pattern: "", tomorrow: [], question: "When do you start?" }, model: "m" }),
  });
  assert.equal(ok.source, "groq");
  assert.match(ok.mail.text, /One lesson is not a plan/);
  const noKey = await writeReview({ ...cfg, groqKey: "" }, ctx, { ...io, ask: async () => assert.fail("no key, no call") });
  assert.equal(noKey.source, "rules");
});

test("schedule: the review has its own window after the evening wrap", () => {
  const CFG = { morningHour: 7, middayHour: 14, eveningHour: 20, reviewHour: 22 };
  const sent = { morning: {}, midday: {} };
  assert.deepEqual(dueSlots(21, sent, CFG), ["evening"]);
  assert.deepEqual(dueSlots(22, { ...sent, evening: {} }, CFG), ["review"]);
  assert.deepEqual(dueSlots(23, { ...sent, evening: {}, review: {} }, CFG), []);
  assert.deepEqual(dueSlots(22, sent, CFG), ["review"], "a late evening wrap is superseded by the review");
});
