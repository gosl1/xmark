# Xmark Code Guide

This guide describes the current source code in this repository, including its
storage format, main user flows, and the functions that implement them.

## What the extension does

Xmark is a WXT + TypeScript browser extension for Chrome/Chromium and Firefox.
It adds a folder action beside X's native bookmark action, stores posts in
user-created folders, and offers a folder-filtered view on X's native Bookmarks
route. The popup lets users manage folders and create or restore a backup.

Xmark keeps its own folder membership separate from X's native bookmarks. A
post can appear in an Xmark folder even when it is not bookmarked on X.

## History > Bookmarks and the live DOM

The folder view runs on X's History > Bookmarks route, `/i/history`. The older
`/i/bookmarks` route is also accepted for compatibility. On either route, the
content script waits for X's live timeline element with the exact accessible
label `[aria-label="Timeline: Bookmarks"]`. The route check alone is not
enough: if X changes that label or has not rendered the Bookmarks tab yet,
Xmark waits and does not insert its folder view.

`CTRL+U` shows the server/source HTML, not the live DOM after X's JavaScript
and browser extensions have run. X renders much of the page dynamically, and
Xmark's folder tabs and saved-post snapshots are inserted into the live DOM.
They are not expected to appear in `View Source`. The supplied snapshot's
`/i/history` URL is the route Xmark now targets; it does not by itself prove
that the timeline selector was present or that folder snapshots rendered.

### Is putting folder posts into the Bookmarks page DOM working?

**The implementation is present and wired to insert snapshots into the live
History > Bookmarks DOM. Its route matches `/i/history`, but source inspection
and `CTRL+U` alone cannot prove the current live X markup still matches its
timeline selector.** The relevant code path is:

1. `index.ts` starts one content script on X and calls
   `syncBookmarksPage()` at startup, after observed DOM changes, and on
   `wxt:locationchange` SPA navigation.
2. `bookmarks-page.ts` activates on `/i/history` (and the legacy
   `/i/bookmarks` route). It waits until X renders the Bookmarks timeline,
   then inserts Xmark's tab/list host immediately before that timeline.
3. Selecting a folder sets `data-xmark-hidden="true"` on X's native timeline
   and unhides Xmark's own list.
4. `renderList()` reads that folder's saved posts from extension storage,
   orders them newest-first, and appends rendered `<article>` snapshots to the
   Xmark list in batches of 15 using an `IntersectionObserver`.

Therefore:

- On `/i/history`, folder tabs and snapshots **should appear** after X renders
  `[aria-label="Timeline: Bookmarks"]` and the extension content script runs.
- `/i/bookmarks` is accepted as a legacy route, subject to the same selector
  requirement.
- The supplied `CTRL+U` HTML cannot confirm or disprove the live DOM insertion.

This is a code-path assessment, not a live-browser verification. To test the
runtime behavior, load the extension, open `/i/history`, select X's Bookmarks
view, wait for its timeline to render, then select an Xmark folder tab. Inspect
the **Elements** panel (not View Source): the injected container is marked
`data-xmark="bookmarks"` and each displayed item has class `.xmark-cell`. In
Xmark's **All** tab, X's timeline should be visible and the folder snapshot
list hidden.

## Project structure

