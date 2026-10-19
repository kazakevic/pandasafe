# PandaSafe

Chrome extension for calmer browsing: blocks the websites you choose, YouTube Shorts and YouTube channels.

## Features

- **Website blacklist**: type a domain or paste any link (`https://www.example.com/page`, `www.example.com` and `example.com` all mean the same), or hit **Block this site** on the current tab. The site and all its subdomains won't open; you get a PandaSafe page instead. Paste several at once, separated by spaces, commas or new lines.
- **Block Shorts**: hides Shorts everywhere and sends Shorts links back to the home page. Toggle it in the popup.
- **Channel blacklist**: add a channel by `@handle` or link, or hit **Block this channel** while on its page or video. Its videos disappear from feeds, search and recommendations, and its pages won't open.
- **Blacklist API**: pull more websites and channels to block from a server of your own, see [below](#blacklist-api).

## Blacklist API

Websites and channels can also come from a server, so one list can be shared across browsers or managed by someone else (a parent, a team).

1. Open the popup and find **Blacklist API**.
2. Enter the **base URL**. PandaSafe fetches `{base}/blocked-websites` and `{base}/blocked-channels` from it. Left empty, it uses the built-in default API.
3. Paste the **API key** if the server needs one (sent as `Authorization: Bearer <key>`). It's stored only in the extension and never shown again. Changing to a server on another host drops the saved key.
4. Click **Save**. The popup shows how many sites and channels the API blocks and when it last updated.

API entries show with an **API** tag and can't be removed in the popup. The lists refresh every 15 minutes (or hit **Refresh**). If the server can't be reached, the last lists stay blocked. **Disconnect** removes the key and URL and unblocks everything the API had blocked.

Want your own list? A server only needs to answer two JSON GET requests:

```json
GET {base}/blocked-websites  →  { "websites": ["example.com", "https://www.reddit.com/r/all"] }
GET {base}/blocked-channels  →  { "channels": ["@SomeChannel", { "handle": "@Other", "name": "Other Channel" }] }
```

Even static JSON files work. See [docs/api.md](docs/api.md) for the full format, auth, errors and a minimal server.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Click the PandaSafe icon in the toolbar to change settings.

After editing the code, reload the extension card and refresh YouTube.

YouTube features work on `www.youtube.com`.
