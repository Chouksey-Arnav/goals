// Turns the block on and off every minute, from rules.js. When it turns on
// (the work day starts, or an unlock runs out), YouTube tabs that are already
// open are sent to the blocked page too: the block can't be dodged by
// leaving a video open.
import { blockedNow, redirectRule, RULE_ID, SITES } from "./rules.js";

const PAGE = chrome.runtime.getURL("blocked.html");
const PATTERNS = SITES.flatMap((d) => [`*://${d}/*`, `*://*.${d}/*`]);

async function sync() {
  const state = await chrome.storage.local.get(["unlockUntil", "unlocks"]);
  const on = blockedNow(Date.now(), state);
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const has = current.some((r) => r.id === RULE_ID);
  if (on && !has) {
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [redirectRule(PAGE)] });
    for (const tab of await chrome.tabs.query({ url: PATTERNS })) {
      chrome.tabs.update(tab.id, { url: `${PAGE}#${tab.url}` }).catch(() => {});
    }
  }
  if (!on && has) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [RULE_ID] });
}

chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);
chrome.alarms.create("tick", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(sync);
chrome.storage.onChanged.addListener(sync);
sync();
