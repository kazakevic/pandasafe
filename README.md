# PandaSafe

Chrome extension for calmer browsing. It blocks:

- **Websites** you choose, including all their subdomains.
- **YouTube Shorts**, everywhere on YouTube (can be turned off).
- **YouTube channels** by `@handle`: their videos disappear from feeds, search and recommendations, and their pages won't open.

Lists can also come from a server: see [Blacklist API](#blacklist-api).

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Click the PandaSafe icon in the toolbar to open the settings.

After editing the code, reload the extension card and refresh YouTube.

## Usage

| To block              | In the popup                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| A website             | Type a domain or paste a link, or click **Block this site** on the current tab. Several at once work. |
| Shorts                | Turn on **Block Shorts**.                                                                            |
| A YouTube channel     | Type `@handle` or paste a channel link, or click **Block this channel** on its page or video.        |

A blocked website shows a PandaSafe page instead. `https://www.example.com/page`, `www.example.com` and `example.com` all block the same site.

YouTube features work on `www.youtube.com` only.

## Blacklist API

PandaSafe can pull websites and channels to block from a server, so one list can be shared across browsers or managed by someone else (a parent, a team).

### Connect

1. In the popup, find **Blacklist API**.
2. Enter the **base URL**, e.g. `https://example.com/pandasafe`.
3. Enter the **API key**, if your server needs one.
4. Click **Save**.

The lists refresh every 15 minutes, or when you click **Refresh**. API entries show an **API** tag and can't be removed in the popup. **Disconnect** removes the URL and key and unblocks everything the API added.

### Server requirements

Your server answers two `GET` requests with JSON:

| Endpoint                     | Returns                    |
| ---------------------------- | -------------------------- |
| `{base}/blocked-websites`    | Websites to block          |
| `{base}/blocked-channels`    | YouTube channels to block  |

- **HTTPS only.** `http://` is allowed for `localhost` while testing.
- **Auth is optional.** If a key is saved, every request carries `Authorization: Bearer <key>`. Answer `401` or `403` to reject it.
- **One list is enough.** Answer `404` for a list you don't offer.
- **No CORS needed.** No cookies are sent.
- **Failures are safe.** If the server is down or answers an error, the last lists stay blocked. Only a successful answer changes them, so an empty list unblocks everything the API added.

Static JSON files work too: put files named `blocked-websites` and `blocked-channels` in one folder and use its URL as the base.

### Response samples

**`GET {base}/blocked-websites`**

```json
{
  "websites": ["example.com", "https://www.reddit.com/r/all", "tiktok.com"]
}
```

Each entry is a domain or any link. It blocks that domain and all its subdomains (paths are ignored, so `reddit.com/r/all` blocks all of `reddit.com`).

**`GET {base}/blocked-channels`**

```json
{
  "channels": [
    "@SomeChannel",
    "https://www.youtube.com/@AnotherChannel",
    { "handle": "@ThirdChannel", "name": "Third Channel" }
  ]
}
```

Each entry is a `@handle`, a `youtube.com/@handle` link, or an object with a `handle` and optional `name` and `avatar` (an image URL). Send `name` when you can: it's the channel's exact display name, used to hide the channel from the "up next" list on video pages right away. `/channel/UC…` IDs aren't supported.

For the other response shapes PandaSafe accepts, see [docs/api.md](docs/api.md).
