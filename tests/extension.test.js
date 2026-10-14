import { test } from "node:test";
import assert from "node:assert/strict";
import { blockedNow, unlock, unlocksLeft, sentenceOk, isBlockedUrl, endsLabel, redirectRule, SENTENCE, UNLOCK } from "../extension/rules.js";

// Local times (the extension runs on the computer's own clock).
const at = (y, mo, d, h, m = 0) => new Date(y, mo - 1, d, h, m).getTime();
const WED = (h, m) => at(2026, 10, 14, h, m);
const SAT = (h, m) => at(2026, 10, 17, h, m);

test("focus guard: blocked during the work day only", () => {
  assert.equal(blockedNow(WED(14, 31)), false, "still at school");
  assert.equal(blockedNow(WED(14, 32)), true, "home: work starts");
  assert.equal(blockedNow(WED(21, 59)), true);
  assert.equal(blockedNow(WED(22, 0)), false, "done at 10 PM");
  assert.equal(blockedNow(SAT(8, 59)), false);
  assert.equal(blockedNow(SAT(9, 0)), true, "weekends from 9 AM");
  assert.equal(endsLabel(WED(15, 0)), "10 PM");
});

test("focus guard: unlocking costs a sentence, a minute, and is capped", () => {
  const now = WED(16, 0);
  assert.match(unlock(now, {}, "let me in", 60).error, /exactly/);
  assert.match(unlock(now, {}, SENTENCE, 59).error, /Wait the full 60/);
  assert.ok(sentenceOk(`  ${SENTENCE.toUpperCase()}  `), "case and spacing forgiven");
  let s = unlock(now, {}, SENTENCE, 60);
  assert.equal(s.unlockUntil, now + UNLOCK.minutes * 60_000);
  assert.equal(blockedNow(now + 14 * 60_000, s), false, "open for 15 minutes");
  assert.equal(blockedNow(now + 15 * 60_000, s), true, "then it closes by itself");
  assert.equal(unlocksLeft(now, s), 1);
  s = unlock(WED(18, 0), s, SENTENCE, 60);
  assert.equal(unlocksLeft(WED(18, 0), s), 0);
  assert.match(unlock(WED(19, 0), s, SENTENCE, 60).error, /No unlocks left today/);
  assert.equal(unlocksLeft(at(2026, 10, 15, 15), s), UNLOCK.perDay, "a new day, fresh unlocks");
  assert.match(unlock(WED(23, 0), {}, SENTENCE, 60).error, /Not blocked/);
});

test("focus guard: the rule catches YouTube and nothing else", () => {
  const re = new RegExp(redirectRule("chrome-extension://x/blocked.html").condition.regexFilter);
  for (const u of ["https://www.youtube.com/watch?v=1", "https://m.youtube.com/", "https://youtu.be/abc", "http://youtube.com/"]) assert.ok(re.test(u), u);
  for (const u of ["https://www.udemy.com/course/x", "https://notyoutube.com/", "https://www.arnavcalendar.online/goals/"]) assert.equal(re.test(u), false, u);
  assert.ok(isBlockedUrl("https://www.youtube.com/watch?v=1"));
  assert.equal(isBlockedUrl("javascript:alert(1)"), false, "unlock can only send you back to a blocked site");
  assert.equal(isBlockedUrl("https://evil.example/?youtube.com"), false);
});
