/**
 * Storage layer for Xmark.
 *
 * Layout in browser.storage.local:
 *   xmarkFolders      -> BookmarkFolder[]   (small: names + ordered post ids)
 *   xmarkPost:<id>    -> SavedPost          (big: one snapshot per post)
 *
 * Snapshots live under their own keys so that saving one post never rewrites
 * every other snapshot (the old single-array design did exactly that).
 *
 * Every write goes through exclusive() so two tabs saving at the same time
 * cannot overwrite each other's read-modify-write.
 */

export interface SavedPost {
  id: string;
  /** Canonical permalink, e.g. https://x.com/user/status/123 */
  url: string;
  /** Plain-text summary used by the popup and as a fallback card. */
  title: string;
  /** Sanitized outerHTML of the <article> at save time. Empty for legacy records. */
  html: string;
  savedAt: number;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  /** Post ids, oldest first. The post content lives under `xmarkPost:<id>`. */
  postIds: string[];
}

export interface ExportFile {
  version: 1;
  folders: BookmarkFolder[];
  posts: SavedPost[];
}

export const MAX_FOLDER_NAME = 40;

const FOLDERS_KEY = 'xmarkFolders';
const POST_PREFIX = 'xmarkPost:';

type FolderErrorCode = 'empty' | 'duplicate' | 'missing';

export class FolderError extends Error {
  code: FolderErrorCode;
  constructor(code: FolderErrorCode) {
    super(code);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

type LegacyBookmark = Omit<SavedPost, 'html'>;

function isLegacyBookmark(value: unknown): value is LegacyBookmark {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.url === 'string' &&
    typeof value.title === 'string' &&
    typeof value.savedAt === 'number'
  );
}

function isXPostUrl(value: string, id: string): boolean {
  try {
    const url = new URL(value);
    const permalink = /^\/[^/]+\/status\/(\d+)\/?$/.exec(url.pathname);
    return (
      url.protocol === 'https:' &&
      ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname.toLowerCase()) &&
      permalink?.[1] === id
    );
  } catch {
    return false;
  }
}

function isSavedPost(value: unknown): value is SavedPost {
  return (
    isLegacyBookmark(value) &&
    typeof (value as Record<string, unknown>).html === 'string' &&
    isXPostUrl(value.url, value.id)
  );
}

function isBookmarkFolder(value: unknown): value is BookmarkFolder {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isStringArray(value.postIds)
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const postKey = (id: string): string => `${POST_PREFIX}${id}`;
const sameName = (a: string, b: string): boolean => a.toLocaleLowerCase() === b.toLocaleLowerCase();

let queue: Promise<unknown> = Promise.resolve();

/**
 * Serializes storage mutations. Web Locks coordinate across tabs on the same
 * origin (all x.com tabs); the promise queue is the fallback for older browsers.
 */
async function exclusive<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    // request() resolves with whatever the callback returns; awaiting flattens the inner promise.
    return await navigator.locks.request('xmark-storage', task);
  }
  const result = queue.then(task, task) as Promise<T>;
  queue = result.catch(() => undefined);
  return result;
}

interface FolderState {
  folders: BookmarkFolder[];
  /** Posts found in the pre-snapshot format; they still need to be written under their own keys. */
  legacy: SavedPost[];
}

/** Reads the folders key, upgrading the old `{ bookmarks: [...] }` shape on the fly. */
async function readFolders(): Promise<FolderState> {
  const result = await browser.storage.local.get(FOLDERS_KEY);
  const raw: unknown = result[FOLDERS_KEY];
  const state: FolderState = { folders: [], legacy: [] };
  if (!Array.isArray(raw)) return state;

  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string') continue;
    if (isStringArray(item.postIds)) {
      state.folders.push({ id: item.id, name: item.name, postIds: item.postIds });
    } else if (Array.isArray(item.bookmarks)) {
      const old = item.bookmarks.filter(isLegacyBookmark);
      state.legacy.push(...old.map((bookmark) => ({ ...bookmark, html: '' })));
      state.folders.push({ id: item.id, name: item.name, postIds: old.map((bookmark) => bookmark.id) });
    }
  }
  return state;
}

function write(
  folders: BookmarkFolder[],
  legacy: SavedPost[] = [],
  extra: Record<string, unknown> = {},
): Promise<void> {
  const legacyEntries = Object.fromEntries(legacy.map((post) => [postKey(post.id), post]));
  return browser.storage.local.set({ ...legacyEntries, ...extra, [FOLDERS_KEY]: folders });
}