| File | Responsibility |
| --- | --- |
| [`wxt.config.ts`](./wxt.config.ts) | WXT setup and extension manifest configuration. |
| [`src/entrypoints/content/index.ts`](./src/entrypoints/content/index.ts) | Content-script entry point; injects post buttons, watches the SPA/DOM, synchronizes storage and Bookmarks UI, and cleans up on extension invalidation. |
| [`src/entrypoints/content/bookmarks-page.ts`](./src/entrypoints/content/bookmarks-page.ts) | Folder tabs and snapshot list on `/i/history` (and legacy `/i/bookmarks`). |
| [`src/entrypoints/content/picker.ts`](./src/entrypoints/content/picker.ts) | “Save to folder” popover and reusable folder-creation form. |
| [`src/entrypoints/content/popover.ts`](./src/entrypoints/content/popover.ts) | Shared anchored popover lifecycle, placement, dismissal, and cleanup. |
| [`src/entrypoints/content/snapshot.ts`](./src/entrypoints/content/snapshot.ts) | Finds post permalinks, captures post markup, sanitizes it, and reconstructs stored snapshots. |
| [`src/entrypoints/content/theme.ts`](./src/entrypoints/content/theme.ts) | Reads X's theme/accent styling and syncs Xmark CSS variables. |
| [`src/entrypoints/content/style.css`](./src/entrypoints/content/style.css) | Content-script styling for the action button, popovers, tabs, and saved-post list. |
| [`src/utils/folders.ts`](./src/utils/folders.ts) | Sole storage layer for folders and saved posts, plus backup and change-notification APIs. |
| [`src/utils/dom.ts`](./src/utils/dom.ts) | Typed DOM element builder, SVG icon helper, and user-facing error descriptions. |
| [`src/entrypoints/popup/main.ts`](./src/entrypoints/popup/main.ts) | Popup UI for folder management, post removal, and import/export. |
| [`src/entrypoints/popup/index.html`](./src/entrypoints/popup/index.html) | Popup document shell and `#app` mount point. |
| [`src/entrypoints/popup/style.css`](./src/entrypoints/popup/style.css) | Popup layout and light/dark styles. |
| [`package.json`](./package.json) | Development, compile, build, and packaging commands/dependencies. |

## Architecture and data flow

### Storage model

`src/utils/folders.ts` owns all `browser.storage.local` access:

- `xmarkFolders` contains an ordered array of `{ id, name, postIds }`.
- `xmarkPost:<postId>` contains one `SavedPost` record, including permalink,
  plain-text title, sanitized article HTML, and the original save timestamp.
- `postIds` are ordered oldest-first. The Bookmarks folder view reverses that
  order when loading posts so newest entries display first.

Keeping each post under an independent storage key avoids rewriting every
snapshot when one post changes. Every read-modify-write mutation uses
`exclusive()`: Web Locks coordinate tabs where available, with a promise queue
as a fallback. Folder/post changes are observed using
`browser.storage.onChanged`, so the content script and popup can refresh one
another.

### Saving a post

1. `index.ts` finds X's native bookmark action inside an `article` and inserts
   an Xmark folder button in its action row.
2. Clicking the folder button prevents the event from reaching X's React root,
   then `picker.ts` captures the currently visible post and opens the picker.
3. The picker loads folders and shows a checked state for folders already
   containing that post. Choosing a row adds or removes the post.
4. `folders.ts` updates the folder's `postIds` and writes the snapshot record.
   Storage notifications update other open extension UI.

### Showing a folder on Bookmarks

The **All** tab does not alter X's native timeline. A folder tab hides that
timeline through the `data-xmark-hidden` CSS rule, reads the selected folder's
saved snapshots, and displays them inside Xmark's own DOM container. The
snapshots are cloned markup, not X React components; X's own event handlers
are not attached to them. Xmark therefore handles clicks and the caret action
itself.

### Security and stale markup

Saved article HTML is treated as untrusted both when captured and when
rendered. `snapshot.ts` removes executable/embed elements, extension-injected
nodes, inline event-handler attributes, and dangerous URL values. Stored HTML
is parsed inertly before its `<article>` is imported into the live document.
Video players cannot be cloned as functioning players; where possible, the
snapshot keeps only the poster image.

The content script may refresh the saved snapshot when a saved post appears in
a timeline again, so changing counts or markup can be updated. It skips this
refresh on a post detail (`/status/`) page because that page's layout differs.

## Function reference

The functions below are grouped by source file. Private helpers are included
where they implement a meaningful part of a user flow or data invariant.

### `src/entrypoints/content/index.ts`

- `createFolderButton(article)` builds the action-row button, its accessibility
  attributes, and click handler.
- `syncButtons()` updates each injected button's saved visual state based on
  the current set of folder post IDs.
- `scheduleSnapshotRefresh(article)` delays capture until X has rendered the
  post, then refreshes a saved snapshot at most once per post per page load.
- `inject(nativeBookmark)` inserts one folder button next to a native
  bookmark action; ignores actions inside Xmark snapshots and duplicate rows.
- `scan(node)` checks a DOM node and its descendants for native bookmark
  controls that need an Xmark button.
- The content-script `main(ctx)` starts theme/library watchers and a batched
  `MutationObserver`, synchronizes the Bookmarks page during SPA navigation,
  and removes Xmark UI/listeners if the extension context is invalidated.

