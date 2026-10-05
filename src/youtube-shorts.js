// Keeps the user out of YouTube Shorts. Full page loads of /shorts/ are
// redirected by src/rules.json; this script covers YouTube's in-app (SPA)
// navigation, which never issues a main_frame request.

const HOME_URL = "https://www.youtube.com/";

const isShortsUrl = (url) => {
  try {
    const { hostname, pathname } = new URL(url, location.href);
    return hostname === "www.youtube.com" && /^\/shorts(\/|$)/.test(pathname);
  } catch {
    return false;
  }
};

const leaveShorts = () => location.replace(HOME_URL);

if (isShortsUrl(location.href)) leaveShorts();

// Swallow clicks on any Shorts link before YouTube's router sees them.
document.addEventListener(
  "click",
  (event) => {
    const link = event.target.closest?.("a[href]");
    if (link && isShortsUrl(link.href)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);

// Catch every other route into Shorts (keyboard, history, scripted pushState).
if (window.navigation) {
  navigation.addEventListener("navigate", (event) => {
    if (!isShortsUrl(event.destination.url)) return;
    if (event.cancelable) event.preventDefault();
    leaveShorts();
  });
}
window.addEventListener("yt-navigate-finish", () => {
  if (isShortsUrl(location.href)) leaveShorts();
});

// The channel "Shorts" tab and the "Shorts" filter chip carry no /shorts/
// link or stable attribute, so match them by label.
const hideLabelled = () => {
  for (const el of document.querySelectorAll(
    "yt-tab-shape, yt-chip-cloud-chip-renderer, chip-view-model",
  )) {
    if (el.textContent.trim() === "Shorts") el.style.setProperty("display", "none", "important");
  }
};
let scheduled = false;
new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    hideLabelled();
  });
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
