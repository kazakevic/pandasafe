// Keeps declarativeNetRequest in step with the settings: the static Shorts
// ruleset is switched on/off, and each blocked channel gets a dynamic rule
// that redirects full page loads of youtube.com/@handle to home.

importScripts("shared.js");

const CHANNEL_RULE_ID_BASE = 1000;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const channelRule = (channel, index) => ({
  id: CHANNEL_RULE_ID_BASE + index,
  priority: 1,
  action: { type: "redirect", redirect: { url: HOME_URL } },
  condition: {
    regexFilter: `^https://www\\.youtube\\.com(?:${handlePathForms(channel.handle)
      .map(escapeRegex)
      .join("|")})(?:[/?].*)?$`,
    isUrlFilterCaseSensitive: false,
    resourceTypes: ["main_frame"],
  },
});

const syncRules = async () => {
  const { blockShorts, blockedChannels } = await getSettings();

  await chrome.declarativeNetRequest.updateEnabledRulesets(
    blockShorts ? { enableRulesetIds: ["block_shorts"] } : { disableRulesetIds: ["block_shorts"] },
  );

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: blockedChannels.map(channelRule),
  });
};

// Run one sync at a time: overlapping remove/add calls would collide on ids.
let pending = Promise.resolve();
const scheduleSync = () => {
  pending = pending.then(syncRules).catch((error) => console.error("PandaSafe: rule sync failed", error));
};

chrome.runtime.onInstalled.addListener(scheduleSync);
chrome.runtime.onStartup.addListener(scheduleSync);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ("blockShorts" in changes || "blockedChannels" in changes)) scheduleSync();
});
