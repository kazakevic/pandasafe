// Keeps the user out of YouTube Shorts. Full page loads of /shorts/ are
// redirected by src/rules.json; this script covers YouTube's in-app (SPA)
// navigation, which never issues a main_frame request.
//
// Blocking is on until settings load, so nothing slips through at startup.
// Turning it off sets data-pandasafe-shorts="off" on <html>, which the CSS
// rules in youtube-shorts.css key off.

let blockShorts = true;

const isShortsUrl = (url) => {
  if (!blockShorts) return false;
  try {
    const { hostname, pathname } = new URL(url, location.href);
    return hostname === "www.youtube.com" && /^\/shorts(\/|$)/.test(pathname);
  } catch {
    return false;
  }
};

const leaveShorts = () => location.replace(HOME_URL);

const applyShortsSetting = (value) => {
  blockShorts = value;
  if (value) delete document.documentElement.dataset.pandasafeShorts;
  else document.documentElement.dataset.pandasafeShorts = "off";
  if (isShortsUrl(location.href)) leaveShorts();
};

if (isShortsUrl(location.href)) leaveShorts();
getSettings().then((settings) => applyShortsSetting(settings.blockShorts));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.blockShorts) applyShortsSetting(changes.blockShorts.newValue ?? true);
});

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
// link or stable attribute, so match them by label. The CSS hides what's
// marked here, so turning the setting off brings them back.
const markLabelled = () => {
  for (const el of document.querySelectorAll(
    "yt-tab-shape, yt-chip-cloud-chip-renderer, chip-view-model",
  )) {
    el.toggleAttribute("data-pandasafe-shorts-label", el.textContent.trim() === "Shorts");
  }
};
let shortsScheduled = false;
new MutationObserver(() => {
  if (shortsScheduled) return;
  shortsScheduled = true;
  requestAnimationFrame(() => {
    shortsScheduled = false;
    markLabelled();
  });
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
