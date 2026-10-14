import { SENTENCE, UNLOCK, GOALS_URL, unlock, unlocksLeft, endsLabel, isBlockedUrl } from "./rules.js";

const $ = (id) => document.getElementById(id);
const state = await chrome.storage.local.get(["unlockUntil", "unlocks"]);
const now = Date.now();
const left = unlocksLeft(now, state);

$("why").textContent = `YouTube is blocked until ${endsLabel(now)}. Every "just one video" is how the evening disappears. Do the lesson first.`;
$("goals").href = GOALS_URL;
$("sentence").textContent = SENTENCE;
$("count").textContent = left
  ? `Unlocks left today: ${left} of ${UNLOCK.perDay} (${UNLOCK.minutes} minutes each).`
  : `No unlocks left today. It opens at ${endsLabel(now)}.`;
if (!left) $("want").disabled = true;

let opened = 0;
$("want").addEventListener("click", () => {
  $("gate").style.display = "block";
  $("want").style.display = "none";
  opened = Date.now();
  const timer = setInterval(() => {
    const waited = Math.floor((Date.now() - opened) / 1000);
    const rest = UNLOCK.waitSeconds - waited;
    $("go").disabled = rest > 0;
    $("go").textContent = rest > 0 ? `Wait ${rest}s` : `Unlock for ${UNLOCK.minutes} minutes`;
    if (rest <= 0) clearInterval(timer);
  }, 250);
});

$("go").addEventListener("click", async () => {
  const fresh = await chrome.storage.local.get(["unlockUntil", "unlocks"]);
  const next = unlock(Date.now(), fresh, $("typed").value, Math.floor((Date.now() - opened) / 1000));
  if (next.error) {
    $("err").textContent = next.error;
    return;
  }
  await chrome.storage.local.set(next);
  // The background worker drops the rule on the storage change; give it a
  // beat, then go where you were headed (only ever back to a blocked site).
  const wanted = decodeURIComponent(location.hash.slice(1));
  setTimeout(() => (location.href = isBlockedUrl(wanted) ? wanted : "https://www.youtube.com/"), 500);
});
