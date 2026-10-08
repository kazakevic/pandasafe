// Shown instead of a blocked site. The background worker puts the original
// URL in the hash.

const blockedUrl = (() => {
  try {
    const url = new URL(location.hash.slice(1));
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
})();

const host = blockedUrl?.hostname.replace(/^www\./, "");
document.getElementById("site").textContent = host ?? "";
if (host) document.title = `${host} blocked · PandaSafe`;

const back = document.getElementById("back");
if (history.length <= 1) back.textContent = "Close tab";
back.addEventListener("click", async () => {
  if (history.length > 1) {
    history.back();
  } else {
    const tab = await chrome.tabs.getCurrent();
    chrome.tabs.remove(tab.id);
  }
});

// Unblocked while this page is open: carry on to the page that was asked for.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.blockedSites || !blockedUrl) return;
  if (!siteMatch(blockedUrl.hostname, changes.blockedSites.newValue ?? [])) location.replace(blockedUrl.href);
});
