# Xmark – context for GitHub Copilot

Xmark is a browser extension (Chrome MV3 + Firefox) built with **WXT** and **TypeScript**, no UI framework. It lets users file posts on X (x.com / twitter.com) into their own folders and browse those folders on X's Bookmarks page with posts that look like normal X posts.

## Commands

- `npm run dev` / `npm run dev:firefox` – dev server with HMR
- `npm run compile` – `tsc --noEmit` (run before every commit; must pass)
- `npm run build` / `npm run zip` – production build / store zip

## Project layout (`srcDir` is `src`, so `@/` means `src/`)

```
wxt.config.ts                       manifest: permissions storage + unlimitedStorage
src/utils/folders.ts                ALL storage access (the only file that touches browser.storage)
src/utils/dom.ts                    el() helper, icon() SVGs, describeError()
src/entrypoints/content/
  index.ts                          entry: injects the folder button, MutationObserver, SPA navigation, cleanup
  popover.ts                        single anchored popover (follows its anchor on scroll/resize)
  picker.ts                         "Save to folder" popover + createFolderForm()
  bookmarks-page.ts                 folder tab bar + snapshot list on /i/history (legacy /i/bookmarks)
  snapshot.ts                       capturePost(), sanitize(), renderSnapshot()
  theme.ts                          reads X's theme + accent color into CSS variables
  style.css                         all content-script styling (no inline styles)
src/entrypoints/popup/              toolbar popup: folder list, rename, delete, remove post, export/import
```

## Data model (browser.storage.local)

- `xmarkFolders`: `BookmarkFolder[]` = `{ id, name, postIds: string[] }` (oldest first)
- `xmarkPost:<postId>`: `SavedPost` = `{ id, url, title, html, savedAt }`
  - `html` is the sanitized `outerHTML` of the post's `<article>` captured when the user saved it.
  - Posts live under their own keys so saving one never rewrites the others.
- Legacy shape (`folder.bookmarks[]`) is migrated automatically in `readFolders()`.
- Every mutation goes through `exclusive()` (Web Locks, with a promise-queue fallback). Do not call `browser.storage` anywhere else; add a function to `folders.ts` instead.
- Use `onLibraryChanged()` to react to changes from other tabs or the popup.

## How it works

1. **Folder button:** the content script finds X's native bookmark button (`[data-testid="bookmark"]` / `removeBookmark`), and inserts a folder button after it in the post's `[role="group"]` action row. A `MutationObserver` (batched per animation frame) handles X's virtualized timeline.
2. **Saving:** clicking the button opens a popover. Choosing a folder snapshots the post (`capturePost`) and stores it. Clicking a checked folder removes the post.
3. **History > Bookmarks page:** on `/i/history` (or legacy `/i/bookmarks`) a tab bar (`All` + folders) is inserted before `[aria-label="Timeline: Bookmarks"]`. `All` leaves X's list alone. A folder tab hides X's timeline (`data-xmark-hidden`) and renders stored snapshots, newest first, in batches via `IntersectionObserver`. This works whether or not the post is natively bookmarked on X.
4. **Snapshots are dead markup.** Clicks inside them are handled by us (`onListClick`): the `…` (caret) button opens "Remove from folder", links go where they point, any other click opens the live post (Ctrl/Cmd/middle click → new tab).
5. Snapshots are refreshed (`refreshPost`) once per page load when the user sees a saved post again in a timeline (not on `/status/` pages).

## Conventions

- Plain DOM, built with `el()` and `icon()`. No `innerHTML` with dynamic data. Stored HTML is only inserted through `renderSnapshot()` (DOMParser + `sanitize()`).
- Style with classes in `style.css` using the `--xmark-*` CSS variables (they follow X's Default / Dim / Lights out themes and accent color). No inline colors.
- Every node the extension injects carries `data-xmark`. The observer ignores mutations inside `[data-xmark]` and `sanitize()` strips them from snapshots. Keep this invariant for any new injected element.
- Every storage call from UI code must be in `try/catch` or `.catch()` and surface `describeError(error)` to the user. After the extension is reloaded, open X tabs throw "Extension context invalidated".
- Prefer small pure functions; keep comments about *why* (X quirks), not *what*.

## Gotchas (read before changing things)

- **Do not use IndexedDB from the content script.** It would create the database in x.com's origin, not the extension's. Use `storage.local`, or message a background script.
- Content scripts run in an isolated world: DOM is shared, page JS variables are not. We cannot call X's React internals.
- X's React listens at the root, so `event.stopPropagation()` in our click handlers prevents it from opening the post.
- X recycles timeline cells: an anchored UI can lose its anchor. The popover closes itself when its anchor is removed or scrolls off screen.
- X is an SPA: `main()` runs once. Use `ctx.addEventListener(window, 'wxt:locationchange', ...)` and re-check `location.pathname`.
- Selectors that depend on X markup (can break when X ships changes): `[data-testid="bookmark"]`, `[data-testid="removeBookmark"]`, `[data-testid="tweetText"]`, `[data-testid="caret"]`, `[data-testid="SideNav_NewTweet_Button"]`, `article`, `[role="group"]`, `[aria-label="Timeline: Bookmarks"]`. Keep them in constants and verify in DevTools when something stops working.
- Snapshots reuse X's generated class names, so a very old snapshot can render slightly off after X changes its CSS. The refresh logic mitigates this.
- Posts saved from a `/status/` page keep that page's larger layout.
- Video/GIF players cannot be cloned; snapshots keep the poster image only.

## Manual test checklist

1. Home timeline: folder button appears next to the bookmark button, turns filled/blue for saved posts.
2. Open the popover, scroll the page: it follows the post; it closes when the post leaves the screen; Escape closes it.
3. Create a folder from the popover (post is saved into it), toggle a folder on/off.
4. `/i/history` > Bookmarks: tabs appear; a folder tab shows snapshots; `All` shows X's native list; works after SPA navigation to and from the page.
5. Click a snapshot (opens live post), its caret (remove from folder), a link in it (goes there), Ctrl+click (new tab).
6. Switch X theme (Default / Dim / Lights out) and accent color: UI follows.
7. Popup: expand folder, rename, delete (two clicks), remove post, export then import.
8. Reload the extension with an X tab open: no console errors, old UI removed.

## Ideas not built yet

- Sort/search inside a folder; drag to reorder folders
- Background script + IndexedDB for very large libraries
- SPA-style navigation (`history.pushState` + `popstate`) when opening a post instead of a full page load
- Optional sync of folders across devices
