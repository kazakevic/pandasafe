# Blacklist API

PandaSafe can pull websites and YouTube channels to block from any server you run. Anything the API returns is blocked on top of the lists the user keeps in the popup, and it can't be unblocked from the popup.

## Endpoints

Set a **base URL** in the popup (for example `https://example.com/pandasafe`). PandaSafe then fetches:

| Request                      | Returns                       |
| ---------------------------- | ----------------------------- |
| `GET {base}/blocked-websites` | Websites to block             |
| `GET {base}/blocked-channels` | YouTube channels to block     |

You can serve just one of the two: a `404` means "this list isn't offered" and counts as empty. If both answer `404`, the popup reports that no blacklists were found.

The base URL must be `https://`. Plain `http://` works only for `localhost` / `127.0.0.1`, for testing.

## Requests

```http
GET /pandasafe/blocked-websites HTTP/1.1
Host: example.com
Accept: application/json
Authorization: Bearer <API key>
```

- `Authorization` is sent only if the user saved an API key. The key is optional: a public list can skip auth.
- Answer `401` or `403` to reject a missing or wrong key. The popup shows "The API key was rejected." (or "The API needs a key.").
- No cookies are sent. The request comes from the extension's service worker, so you don't need CORS headers.
- PandaSafe fetches on browser start, every 15 minutes, and when the user saves settings or clicks **Refresh**.
- If a fetch fails (network error, any non-2xx other than 404, or a body that isn't JSON), PandaSafe keeps blocking the lists from the last good fetch. An empty list is a successful answer and does unblock everything the API had blocked.

## Responses

Respond with `200` and `Content-Type: application/json`.

### `GET {base}/blocked-websites`

```json
{
  "websites": [
    "example.com",
    "https://www.reddit.com/r/all",
    "*.casino.example",
    { "domain": "tiktok.com" }
  ]
}
```

Each entry is a domain or any link. PandaSafe reduces it to a bare domain (`https://www.reddit.com/r/all` → `reddit.com`) and blocks that domain **and all its subdomains**. Paths are ignored: you can't block only part of a site. Entries it can't read are skipped.

### `GET {base}/blocked-channels`

```json
{
  "channels": [
    "@SomeChannel",
    "https://www.youtube.com/@AnotherChannel/videos",
    { "handle": "@ThirdChannel", "name": "Third Channel", "avatar": "https://yt3.ggpht.com/..." }
  ]
}
```

Each entry is a channel `@handle` (with or without the `@`) or a `youtube.com/@handle` link, either as a string or under `handle` in an object. `/channel/UC…` IDs aren't supported.

`name` and `avatar` are optional and only change what the popup shows, with one exception: on a video's page, YouTube's "up next" list shows only the channel's display name, so PandaSafe hides those by name. Without `name` it learns the name the first time the channel appears elsewhere on YouTube. Sending the exact display name hides them from the start.

### Accepted variations

To make existing endpoints easy to reuse, PandaSafe also accepts:

- a bare JSON array instead of the object: `["example.com", "reddit.com"]`
- the list under another key: `websites`, `blockedWebsites`, `sites`, `domains`, `data`, `items` (websites) or `channels`, `blockedChannels`, `data`, `items` (channels)
- objects with the value under `domain`, `url`, `website`, `host` or `site` (websites) or `handle`, `url`, `channel` (channels)

Extra fields are ignored.

## Minimal server

A [Bun](https://bun.sh) server that serves both lists from memory, behind a key:

```js
const KEY = process.env.PANDASAFE_KEY;

const lists = {
  "/pandasafe/blocked-websites": { websites: ["example.com", "reddit.com"] },
  "/pandasafe/blocked-channels": { channels: [{ handle: "@SomeChannel", name: "Some Channel" }] },
};

Bun.serve({
  port: 3000,
  fetch(request) {
    if (KEY && request.headers.get("authorization") !== `Bearer ${KEY}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    const list = lists[new URL(request.url).pathname];
    return list ? Response.json(list) : new Response("Not found", { status: 404 });
  },
});
```

With it running locally, set the base URL to `http://localhost:3000/pandasafe` and the key to whatever `PANDASAFE_KEY` is. A static host works too: put `blocked-websites` and `blocked-channels` files with JSON in them in one folder and use that folder's URL (no key).
