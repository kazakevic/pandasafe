// Keeps declarativeNetRequest in step with the settings: the static Shorts
// ruleset is switched on/off, each blocked channel gets a dynamic rule that
// redirects full page loads of youtube.com/@handle to home, and one dynamic
// rule sends page loads of blocked sites to the extension's blocked page.

importScripts("shared.js");

const SITES_RULE_ID = 1;
const CHANNEL_RULE_ID_BASE = 1000;
const BLOCKED_PAGE = chrome.runtime.getURL("src/blocked/blocked.html");

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

// requestDomains matches subdomains too, so "example.com" covers www. and
// any other subdomain. The blocked page gets the original URL in its hash.
const sitesRule = (sites) => ({
  id: SITES_RULE_ID,
  priority: 10, // wins over the YouTube rules when youtube.com itself is blocked
  action: { type: "redirect", redirect: { regexSubstitution: `${BLOCKED_PAGE}#\\0` } },
  condition: {
    regexFilter: "^https?://.*",
    requestDomains: sites,
    resourceTypes: ["main_frame"],
  },
});

const syncRules = async () => {
  const { blockShorts, blockedChannels, blockedSites } = await getSettings();

  await chrome.declarativeNetRequest.updateEnabledRulesets(
    blockShorts ? { enableRulesetIds: ["block_shorts"] } : { disableRulesetIds: ["block_shorts"] },
  );

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: [...blockedChannels.map(channelRule), ...(blockedSites.length ? [sitesRule(blockedSites)] : [])],
  });
};

// Rules only catch new page loads, so send tabs already open on a newly
// blocked site to the blocked page too.
const closeOpenTabs = async (sites) => {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    if (siteMatch(new URL(tab.url).hostname, sites)) {
      chrome.tabs.update(tab.id, { url: `${BLOCKED_PAGE}#${tab.url}` }).catch(() => {});
    }
  }
};

// Run one sync at a time: overlapping remove/add calls would collide on ids.
let pending = Promise.resolve();
const scheduleSync = () => {
  pending = pending.then(syncRules).catch((error) => console.error("PandaSafe: rule sync failed", error));
};

chrome.runtime.onInstalled.addListener(scheduleSync);
chrome.runtime.onStartup.addListener(scheduleSync);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if ("blockShorts" in changes || "blockedChannels" in changes || "blockedSites" in changes) scheduleSync();
  if (changes.blockedSites) {
    const before = changes.blockedSites.oldValue ?? [];
    const added = (changes.blockedSites.newValue ?? []).filter((site) => !before.includes(site));
    if (added.length) closeOpenTabs(added).catch((error) => console.error("PandaSafe: closing tabs failed", error));
  }
});
