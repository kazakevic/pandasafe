// Keeps declarativeNetRequest in step with the settings: the static Shorts
// ruleset is switched on/off, each blocked channel gets a dynamic rule that
// redirects full page loads of youtube.com/@handle to home, and one dynamic
// rule sends page loads of blocked sites to the extension's blocked page.
// Sites and channels are the user's lists plus the ones from the blacklist
// API, fetched on startup, every API_REFRESH_MINUTES and on request from the
// popup.

importScripts("shared.js", "secret-store.js");

const SITES_RULE_ID = 1;
const CHANNEL_RULE_ID_BASE = 1000;
const BLOCKED_PAGE = chrome.runtime.getURL("src/blocked/blocked.html");
const API_ALARM = "pandasafe:sync-api";
const API_REFRESH_MINUTES = 15;

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
  const settings = await getSettings();
  const { blockShorts } = settings;
  const blockedSites = allBlockedSites(settings);
  // Chrome caps regex rules (the sites rule is one too). Channels past the
  // cap are still caught by youtube-channels.js, just after the page loads.
  const blockedChannels = allBlockedChannels(settings).slice(
    0,
    chrome.declarativeNetRequest.MAX_NUMBER_OF_REGEX_RULES - 1,
  );

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

// Accept a plain array or an array under a common key (docs/api.md names
// the main one), of strings or objects carrying the value under some key.
const apiList = (body, listKeys, itemKeys, parse) => {
  const items = Array.isArray(body) ? body : listKeys.map((key) => body?.[key]).find(Array.isArray);
  if (!items) throw new Error("Unexpected response from the API.");
  return items.map((item) => {
    const value =
      typeof item === "string" ? item : itemKeys.map((key) => item?.[key]).find((v) => typeof v === "string");
    return parse(value, item);
  });
};

const apiSiteList = (body) => {
  const sites = apiList(
    body,
    ["websites", "blockedWebsites", "sites", "domains", "data", "items"],
    ["domain", "url", "website", "host", "site"],
    parseSite,
  );
  return [...new Set(sites.filter(Boolean))];
};

// Names and avatars are optional. Without a name, one learned on YouTube
// earlier (youtube-channels.js) is kept.
const apiChannelList = (body, previous) => {
  const known = new Map(previous.map((c) => [handleKey(c.handle), c]));
  const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  const toChannel = (value, item) => {
    const handle = parseHandle(value);
    if (!handle) return null;
    const before = known.get(handleKey(handle));
    return { handle, name: text(item?.name) ?? before?.name, avatar: text(item?.avatar) ?? before?.avatar };
  };
  const channels = apiList(
    body,
    ["channels", "blockedChannels", "data", "items"],
    ["handle", "url", "channel"],
    toChannel,
  );
  const unique = new Map();
  for (const channel of channels) {
    if (channel && !unique.has(handleKey(channel.handle))) unique.set(handleKey(channel.handle), channel);
  }
  return [...unique.values()];
};

// The base URL to fetch from, if the API is set up. Installs from before the
// base URL setting only stored a key, for the default API.
const apiBaseUrl = async (key) => (await getSettings()).apiBase || (key ? DEFAULT_API_BASE : "");

// One list from the API. Null if the server doesn't serve it (404), so a
// server can offer just websites or just channels.
const fetchApiList = async (url, key) => {
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    cache: "no-store",
    credentials: "omit",
  });
  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) {
    throw new Error(key ? "The API key was rejected." : "The API needs a key.");
  }
  if (!response.ok) throw new Error(`The API answered ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new Error("The API didn't answer with JSON.");
  }
};

// On failure the last fetched lists stay blocked: a network blip or a
// revoked key shouldn't unblock anything.
const syncApi = async () => {
  const key = await getApiKey();
  const base = await apiBaseUrl(key);
  if (!base) {
    await chrome.storage.local.set({ apiSites: [], apiChannels: [], apiSync: {} });
    return;
  }
  const { apiSync, apiChannels: previous } = await getSettings();
  try {
    const [websites, channels] = await Promise.all([
      fetchApiList(`${base}/blocked-websites`, key),
      fetchApiList(`${base}/blocked-channels`, key),
    ]);
    if (!websites && !channels) throw new Error("No blacklists found at this URL.");
    await chrome.storage.local.set({
      apiSites: websites ? apiSiteList(websites) : [],
      apiChannels: channels ? apiChannelList(channels, previous) : [],
      apiSync: { at: Date.now() },
    });
  } catch (error) {
    const message = error instanceof TypeError ? "Couldn't reach the API." : error.message;
    await chrome.storage.local.set({ apiSync: { at: apiSync.at, error: message } });
  }
};

let pendingApi = Promise.resolve();
const scheduleApiSync = () =>
  (pendingApi = pendingApi.then(syncApi).catch((error) => console.error("PandaSafe: API sync failed", error)));

// Run one sync at a time: overlapping remove/add calls would collide on ids.
let pending = Promise.resolve();
const scheduleSync = () => {
  pending = pending.then(syncRules).catch((error) => console.error("PandaSafe: rule sync failed", error));
};

const onStart = () => {
  scheduleSync();
  scheduleApiSync();
  chrome.alarms.create(API_ALARM, { periodInMinutes: API_REFRESH_MINUTES });
};
chrome.runtime.onInstalled.addListener(onStart);
chrome.runtime.onStartup.addListener(onStart);
chrome.alarms.onAlarm.addListener((alarm) => alarm.name === API_ALARM && scheduleApiSync());

// The popup asks for a fetch after the key changes or on "Refresh". Only
// extension pages may ask: content scripts have a tab.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "pandasafe:sync-api" || sender.id !== chrome.runtime.id || sender.tab) return;
  scheduleApiSync().then(() => sendResponse(true));
  return true;
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  const keys = ["blockShorts", "blockedChannels", "blockedSites", "apiSites", "apiChannels"];
  if (keys.some((key) => key in changes)) scheduleSync();
  const siteChange = changes.blockedSites ?? changes.apiSites;
  if (siteChange) {
    const before = siteChange.oldValue ?? [];
    const fresh = (siteChange.newValue ?? []).filter((site) => !before.includes(site));
    if (!fresh.length) return;
    // A site that moved from one list to the other was already blocked.
    const settings = await getSettings();
    const other = changes.blockedSites ? settings.apiSites : settings.blockedSites;
    const added = fresh.filter((site) => !other.includes(site));
    if (added.length) closeOpenTabs(added).catch((error) => console.error("PandaSafe: closing tabs failed", error));
  }
});
