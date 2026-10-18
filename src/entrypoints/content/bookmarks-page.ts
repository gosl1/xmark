import {
  createFolder,
  getFolders,
  getPosts,
  removePostFromFolder,
  type BookmarkFolder,
  type SavedPost,
} from '@/utils/folders';
import { describeError, el, icon } from '@/utils/dom';
import { createFolderForm } from './picker';
import { closePopover, isOpenFor, openPopover } from './popover';
import { renderSnapshot } from './snapshot';

/**
 * On X's History > Bookmarks view, inserts a tab bar ("All" + one tab per
 * folder) above the native timeline. "All" shows X's own list untouched. A
 * folder tab hides the native timeline and shows saved snapshots instead.
 */

const BOOKMARKS_PATHS = new Set(['/i/history', '/i/bookmarks']);
const TIMELINE_SELECTOR = '[aria-label="Timeline: Bookmarks"]';
const PAGE_SIZE = 15;

interface Ui {
  host: HTMLElement;
  bar: HTMLElement;
  list: HTMLElement;
}

let ui: Ui | undefined;
let folders: BookmarkFolder[] = [];
let selectedId: string | null = null;
let renderToken = 0;
let observer: IntersectionObserver | undefined;

const isBookmarksPage = (): boolean => BOOKMARKS_PATHS.has(location.pathname.replace(/\/+$/, ''));

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Called on every DOM change and navigation; cheap when nothing needs doing. */
export function syncBookmarksPage(): void {
  if (!isBookmarksPage()) {
    teardownBookmarksPage();
    return;
  }
  const timeline = document.querySelector<HTMLElement>(TIMELINE_SELECTOR);
  if (!timeline?.parentElement) return; // X has not rendered the timeline yet

  if (!ui) buildUi();
  // X's React may re-render the parent and drop foreign nodes, so re-attach when needed.
  if (ui && ui.host.nextElementSibling !== timeline) timeline.before(ui.host);
  applyVisibility();
}

export function teardownBookmarksPage(): void {
  observer?.disconnect();
  renderToken++;
  selectedId = null;
  if (ui) {
    ui.host.remove();
    ui = undefined;
  }
  document.querySelectorAll<HTMLElement>('[data-xmark-hidden]').forEach((node) => delete node.dataset.xmarkHidden);
}

/** Receives the latest folders from storage. Only re-renders when something visible changed. */
export function setFolders(next: BookmarkFolder[]): void {
  const changed = JSON.stringify(next) !== JSON.stringify(folders);
  folders = next;
  if (!changed || !ui) return;
  if (selectedId && !folders.some((folder) => folder.id === selectedId)) selectedId = null;
  renderBar();
  applyVisibility();
  void renderList();
}

function buildUi(): void {
  const bar = el('div', { className: 'xmark-bar' });
  bar.setAttribute('role', 'tablist');
  bar.setAttribute('aria-label', 'Bookmark folders');
  const list = el('div', { className: 'xmark-list-view' });
  list.hidden = true;
  const host = el('div', {}, bar, list);
  host.dataset.xmark = 'bookmarks';

  list.addEventListener('click', onListClick);
  list.addEventListener('auxclick', onListClick);
  ui = { host, bar, list };
  renderBar();
}

function applyVisibility(): void {
  if (!ui) return;
  const timeline = document.querySelector<HTMLElement>(TIMELINE_SELECTOR);
  if (timeline) {
    if (selectedId) timeline.dataset.xmarkHidden = 'true';
    else delete timeline.dataset.xmarkHidden;
  }
  ui.list.hidden = selectedId === null;
}

function select(id: string | null): void {
  selectedId = id;
  closePopover();
  renderBar();
  applyVisibility();
  void renderList();
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

function renderBar(): void {
  if (!ui) return;
  ui.bar.replaceChildren();

  const tabs: { id: string | null; name: string }[] = [
    { id: null, name: 'All' },
    ...folders.map((folder) => ({ id: folder.id, name: folder.name })),
  ];
  for (const tab of tabs) {
    const button = el('button', { type: 'button', className: 'xmark-tab' }, el('span', { textContent: tab.name }));
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(tab.id === selectedId));
    button.addEventListener('click', () => select(tab.id));
    ui.bar.append(button);
  }

  const add = el('button', { type: 'button', className: 'xmark-tab xmark-tab-add' }, icon('plus'));
  add.setAttribute('aria-label', 'New folder');
  add.addEventListener('click', () => openNewFolder(add));
  ui.bar.append(add);
}

function openNewFolder(anchor: HTMLElement): void {
  if (isOpenFor(anchor)) {
    closePopover();
    return;
  }
  openPopover(anchor, (root) => {
    root.setAttribute('aria-label', 'New folder');
    const form = createFolderForm(async (name) => {
      const folder = await createFolder(name);
      // Storage change events arrive a moment later; load now so the new tab exists before selecting it.
      setFolders(await getFolders());
      select(folder.id);
    });
    root.append(el('div', { className: 'xmark-popover-title', textContent: 'New folder' }), form.form, form.status);
  });
}