### `src/entrypoints/content/bookmarks-page.ts`

- `isBookmarksPage()` checks for normalized `/i/history` or legacy
  `/i/bookmarks`.
- `syncBookmarksPage()` tears down when leaving the page; otherwise waits for
  X's Bookmarks timeline, builds the Xmark UI once, reattaches it if X replaces
  its surrounding DOM, and applies the selected-tab visibility.
- `teardownBookmarksPage()` disconnects lazy rendering, invalidates pending
  renders, removes Xmark's host, and restores any timeline hidden by Xmark.
- `setFolders(next)` updates the in-memory folder list and redraws the tabs and
  selected snapshots only when stored folder data changed.
- `buildUi()` creates the tab bar and hidden snapshot list and registers click
  handlers for snapshot interactions.
- `applyVisibility()` hides X's native timeline only while a folder is
  selected.
- `select(id)` switches between **All** (`null`) and a folder, closes any
  popover, and refreshes tabs/list visibility.
- `renderBar()` renders **All**, one tab per folder, and the **New folder**
  control.
- `openNewFolder(anchor)` creates a folder through the shared form and selects
  it once it is added to storage.
- `renderList()` loads the selected folder's posts, handles empty/read-error
  states, and appends them in 15-post lazy-render batches.
- `buildCell(post)` creates the Xmark wrapper for a post and inserts either a
  sanitized snapshot or a fallback card.
- `buildFallback(post)` displays the stored title when no usable article
  snapshot is available.
- `onListClick(event)` handles click/middle-click behavior for inert snapshots:
  caret opens the remove menu, links follow their URL, and other clicks open
  the post.
- `openUrl(url, newTab)` only opens HTTP(S) links and chooses same-tab or
  new-tab navigation.
- `openCellMenu(anchor, postId)` opens the snapshot's “Remove from folder”
  action and removes the post from the selected folder.

### `src/entrypoints/content/picker.ts`

- `createFolderForm(onSubmit)` builds the reusable folder-name form and
  displays errors/status text.
- `openPicker(anchor, article)` toggles the picker and captures a snapshot
  immediately while the post is on screen.
- `buildPicker(root, post)` renders folders and their membership state, allows
  folder creation, and adds/removes the captured post.
- Its `renderList()` reloads current folders and redraws the picker after each
  mutation. The local `run()` helper surfaces errors in the picker.

### `src/entrypoints/content/popover.ts`

- `isOpenFor(anchor)` tells callers whether the shared popover belongs to a
  given anchor.
- `closePopover()` removes the active popover, resets its anchor's expanded
  state, and releases listeners/observers.
- `openPopover(anchor, build)` creates and positions a dialog relative to its
  anchor; repositions on scroll/resize; closes on outside click, Escape, or
  when the anchor leaves the screen; and stops X's keyboard shortcuts from
  consuming typing in the dialog.

### `src/entrypoints/content/snapshot.ts`

- `isStatusPage()` identifies a post-detail route.
- `findPermalink(article)` finds the displayed post's handle and ID, preferring
  the link around its `<time>` element so a quoted post's permalink is not
  mistaken for the main post.
- `getPostId(article)` returns the ID from `findPermalink()`.
- `sanitize(root)` strips unsafe elements, inline event handlers, unsafe URL
  attributes, and `data-xmark` nodes; replaces videos with their poster image
  when possible.
- `capturePost(article)` generates the title, permalink, save timestamp, and
  sanitized `outerHTML` for a post.
- `renderSnapshot(html)` parses stored HTML inertly, imports its `<article>`,
  sanitizes it again, and returns `null` if no article exists.

### `src/entrypoints/content/theme.ts`

- `startThemeSync()` identifies X's light/dim/dark theme, reads a non-neutral
  accent from its Post button, observes relevant body style/class changes, and
  returns a cleanup function.

### `src/utils/dom.ts`

- `el(tag, props, ...children)` creates a typed HTML element and appends the
  supplied node/text children.
- `icon(name)` constructs one of the extension's inline SVG stroke icons.
- `describeError(error)` maps known folder/context errors to UI-safe messages,
  logs unexpected errors, and returns a generic message for unknown failures.

### `src/utils/folders.ts`