function isOrphan(folders: BookmarkFolder[], postId: string): boolean {
  return !folders.some((folder) => folder.postIds.includes(postId));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getFolders(): Promise<BookmarkFolder[]> {
  const { folders, legacy } = await readFolders();
  if (legacy.length > 0) {
    // Persist the upgrade once; failures are harmless because it is retried on the next read.
    void exclusive(async () => {
      const state = await readFolders();
      if (state.legacy.length > 0) await write(state.folders, state.legacy);
    }).catch((error: unknown) => console.error('Xmark could not migrate legacy folders.', error));
  }
  return folders;
}

/** Returns the stored posts for the given ids, in the same order. Missing records are skipped. */
export async function getPosts(ids: string[]): Promise<SavedPost[]> {
  if (ids.length === 0) return [];
  const result = await browser.storage.local.get(ids.map(postKey));
  return ids.flatMap((id) => {
    const value: unknown = result[postKey(id)];
    return isSavedPost(value) ? [value] : [];
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export function createFolder(name: string): Promise<BookmarkFolder> {
  return exclusive(async () => {
    const clean = name.trim().slice(0, MAX_FOLDER_NAME);
    if (!clean) throw new FolderError('empty');
    const { folders, legacy } = await readFolders();
    if (folders.some((folder) => sameName(folder.name, clean))) throw new FolderError('duplicate');
    const folder: BookmarkFolder = { id: crypto.randomUUID(), name: clean, postIds: [] };
    await write([...folders, folder], legacy);
    return folder;
  });
}

export function renameFolder(folderId: string, name: string): Promise<void> {
  return exclusive(async () => {
    const clean = name.trim().slice(0, MAX_FOLDER_NAME);
    if (!clean) throw new FolderError('empty');
    const { folders, legacy } = await readFolders();
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) throw new FolderError('missing');
    if (folders.some((item) => item.id !== folderId && sameName(item.name, clean))) {
      throw new FolderError('duplicate');
    }
    folder.name = clean;
    await write(folders, legacy);
  });
}

export function deleteFolder(folderId: string): Promise<void> {
  return exclusive(async () => {
    const { folders, legacy } = await readFolders();
    const removed = folders.find((item) => item.id === folderId);
    if (!removed) return;
    const remaining = folders.filter((item) => item.id !== folderId);
    await write(remaining, legacy);
    const orphans = removed.postIds.filter((id) => isOrphan(remaining, id));
    if (orphans.length > 0) await browser.storage.local.remove(orphans.map(postKey));
  });
}

export function addPostToFolder(folderId: string, post: SavedPost): Promise<'added' | 'exists'> {
  return exclusive(async () => {
    const { folders, legacy } = await readFolders();
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) throw new FolderError('missing');
    if (folder.postIds.includes(post.id)) return 'exists';
    folder.postIds.push(post.id);
    await write(folders, legacy, { [postKey(post.id)]: post });
    return 'added';
  });
}

export function removePostFromFolder(folderId: string, postId: string): Promise<void> {
  return exclusive(async () => {
    const { folders, legacy } = await readFolders();
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) throw new FolderError('missing');
    folder.postIds = folder.postIds.filter((id) => id !== postId);
    await write(folders, legacy);
    if (isOrphan(folders, postId)) await browser.storage.local.remove(postKey(postId));
  });
}

/** Replaces the snapshot of an already-saved post (used to refresh stale counts and markup). */
export function refreshPost(post: SavedPost): Promise<void> {
  return exclusive(async () => {
    const { folders } = await readFolders();
    if (isOrphan(folders, post.id)) return; // the post was removed in the meantime; don't resurrect it
    const key = postKey(post.id);
    const existing: unknown = (await browser.storage.local.get(key))[key];
    const savedAt = isLegacyBookmark(existing) ? existing.savedAt : post.savedAt;
    await browser.storage.local.set({ [key]: { ...post, savedAt } });
  });
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

export async function exportData(): Promise<ExportFile> {
  const { folders } = await readFolders();
  const ids = [...new Set(folders.flatMap((folder) => folder.postIds))];
  return { version: 1, folders, posts: await getPosts(ids) };
}

/** Merges a backup into the current library (folders with the same id or name are combined). */
export function importData(text: string): Promise<{ folders: number; posts: number }> {
  return exclusive(async () => {
    const data: unknown = JSON.parse(text);
    if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.folders) || !Array.isArray(data.posts)) {
      throw new Error('This file is not an Xmark backup.');
    }
    if (!data.folders.every(isBookmarkFolder) || !data.posts.every(isSavedPost)) {
      throw new Error('This file contains invalid folder or post data.');
    }
    const incoming = data.folders;
    const posts = data.posts;
    const postIds = new Set(posts.map((post) => post.id));
    if (incoming.some((folder) => folder.postIds.some((id) => !postIds.has(id)))) {
      throw new Error('This backup is missing one or more saved posts.');
    }

    const { folders, legacy } = await readFolders();
    for (const source of incoming) {
      const target = folders.find((item) => item.id === source.id || sameName(item.name, source.name));
      if (target) {
        for (const id of source.postIds) if (!target.postIds.includes(id)) target.postIds.push(id);
      } else {
        folders.push({ id: source.id, name: source.name.slice(0, MAX_FOLDER_NAME), postIds: [...new Set(source.postIds)] });
      }
    }

    const wanted = new Set(folders.flatMap((folder) => folder.postIds));
    const importedPosts = posts.filter((post) => wanted.has(post.id));
    const entries = Object.fromEntries(importedPosts.map((post) => [postKey(post.id), post]));
    await write(folders, legacy, entries);
    return { folders: incoming.length, posts: importedPosts.length };
  });
}

// ---------------------------------------------------------------------------
// Change notifications
// ---------------------------------------------------------------------------

/** Calls `listener` whenever folders or posts change, from any tab or the popup. Returns an unsubscribe function. */
export function onLibraryChanged(listener: () => void): () => void {
  const handler = (changes: Record<string, unknown>, area: string): void => {
    if (area === 'local' && Object.keys(changes).some((key) => key === FOLDERS_KEY || key.startsWith(POST_PREFIX))) {
      listener();
    }
  };
  browser.storage.onChanged.addListener(handler);
  return () => {
    try {
      browser.storage.onChanged.removeListener(handler);
    } catch {
      // The extension context is already gone (extension reloaded); nothing to remove.
    }
  };
}
