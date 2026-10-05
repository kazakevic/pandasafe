// Settings shared by the popup, the background worker and the content
// scripts. Loaded as a classic script everywhere, so these are globals.

const HOME_URL = "https://www.youtube.com/";

// blockedChannels: [{ handle: "@Name", name?: "Display name" }]
const DEFAULT_SETTINGS = { blockShorts: true, blockedChannels: [] };

const getSettings = () => chrome.storage.local.get(DEFAULT_SETTINGS);

// "@Name", "Name" or any youtube.com/@Name/... URL -> "@Name". Null if the
// input doesn't look like a handle.
const parseHandle = (input) => {
  const text = String(input ?? "").trim();
  const match = text.match(/(?:^|\/)@([^/?#\s]+)/) ?? text.match(/^([^/?#\s@]+)$/);
  if (!match) return null;
  let handle;
  try {
    handle = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return /^[\p{L}\p{N}_.\-·]{3,30}$/u.test(handle) ? `@${handle}` : null;
};

const handleKey = (handle) => handle.toLowerCase();

// "/@Name/videos" -> "@Name", for hrefs and pathnames on youtube.com.
const handleFromPath = (path) => {
  const match = /^\/(@[^/?#]+)/.exec(path ?? "");
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

// The forms a handle takes in a URL path: as typed, and percent-encoded
// (non-Latin handles appear encoded in hrefs and request URLs).
const handlePathForms = (handle) => {
  const name = handle.slice(1);
  return [...new Set([`/@${name}`, `/@${encodeURIComponent(name)}`])];
};
