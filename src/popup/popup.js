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
let currentChannel = null;

const setStatus = (text, isError = false) => {
  status.textContent = text;
  status.classList.toggle("error", isError);
};

const isBlocked = (handle) => channels.some((c) => handleKey(c.handle) === handleKey(handle));

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

const render = () => {
  list.replaceChildren(
    ...channels.map((channel) => {
      const item = itemTemplate.content.firstElementChild.cloneNode(true);
      renderAvatar(item.querySelector(".avatar"), channel);
      item.querySelector(".channel-name").textContent = channel.name ?? channel.handle;
      item.querySelector(".channel-handle").textContent = channel.name ? channel.handle : "";
      const remove = item.querySelector(".remove");
      remove.setAttribute("aria-label", `Unblock ${channel.name ?? channel.handle}`);
      remove.addEventListener("click", () => removeChannel(channel.handle));
      return item;
    }),
  );
  empty.hidden = channels.length > 0;
  count.textContent = channels.length;

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
    setStatus(`${handle} is already blocked.`);
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
  setStatus(`Unblocked ${handle}.`);
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
});

// Ask the YouTube tab which channel it's showing, for the one-click button.
const loadCurrentChannel = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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

getSettings().then((settings) => {
  shortsToggle.checked = settings.blockShorts;
  channels = settings.blockedChannels;
  render();
  loadCurrentChannel();
});
