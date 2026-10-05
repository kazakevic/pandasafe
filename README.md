# PandaSafe

Chrome extension (Manifest V3) for a calmer YouTube on www.youtube.com: blocks Shorts and any channels you put on your blacklist.

## Load it

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. After editing files, hit the reload icon on the extension card and refresh YouTube.

## Using it

Click the PandaSafe icon in the toolbar:

- **Block Shorts**: on by default; switch it off to let Shorts back in.
- **Blocked channels**: type a handle (`@channel`) or paste a channel link and hit **Block**. When you're on a channel page or watching a video, a **Block this channel** button appears for one-click blocking. Remove a channel with ×.

A blocked channel's videos are hidden from home, search, subscriptions and recommendations, and opening its channel page or one of its videos sends you back to the YouTube home page.

## How it blocks Shorts

- `src/rules.json`: a declarativeNetRequest rule redirects any full page load of `/shorts/*` to the YouTube home page.
- `src/youtube-shorts.js`: YouTube changes pages without reloading, so this script blocks clicks on Shorts links and sends any in-app navigation to `/shorts/*` back to home.
- `src/youtube-shorts.css`: hides Shorts everywhere they show up: the sidebar entry, shelves on home and search, Shorts mixed into feeds, and the channel Shorts tab.

## How it blocks channels

- `src/background.js`: adds a declarativeNetRequest rule per blocked channel that redirects full page loads of `youtube.com/@handle` to home.
- `src/youtube-channels.js`: hides videos and channel cards linking to a blocked channel, hides recommendations showing a blocked channel's name, and redirects in-app navigation to a blocked channel page or video.
