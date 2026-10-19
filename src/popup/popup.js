const $ = (id) => document.getElementById(id);

const shortsToggle = $("block-shorts");
const form = $("add-form");
const input = $("add-input");
const addButton = $("add-button");
const status = $("status");
const list = $("channel-list");
const empty = $("empty");
const count = $("channel-count");
const blockCurrent = $("block-current");
const itemTemplate = $("channel-item");

let channels = [];
let apiChannels = [];
let currentChannel = null;

const setStatus = (text, isError = false) => {
  status.textContent = text;
  status.classList.toggle("error", isError);
};

const sameHandle = (handle) => (c) => handleKey(c.handle) === handleKey(handle);
const allChannels = () => allBlockedChannels({ blockedChannels: channels, apiChannels });
const isBlocked = (handle) => allChannels().some(sameHandle(handle));

const renderAvatar = (el, channel) => {
  el.replaceChildren();
  if (channel.avatar) {
    const img = document.createElement("img");
    img.src = channel.avatar;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => (el.textContent = (channel.name ?? channel.handle.slice(1))[0]));
    el.append(img);
  } else {
    el.textContent = (channel.name ?? channel.handle.slice(1))[0];
  }
};

// Like the sites: the user's own channels first, API channels tagged and
// without a remove button unless they're on the user's list too.
const render = () => {
  const all = allChannels();
  list.replaceChildren(
    ...all.map((channel) => {
      const item = itemTemplate.content.firstElementChild.cloneNode(true);
      renderAvatar(item.querySelector(".avatar"), channel);
      item.querySelector(".channel-name").textContent = channel.name ?? channel.handle;
      item.querySelector(".channel-handle").textContent = channel.name ? channel.handle : "";
      item.querySelector(".tag").hidden = !apiChannels.some(sameHandle(channel.handle));
      const remove = item.querySelector(".remove");
      if (channels.some(sameHandle(channel.handle))) {
        remove.setAttribute("aria-label", `Unblock ${channel.name ?? channel.handle}`);
        remove.addEventListener("click", () => removeChannel(channel.handle));
      } else {
        remove.remove();
      }
      return item;
    }),
  );
  empty.hidden = all.length > 0;
  count.textContent = all.length;

  const showSuggestion = currentChannel?.handle && !isBlocked(currentChannel.handle);
  blockCurrent.hidden = !showSuggestion;
  if (showSuggestion) {
    $("block-current-name").textContent = currentChannel.name
      ? `${currentChannel.name} · ${currentChannel.handle}`
      : currentChannel.handle;
  }
};

const saveChannels = (next) => chrome.storage.local.set({ blockedChannels: next });

// Look the handle up on YouTube to confirm it exists and to get its display
// name (used to hide recommendations that only show the name) and avatar.
// Returns null for unknown handles, {} if YouTube couldn't be reached.
const lookupChannel = async (handle) => {
  let response;
  try {
    response = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle.slice(1))}`, {
      credentials: "include",
    });
  } catch {
    return {};
  }
  if (response.status === 404) return null;
  if (!response.ok || new URL(response.url).hostname !== "www.youtube.com") return {};
  const doc = new DOMParser().parseFromString(await response.text(), "text/html");
  const meta = (property) => doc.querySelector(`meta[property="${property}"]`)?.content || undefined;
  return { name: meta("og:title"), avatar: meta("og:image") };
};

const addChannel = async (handle, knownName) => {
  if (isBlocked(handle)) {
    const viaApi = !channels.some(sameHandle(handle));
    setStatus(`${handle} is already blocked${viaApi ? " by the API" : ""}.`);
    return false;
  }
  addButton.disabled = true;
  setStatus(`Looking up ${handle}…`);
  const info = await lookupChannel(handle);
  addButton.disabled = false;
  if (info === null) {
    setStatus(`No channel found for ${handle}.`, true);
    return false;
  }
  const channel = { handle, name: info.name ?? knownName, avatar: info.avatar };
  const { blockedChannels } = await getSettings();
  await saveChannels([channel, ...blockedChannels.filter((c) => handleKey(c.handle) !== handleKey(handle))]);
  setStatus(`Blocked ${channel.name ?? handle}.`);
  return true;
};

const removeChannel = async (handle) => {
  const { blockedChannels } = await getSettings();
  await saveChannels(blockedChannels.filter((c) => handleKey(c.handle) !== handleKey(handle)));
  const viaApi = apiChannels.some(sameHandle(handle));
  setStatus(viaApi ? `Removed ${handle} from your list. The API still blocks it.` : `Unblocked ${handle}.`);
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const handle = parseHandle(input.value);
  if (!handle) {
    setStatus("Enter a handle like @channel or a youtube.com/@channel link.", true);
    input.focus();
    return;
  }
  if (await addChannel(handle)) input.value = "";
  input.focus();
});

input.addEventListener("input", () => status.classList.contains("error") && setStatus(""));

blockCurrent.addEventListener("click", () => addChannel(currentChannel.handle, currentChannel.name));

shortsToggle.addEventListener("change", () => {
  chrome.storage.local.set({ blockShorts: shortsToggle.checked });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.blockedChannels) {
    channels = changes.blockedChannels.newValue ?? [];
    render();
  }
  if (changes.blockShorts) shortsToggle.checked = changes.blockShorts.newValue ?? true;
  if (changes.blockedSites) {
    sites = changes.blockedSites.newValue ?? [];
    renderSites();
  }
  if (changes.apiSites) {
    apiSites = changes.apiSites.newValue ?? [];
    renderSites();
    renderApi();
  }
  if (changes.apiChannels) {
    apiChannels = changes.apiChannels.newValue ?? [];
    render();
    renderApi();
  }
  if (changes.apiSync) {
    apiSync = changes.apiSync.newValue ?? {};
    renderApi();
  }
});

// Ask the YouTube tab which channel it's showing, for the one-click button.
const loadCurrentChannel = async (tab) => {
  if (!tab?.url?.startsWith("https://www.youtube.com/")) return;
  try {
    currentChannel = await chrome.tabs.sendMessage(tab.id, { type: "pandasafe:current-channel" });
  } catch {
    // Tab loaded before the extension was (re)installed: no content script.
    const handle = handleFromPath(new URL(tab.url).pathname);
    currentChannel = handle ? { handle } : null;
  }
  render();
};

// --- Blocked websites ---

const siteForm = $("site-form");
const siteInput = $("site-input");
const siteStatus = $("site-status");
const siteList = $("site-list");
const siteEmpty = $("site-empty");
const siteCount = $("site-count");
const blockSite = $("block-site");
const siteTemplate = $("site-item");

let sites = [];
let apiSites = [];
let currentSite = null;

const allSites = () => allBlockedSites({ blockedSites: sites, apiSites });

const setSiteStatus = (text, isError = false) => {
  siteStatus.textContent = text;
  siteStatus.classList.toggle("error", isError);
};

// Chrome's own favicon cache, so the blocked list isn't sent anywhere.
const faviconUrl = (site) => {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", `https://${site}/`);
  url.searchParams.set("size", "32");
  return url.href;
};