// ---------------------------------------------------------------------------
// Snapshot list
// ---------------------------------------------------------------------------

async function renderList(): Promise<void> {
  if (!ui) return;
  const { list } = ui;
  const token = ++renderToken;
  observer?.disconnect();
  list.replaceChildren();

  const folder = folders.find((item) => item.id === selectedId);
  if (!folder) return;

  // Newest first, like X's own bookmarks list.
  let posts: SavedPost[];
  try {
    posts = await getPosts([...folder.postIds].reverse());
  } catch (error) {
    if (token === renderToken) {
      list.append(el('div', { className: 'xmark-fallback', textContent: describeError(error) }));
    }
    return;
  }
  if (token !== renderToken) return; // a newer render started while we were reading storage

  if (posts.length === 0) {
    list.append(
      el(
        'div',
        { className: 'xmark-empty' },
        el('h2', { textContent: 'Nothing here yet' }),
        el('p', { textContent: `Use the folder button under any post to save it to ${folder.name}.` }),
      ),
    );
    return;
  }

  // Render in batches: a folder can hold hundreds of posts and each one is a full article.
  let shown = 0;
  const sentinel = el('div', { className: 'xmark-sentinel' });
  list.append(sentinel);
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      for (const post of posts.slice(shown, shown + PAGE_SIZE)) sentinel.before(buildCell(post));
      shown += PAGE_SIZE;
      if (shown >= posts.length) {
        observer?.disconnect();
        sentinel.remove();
      } else {
        // Re-observe so the callback fires again if the sentinel is still in view.
        observer?.unobserve(sentinel);
        observer?.observe(sentinel);
      }
    },
    { rootMargin: '800px' },
  );
  observer.observe(sentinel);
}

function buildCell(post: SavedPost): HTMLElement {
  const cell = el('div', { className: 'xmark-cell' });
  cell.dataset.postId = post.id;
  cell.dataset.postUrl = post.url;
  cell.append(post.html ? (renderSnapshot(post.html) ?? buildFallback(post)) : buildFallback(post));
  return cell;
}

/** Shown for posts saved before snapshots existed, or whose stored HTML is unusable. */
function buildFallback(post: SavedPost): HTMLElement {
  return el(
    'div',
    { className: 'xmark-fallback' },
    el('p', { textContent: post.title }),
    el('span', { textContent: 'Open to see the full post' }),
  );
}

// ---------------------------------------------------------------------------
// Clicks inside the (dead) snapshots
// ---------------------------------------------------------------------------

function onListClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  const cell = event.target.closest<HTMLElement>('.xmark-cell');
  if (!cell || (event.type === 'auxclick' && event.button !== 1)) return;

  // The clone has no React handlers, so everything here is ours to define.
  event.preventDefault();
  event.stopPropagation();

  const caret = event.target.closest<HTMLElement>('[data-testid="caret"]');
  if (caret) {
    if (event.type === 'click') openCellMenu(caret, cell.dataset.postId ?? '');
    return;
  }
  if (window.getSelection()?.toString()) return; // the user is selecting text, not navigating

  // Links inside the post (profile, hashtag, media) go where they point; anything else opens the post.
  const link = event.target.closest<HTMLAnchorElement>('a[href]');
  const url = link ? link.href : cell.dataset.postUrl;
  if (!url) return;
  openUrl(url, event.type === 'auxclick' || event.ctrlKey || event.metaKey || event.shiftKey);
}

function openUrl(url: string, newTab: boolean): void {
  const target = new URL(url, location.origin);
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return;
  if (newTab || target.origin !== location.origin) window.open(target.href, '_blank', 'noopener');
  else location.assign(target.href);
}

function openCellMenu(anchor: HTMLElement, postId: string): void {
  const folder = folders.find((item) => item.id === selectedId);
  if (!folder || !postId) return;
  if (isOpenFor(anchor)) {
    closePopover();
    return;
  }
  openPopover(anchor, (root) => {
    root.classList.add('xmark-menu');
    root.setAttribute('aria-label', 'Post actions');
    const row = el(
      'button',
      { type: 'button', className: 'xmark-row xmark-row-danger' },
      icon('trash'),
      el('span', { className: 'xmark-row-name', textContent: `Remove from ${folder.name}` }),
    );
    row.addEventListener('click', () => {
      closePopover();
      // The storage change event re-renders the list, so there is nothing else to update here.
      void removePostFromFolder(folder.id, postId).catch((error: unknown) => console.error(describeError(error)));
    });
    root.append(row);
  });
}
