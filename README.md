# PandaSafe

Chrome extension (Manifest V3) that blocks YouTube Shorts on www.youtube.com.

## Load it

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. After editing files, hit the reload icon on the extension card and refresh YouTube.

## How it blocks Shorts

- `src/rules.json`: a declarativeNetRequest rule redirects any full page load of `/shorts/*` to the YouTube home page.
- `src/youtube-shorts.js`: YouTube changes pages without reloading, so this script blocks clicks on Shorts links and sends any in-app navigation to `/shorts/*` back to home.
- `src/youtube-shorts.css`: hides Shorts everywhere they show up: the sidebar entry, shelves on home and search, Shorts mixed into feeds, and the channel Shorts tab.
