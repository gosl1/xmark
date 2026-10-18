# Xmark

Xmark is a WXT browser extension for organizing X (formerly Twitter) posts.
It adds a folder action beside X's native bookmark button, saves sanitized
snapshots locally, and lets you browse saved posts on the X Bookmarks page.

## Features

- Create folders from a post or the X Bookmarks page, and toggle posts into or
  out of folders.
- Browse folder tabs on X's History > Bookmarks view (`/i/history`); the
  **All** tab leaves X's native bookmarks list unchanged. The older
  `/i/bookmarks` route is also supported where X still uses it.
- Manage folders and saved posts in the extension popup, including rename,
  delete, export, and import.
- Store data in the browser with migration from the original Xmark folder
  format. Export a backup before uninstalling or moving browser profiles.

## Run locally

1. Open a terminal in the `xmark` directory and run `npm install` (first run
   only, or after dependencies change).
2. Run `npm run dev` for Chrome/Chromium or `npm run dev:firefox` for Firefox.
3. Load the generated extension into your browser:
   - **Chrome:** open `chrome://extensions`, enable **Developer mode**, click
     **Load unpacked**, and select `.output/chrome-mv3`.
   - **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load
     Temporary Add-on...**, and select `.output/firefox-mv2/manifest.json`.
4. Open X. Use the folder button beside a post's bookmark action to save a post
   or create a folder. On X's History > Bookmarks view, choose a folder tab to
   browse its saved posts. Click the Xmark toolbar button to manage folders and
   backups.

Run `npm run compile` to type-check. For production builds, use `npm run build`
(Chrome/Chromium) or `npm run build:firefox` (Firefox). Create a distributable
archive with `npm run zip` or `npm run zip:firefox`.

See [CODE_GUIDE.md](./CODE_GUIDE.md) for the architecture, function-by-function
overview, and notes on how folder snapshots are displayed on the Bookmarks page.
