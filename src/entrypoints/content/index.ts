import './style.css';
import { el, icon } from '@/utils/dom';
import { getFolders, onLibraryChanged, refreshPost } from '@/utils/folders';
import { setFolders, syncBookmarksPage, teardownBookmarksPage } from './bookmarks-page';
import { openPicker } from './picker';
import { closePopover } from './popover';
import { capturePost, getPostId, isStatusPage } from './snapshot';
import { startThemeSync } from './theme';

const BOOKMARK_SELECTOR = '[data-testid="bookmark"], [data-testid="removeBookmark"]';

/** Ids of every post that is in at least one folder; drives the "saved" state of the buttons. */
let savedIds = new Set<string>();
/** Snapshots already refreshed during this page load, so scrolling never causes repeated writes. */
const refreshed = new Set<string>();

function createFolderButton(article: HTMLElement): HTMLElement {
  const button = el('button', { type: 'button', className: 'xmark-action-button' }, icon('folder'));
  button.setAttribute('aria-label', 'Save to folder');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', (event) => {
    // Stop the click before it reaches X's React root, which would open the post.
    event.preventDefault();
    event.stopPropagation();
    openPicker(button, article);
  });

  const wrapper = el('div', { className: 'xmark-action' }, button);
  wrapper.dataset.xmark = 'button';
  return wrapper;
}

function syncButtons(): void {
  document.querySelectorAll<HTMLElement>('[data-xmark="button"]').forEach((wrapper) => {
    const article = wrapper.closest('article');
    const id = article ? getPostId(article) : undefined;
    wrapper.toggleAttribute('data-saved', id !== undefined && savedIds.has(id));
  });
}

/** After a short delay (so the post has finished rendering), re-snapshot saved posts to refresh counts and markup. */
function scheduleSnapshotRefresh(article: HTMLElement): void {
  if (isStatusPage()) return; // the post detail layout differs from the timeline layout
  window.setTimeout(() => {
    if (!article.isConnected) return;
    const post = capturePost(article);
    if (!post || !savedIds.has(post.id) || refreshed.has(post.id)) return;
    refreshed.add(post.id);
    void refreshPost(post).catch((error: unknown) => console.error('Xmark could not refresh a saved post.', error));
  }, 1500);
}

function inject(nativeBookmark: Element): void {
  if (nativeBookmark.closest('[data-xmark]')) return; // inside one of our own snapshots
  const article = nativeBookmark.closest<HTMLElement>('article');
  const group = nativeBookmark.closest('[role="group"]');
  if (!article || !group || group.querySelector('[data-xmark="button"]')) return;

  // Place our button right after the native bookmark button, as a direct child of the action row.
  let item: Element = nativeBookmark;
  while (item.parentElement && item.parentElement !== group) item = item.parentElement;
  const wrapper = createFolderButton(article);
  item.after(wrapper);
  syncButtons();
  scheduleSnapshotRefresh(article);
}

function scan(node: Element): void {
  if (node.matches(BOOKMARK_SELECTOR)) inject(node);
  node.querySelectorAll(BOOKMARK_SELECTOR).forEach(inject);
}

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  main(ctx) {
    const stopTheme = startThemeSync();

    const syncLibrary = async (): Promise<void> => {
      try {
        const folders = await getFolders();
        savedIds = new Set(folders.flatMap((folder) => folder.postIds));
        syncButtons();
        setFolders(folders);
      } catch (error) {
        console.error('Xmark could not read its folders.', error);
      }
    };
    void syncLibrary();
    const stopLibraryWatch = onLibraryChanged(() => void syncLibrary());

    // X adds and removes timeline cells constantly. Batch the work into one pass per frame.
    const pending = new Set<Element>();
    let frame = 0;
    const flush = (): void => {
      frame = 0;
      const nodes = [...pending];
      pending.clear();
      for (const node of nodes) if (node.isConnected) scan(node);
      syncBookmarksPage();
    };

    const observer = new MutationObserver((mutations) => {
      let dirty = false;
      for (const mutation of mutations) {
        // Ignore changes we made ourselves, otherwise rendering our UI would trigger more scans.
        if (mutation.target instanceof Element && mutation.target.closest('[data-xmark]')) continue;
        dirty = true;
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element && !node.closest('[data-xmark]')) pending.add(node);
        });
      }
      if (dirty && !frame) frame = requestAnimationFrame(flush);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    scan(document.body);
    syncBookmarksPage();

    // X is a single-page app: going to /i/bookmarks does not reload the page or re-run main().
    ctx.addEventListener(window, 'wxt:locationchange', () => {
      closePopover();
      syncBookmarksPage();
    });

    // When the extension is reloaded or updated, remove everything this (now orphaned) script added.
    ctx.onInvalidated(() => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      stopLibraryWatch();
      stopTheme();
      closePopover();
      teardownBookmarksPage();
      document.querySelectorAll('[data-xmark]').forEach((node) => node.remove());
    });
  },
});
