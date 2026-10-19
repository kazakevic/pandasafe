// Settings shared by the popup, the background worker and the content
// scripts. Loaded as a classic script everywhere, so these are globals.

const HOME_URL = "https://www.youtube.com/";

// blockedChannels: [{ handle: "@Name", name?: "Display name" }]
// blockedSites: ["example.com"], each one also covering its subdomains.
// apiSites / apiChannels: what the blacklist API last returned, blocked on top
// of blockedSites / blockedChannels. apiBase: the API's base URL ("" = not
// set up; an older install with only a key means DEFAULT_API_BASE).
// apiSync: { at?, error? } of the last fetch. The API key itself isn't kept
// here (content scripts can read this storage): see secret-store.js.
const DEFAULT_SETTINGS = {
  blockShorts: true,
  blockedChannels: [],
  blockedSites: [],
  apiBase: "",
  apiSites: [],
  apiChannels: [],
  apiSync: {},
};

// The API serves {base}/blocked-websites and {base}/blocked-channels. See
// docs/api.md for the response format.
const DEFAULT_API_BASE = "https://livia.thedatasender.space/api/ext";
const API_DOCS_URL = "https://github.com/kazakevic/pandasafe/blob/main/docs/api.md";

// "https://host/path/" -> "https://host/path". Null unless it's https (or
// plain http to this machine, for testing a local server).
const parseApiBase = (input) => {
  let url;
  try {
    url = new URL(String(input ?? "").trim());
  } catch {
    return null;
  }
  const local = /^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
};

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

// "https://www.Example.com/page", "www.example.com", "*.example.com" or
// "example.com" -> "example.com". Null if the input has no usable host name.
// "www." is dropped: blocking a site covers all its subdomains anyway.
const parseSite = (input) => {
  let text = String(input ?? "").trim().replace(/^\*\./, "");
  if (!text) return null;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(text)) text = `http://${text}`;
  let host;
  try {
    host = new URL(text).hostname; // lowercased, internationalized names punycoded
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "").replace(/^www\./, "");
  return /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+(?:[a-z]{2,63}|xn--[a-z\d-]+)$/.test(host) ? host : null;
};

// The entry in `sites` that blocks `host` (the site itself or a parent
// domain of it), or undefined.
const siteMatch = (host, sites) => sites.find((site) => host === site || host.endsWith(`.${site}`));

// Everything that's blocked: the user's own list plus the API's.
const allBlockedSites = ({ blockedSites, apiSites }) => [...new Set([...blockedSites, ...apiSites])];

// The user's own entry wins over the API's for the same handle.
const allBlockedChannels = ({ blockedChannels, apiChannels }) => {
  const own = new Set(blockedChannels.map((c) => handleKey(c.handle)));
  return [...blockedChannels, ...apiChannels.filter((c) => !own.has(handleKey(c.handle)))];
};
