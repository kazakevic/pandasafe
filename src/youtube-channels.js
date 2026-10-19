// Blocks the channels on the user's blacklist and the API's (by @handle):
// - channel pages (/@handle/...) redirect home; full page loads are already
//   redirected by the dynamic DNR rules from background.js, this covers SPA
//   navigation;
// - watch pages of their videos redirect home once the owner is known;
// - their videos, channel cards and guide entries are hidden in every list.
//
// Most list items link to the channel (/@handle), which a generated
// stylesheet matches. Watch-page recommendations only show the channel's
// display name, so those are matched by name in JS. Names are learned from
// the popup (when a channel is added) and from items that show both.

const CHANNEL_ITEMS = [
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-playlist-video-renderer",
  "ytd-channel-renderer",
  "ytd-guide-entry-renderer",
  "yt-lockup-view-model",
].join(", ");

// Recommendation items that carry the channel name but no channel link.
// They only appear in the watch page's "up next" list, so scanning just that
// keeps the pass cheap on long home and search feeds.
const NAME_ONLY_ITEMS =
  "ytd-watch-next-secondary-results-renderer :is(yt-lockup-view-model, ytd-compact-video-renderer)";
const ITEM_CHANNEL_NAME = ".ytContentMetadataViewModelMetadataRow, ytd-channel-name #text";

let blockedChannels = [];
let blockedHandles = new Set();
let blockedNames = new Set();

const isBlockedHandle = (handle) => handle != null && blockedHandles.has(handleKey(handle));

const isBlockedChannelUrl = (url) => {
  try {
    const { hostname, pathname } = new URL(url, location.href);
    return hostname === "www.youtube.com" && isBlockedHandle(handleFromPath(pathname));
  } catch {
    return false;
  }
};

const leaveChannel = () => {
  document.querySelector("video")?.pause();
  location.replace(HOME_URL);
};

// Owner of the video on the current watch page, once the page shows it.
// The watch page is kept in the DOM across SPA navigations, so only trust it
// when it's rendering the video in the URL.
const watchOwner = () => {
  if (location.pathname !== "/watch") return null;
  const videoId = new URLSearchParams(location.search).get("v");
  if (document.querySelector("ytd-watch-flexy")?.getAttribute("video-id") !== videoId) return null;
  const link = document.querySelector('ytd-watch-metadata ytd-channel-name a[href^="/@"]');
  if (!link) return null;
  return { handle: handleFromPath(link.getAttribute("href")), name: link.textContent.trim() };
};

const currentChannel = () => {
  const handle = handleFromPath(location.pathname);
  if (handle) return { handle, name: document.title.replace(/ - YouTube$/, "").trim() || undefined };
  return watchOwner();
};

const renderChannelStyle = () => {
  let style = document.getElementById("pandasafe-channels");
  if (!style) {
    style = document.createElement("style");
    style.id = "pandasafe-channels";
    (document.head ?? document.documentElement).append(style);
  }
  const links = blockedChannels.flatMap(({ handle }) =>
    handlePathForms(handle).flatMap((path) => [`a[href="${path}" i]`, `a[href^="${path}/" i]`]),
  );
  style.textContent = [
    links.length ? `:is(${CHANNEL_ITEMS}):has(${links.join(", ")})` : null,
    "[data-pandasafe-blocked-channel]",
  ]
    .filter(Boolean)
    .join(",\n")
    .concat(" { display: none !important; }");
};

const applyChannels = (channels) => {
  blockedChannels = channels;
  blockedHandles = new Set(channels.map((c) => handleKey(c.handle)));
  blockedNames = new Set(channels.filter((c) => c.name).map((c) => c.name.toLowerCase()));
  renderChannelStyle();
  markByName();
  checkPage();
};

const checkPage = () => {
  if (isBlockedChannelUrl(location.href) || isBlockedHandle(watchOwner()?.handle)) leaveChannel();
};

// Hide recommendations whose only channel marker is the display name.
// Re-evaluated every pass because YouTube recycles item elements.
const markByName = () => {
  for (const item of document.querySelectorAll(NAME_ONLY_ITEMS)) {
    const blocked =
      blockedNames.size > 0 &&
      !item.querySelector('a[href^="/@"]') &&
      blockedNames.has(item.querySelector(ITEM_CHANNEL_NAME)?.textContent.trim().toLowerCase());
    item.toggleAttribute("data-pandasafe-blocked-channel", blocked);
  }
};

// Fill in display names for blocked channels added without one.
const learnNames = () => {
  const missing = new Set(blockedChannels.filter((c) => !c.name).map((c) => handleKey(c.handle)));
  if (!missing.size) return;
  const learned = new Map();
  const learn = (href, name) => {
    const handle = handleFromPath(href);
    if (handle && name && missing.has(handleKey(handle))) learned.set(handleKey(handle), name);
  };
  for (const link of document.querySelectorAll('ytd-channel-name a[href^="/@"]')) {
    learn(link.getAttribute("href"), link.textContent.trim());
  }
  for (const item of document.querySelectorAll("yt-lockup-view-model")) {
    const avatar = item.querySelector('yt-decorated-avatar-view-model a[href^="/@"], a[href^="/@"]');
    if (avatar) learn(avatar.getAttribute("href"), item.querySelector(ITEM_CHANNEL_NAME)?.textContent.trim());
  }
  if (!learned.size) return;
  const withNames = (list) => list.map((c) => (c.name ? c : { ...c, name: learned.get(handleKey(c.handle)) }));
  getSettings().then(({ blockedChannels: own, apiChannels }) =>
    chrome.storage.local.set({ blockedChannels: withNames(own), apiChannels: withNames(apiChannels) }),
  );
};

getSettings().then((settings) => applyChannels(allBlockedChannels(settings)));
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && (changes.blockedChannels || changes.apiChannels)) {
    applyChannels(allBlockedChannels(await getSettings()));
  }
});

// The popup asks which channel the tab is showing, for "Block this channel".
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "pandasafe:current-channel") sendResponse(currentChannel());
});

document.addEventListener(
  "click",
  (event) => {
    const link = event.target.closest?.("a[href]");
    if (link && isBlockedChannelUrl(link.href)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);

if (window.navigation) {
  navigation.addEventListener("navigate", (event) => {
    if (!isBlockedChannelUrl(event.destination.url)) return;
    if (event.cancelable) event.preventDefault();
    leaveChannel();
  });
}
window.addEventListener("yt-navigate-finish", checkPage);

let channelsScheduled = false;
new MutationObserver(() => {
  if (channelsScheduled || !blockedChannels.length) return;
  channelsScheduled = true;
  requestAnimationFrame(() => {
    channelsScheduled = false;
    checkPage();
    markByName();
    learnNames();
  });
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