**Validation and internal storage helpers**

- `isRecord(value)` narrows a non-null object to a record.
- `isStringArray(value)` validates an array of strings.
- `isLegacyBookmark(value)` recognizes the earlier bookmark record shape,
  which lacked snapshot HTML.
- `isXPostUrl(value, id)` checks that a stored permalink uses an accepted X
  host, HTTPS, and a status path matching the record ID.
- `isSavedPost(value)` validates a current snapshot record.
- `isBookmarkFolder(value)` validates the folder record shape.
- `postKey(id)` creates the storage key for one saved post.
- `sameName(a, b)` compares folder names case-insensitively.
- `exclusive(task)` serializes a storage mutation with Web Locks or a
  promise-queue fallback.
- `readFolders()` reads current folders and maps the legacy embedded
  `bookmarks` format into folder post IDs plus legacy snapshot records.
- `write(folders, legacy, extra)` persists folder metadata, legacy records
  needing migration, and optional post records.
- `isOrphan(folders, postId)` checks whether any folder still references a
  post.

**Public storage functions**

- `getFolders()` reads folder metadata and schedules migration of legacy
  records.
- `getPosts(ids)` loads valid saved posts in the requested order, skipping
  missing/invalid records.
- `createFolder(name)` trims/truncates the name, enforces non-empty and
  case-insensitive uniqueness rules, and creates a folder.
- `renameFolder(folderId, name)` validates a new name and updates the matching
  folder.
- `deleteFolder(folderId)` removes a folder and deletes post records no longer
  referenced by any remaining folder.
- `addPostToFolder(folderId, post)` adds an ID and writes the post snapshot,
  returning `added` or `exists`.
- `removePostFromFolder(folderId, postId)` removes folder membership and
  deletes the snapshot only if no folder still references it.
- `refreshPost(post)` replaces an existing snapshot without restoring a post
  that has since been removed from all folders; it preserves the original save
  timestamp.
- `exportData()` returns a version-1 backup with folders and their referenced
  post records.
- `importData(text)` parses and validates a version-1 backup, merges folders
  by ID or case-insensitive name, and writes imported records.
- `onLibraryChanged(listener)` subscribes to local folder/post storage changes
  and returns an unsubscribe function.

`SavedPost`, `BookmarkFolder`, `ExportFile`, `FolderError`, and
`MAX_FOLDER_NAME` define/validate the storage API. Folder names are limited to
40 characters.

### `src/entrypoints/popup/main.ts`

- `showStatus(message, isError)` updates the popup's accessible status line.
- The Export handler serializes `exportData()` as JSON and downloads it.
- The Import handler reads a selected JSON file, calls `importData()`, and
  reports success or validation errors.
- `iconButton(name, label, onClick)` creates an accessible icon button and
  prevents its click from toggling the enclosing folder disclosure.
- `folderSection(folder)` renders one expandable folder, its rename/delete
  actions, post links, and per-post remove controls. Delete requires a second
  click within three seconds.
- Its `loadPosts()` loads a folder's posts only when expanded.
- `render()` reloads and redraws all folder sections.
- The popup starts with `render()` and subscribes to library changes to stay
  current while it remains open.

## Styling and conventions

- Content UI styles are in `src/entrypoints/content/style.css`; popup styles
  are separate in `src/entrypoints/popup/style.css`.
- Content styling follows X's detected theme and accent through CSS variables.
- Injected extension nodes are marked with `data-xmark`; the observer avoids
  recursively reacting to Xmark's own UI, and snapshot sanitization strips
  those nodes.
- UI text is created via DOM APIs and `textContent`; stored post HTML is only
  inserted through the sanitizing snapshot renderer.
- Keep X-dependent selectors centralized and re-check them in DevTools if X
  changes its markup. In particular, the Bookmarks view depends on the exact
  route and timeline accessibility label.

## Development commands

- `npm run dev` — run WXT for Chrome/Chromium.
- `npm run dev:firefox` — run WXT for Firefox.
- `npm run compile` — TypeScript check without emitting files.
- `npm run build` / `npm run build:firefox` — production builds.
- `npm run zip` / `npm run zip:firefox` — create browser-specific archives.

The manifest requests `storage` and `unlimitedStorage`; the latter is intended
for the larger saved article snapshots.