// The user's own sites first. API sites are tagged and can't be removed
// here; a site on both lists keeps its remove button (it stays blocked).
const renderSites = () => {
  const all = allSites();
  siteList.replaceChildren(
    ...all.map((site) => {
      const item = siteTemplate.content.firstElementChild.cloneNode(true);
      item.querySelector(".favicon img").src = faviconUrl(site);
      item.querySelector(".channel-name").textContent = site;
      item.querySelector(".tag").hidden = !apiSites.includes(site);
      const remove = item.querySelector(".remove");
      if (sites.includes(site)) {
        remove.setAttribute("aria-label", `Unblock ${site}`);
        remove.addEventListener("click", () => removeSite(site));
      } else {
        remove.remove();
      }
      return item;
    }),
  );
  siteEmpty.hidden = all.length > 0;
  siteCount.textContent = all.length;

  const showSuggestion = currentSite && !siteMatch(currentSite, all);
  blockSite.hidden = !showSuggestion;
  if (showSuggestion) $("block-site-name").textContent = currentSite;
};

const listText = (items) => items.join(", ");

// Adds each site unless an entry already covers it. A new parent domain
// replaces the subdomains it now covers. Returns false if nothing was added.
const addSites = async (entries) => {
  const { blockedSites, apiSites: fromApi } = await getSettings();
  let next = blockedSites;
  const added = [];
  const covered = [];
  for (const site of entries) {
    const by = siteMatch(site, next) ?? siteMatch(site, fromApi);
    if (by) {
      const via = [by === site ? "" : `via ${by}`, next.includes(by) ? "" : "from the API"].filter(Boolean);
      covered.push(via.length ? `${site} (${via.join(", ")})` : site);
      continue;
    }
    next = [site, ...next.filter((entry) => !siteMatch(entry, [site]))];
    added.push(site);
  }
  if (added.length) await chrome.storage.local.set({ blockedSites: next });

  const messages = [];
  if (added.length) messages.push(`Blocked ${listText(added)}.`);
  if (covered.length) messages.push(`Already blocked: ${listText(covered)}.`);
  setSiteStatus(messages.join(" "));
  return added.length > 0;
};

const removeSite = async (site) => {
  const { blockedSites, apiSites: fromApi } = await getSettings();
  await chrome.storage.local.set({ blockedSites: blockedSites.filter((entry) => entry !== site) });
  const by = siteMatch(site, fromApi);
  setSiteStatus(by ? `Removed ${site} from your list. The API still blocks it.` : `Unblocked ${site}.`);
};

// Several sites can be pasted at once, separated by spaces, commas or lines.
const parseSiteInput = (text) => {
  const entries = text.split(/[\s,;]+/).filter(Boolean);
  const valid = [];
  const invalid = [];
  for (const entry of entries) {
    const site = parseSite(entry);
    if (site) valid.includes(site) || valid.push(site);
    else invalid.push(entry);
  }
  return { valid, invalid };
};

siteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const { valid, invalid } = parseSiteInput(siteInput.value);
  if (valid.length) await addSites(valid);
  if (invalid.length) {
    siteInput.value = invalid.join(" ");
    const prefix = valid.length ? `${siteStatus.textContent} ` : "";
    setSiteStatus(`${prefix}Couldn't read ${listText(invalid)}. Enter a domain like example.com.`, true);
  } else if (valid.length) {
    siteInput.value = "";
  } else {
    setSiteStatus("Enter a domain like example.com or paste a link.", true);
  }
  siteInput.focus();
});

// Preview what will be blocked, so "https://www.x.com/page" visibly becomes x.com.
siteInput.addEventListener("input", () => {
  const { valid, invalid } = parseSiteInput(siteInput.value);
  setSiteStatus(valid.length && !invalid.length ? `Will block ${listText(valid)} and subdomains.` : "");
});

blockSite.addEventListener("click", () => addSites([currentSite]));

const loadCurrentSite = (tab) => {
  if (!/^https?:/.test(tab?.url ?? "")) return;
  currentSite = parseSite(tab.url);
  renderSites();
};

// --- Blacklist API ---

const apiForm = $("api-form");
const apiBaseInput = $("api-base");
const apiKeyInput = $("api-key");
const apiReveal = $("api-reveal");
const apiSave = $("api-save");
const apiStatus = $("api-status");
const apiRefresh = $("api-refresh");
const apiRemove = $("api-remove");

let apiSync = {};
let apiBase = "";
let hasApiKey = false;

$("api-docs").href = API_DOCS_URL;
apiBaseInput.placeholder = DEFAULT_API_BASE;

// Installs from before the base URL setting only stored a key.
const effectiveApiBase = () => apiBase || (hasApiKey ? DEFAULT_API_BASE : "");

const setApiStatus = (text, isError = false) => {
  apiStatus.textContent = text;
  apiStatus.classList.toggle("error", isError);
};

const timeAgo = (at) => {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(at).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The saved key is never read back into the page: the field only takes a
// new one.
const renderApi = () => {
  const base = effectiveApiBase();
  if (document.activeElement !== apiBaseInput) apiBaseInput.value = base;
  apiKeyInput.placeholder = hasApiKey ? "Key saved · enter a new one to replace it" : "API key (optional)";
  apiRefresh.hidden = !base;
  apiRemove.hidden = !base;
  let text = "";
  if (base) {
    const counts = `${plural(apiSites.length, "site")} and ${plural(apiChannels.length, "channel")}`;
    if (apiSync.error) text = `${apiSync.error}${apiSync.at ? ` Still blocking the ${counts} from ${timeAgo(apiSync.at)}.` : ""}`;
    else if (apiSync.at) text = `Blocking ${counts} from the API, updated ${timeAgo(apiSync.at)}.`;
    else text = "Fetching…";
  }
  setApiStatus(text, Boolean(base && apiSync.error));
};

const syncApi = async () => {
  apiRefresh.disabled = true;
  setApiStatus("Fetching…");
  try {
    await chrome.runtime.sendMessage({ type: "pandasafe:sync-api" });
  } finally {
    apiRefresh.disabled = false;
    renderApi();
  }
};

// A saved key belongs to the server it was entered for: moving to another
// host drops it rather than sending it there.
apiForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const base = apiBaseInput.value.trim() ? parseApiBase(apiBaseInput.value) : DEFAULT_API_BASE;
  if (!base) {
    setApiStatus("Enter an https:// URL, like https://example.com/api.", true);
    apiBaseInput.focus();
    return;
  }
  const key = apiKeyInput.value.trim();
  const previous = effectiveApiBase();
  const movedHost = previous && new URL(previous).origin !== new URL(base).origin;
  apiSave.disabled = true;
  if (key || (movedHost && hasApiKey)) await setApiKey(key);
  hasApiKey = Boolean(key) || (hasApiKey && !movedHost);
  apiBase = base;
  await chrome.storage.local.set({ apiBase: base });
  apiKeyInput.value = "";
  apiSave.disabled = false;
  await syncApi();
});

apiBaseInput.addEventListener("input", () => apiStatus.classList.contains("error") && setApiStatus(""));

apiRemove.addEventListener("click", async () => {
  await setApiKey("");
  hasApiKey = false;
  apiBase = "";
  await chrome.storage.local.set({ apiBase: "" });
  await syncApi(); // clears the API's sites and channels
});

apiRefresh.addEventListener("click", syncApi);

apiReveal.addEventListener("click", () => {
  const show = apiKeyInput.type === "password";
  apiKeyInput.type = show ? "text" : "password";
  apiReveal.setAttribute("aria-pressed", String(show));
  apiReveal.setAttribute("aria-label", show ? "Hide key" : "Show key");
});

getSettings().then(async (settings) => {
  shortsToggle.checked = settings.blockShorts;
  channels = settings.blockedChannels;
  apiChannels = settings.apiChannels;
  sites = settings.blockedSites;
  apiSites = settings.apiSites;
  apiSync = settings.apiSync;
  apiBase = settings.apiBase;
  hasApiKey = Boolean(await getApiKey());
  render();
  renderSites();
  renderApi();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  loadCurrentSite(tab);
  loadCurrentChannel(tab);
});
