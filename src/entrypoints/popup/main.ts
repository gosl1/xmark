import './style.css';
import { describeError, el, icon, type IconName } from '@/utils/dom';
import {
  deleteFolder,
  exportData,
  getFolders,
  getPosts,
  importData,
  MAX_FOLDER_NAME,
  onLibraryChanged,
  removePostFromFolder,
  renameFolder,
  type BookmarkFolder,
} from '@/utils/folders';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Xmark popup is missing its #app element.');

/** Folders the user has expanded, so a re-render (e.g. after a rename) keeps them open. */
const openIds = new Set<string>();

const status = el('p', { className: 'status' });
status.setAttribute('role', 'status');
const showStatus = (message: string, isError = false): void => {
  status.textContent = message;
  status.dataset.error = String(isError);
};

const folderList = el('div', {});

// --- Header with backup actions ---------------------------------------------

const fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
const exportButton = el('button', { type: 'button', className: 'pill', textContent: 'Export' });
const importButton = el('button', { type: 'button', className: 'pill', textContent: 'Import' });

exportButton.addEventListener('click', () => {
  void (async () => {
    try {
      const blob = new Blob([JSON.stringify(await exportData())], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = el('a', { href: url, download: `xmark-backup-${new Date().toISOString().slice(0, 10)}.json` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showStatus('Backup downloaded.');
    } catch (error) {
      showStatus(describeError(error), true);
    }
  })();
});

// Note: Firefox closes extension popups when a file dialog opens, so import can be flaky there.
importButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  void (async () => {
    try {
      const result = await importData(await file.text());
      showStatus(`Imported ${result.posts} posts across ${result.folders} folders.`);
    } catch (error) {
      showStatus(error instanceof SyntaxError ? 'This file is not valid JSON.' : describeError(error), true);
    } finally {
      fileInput.value = '';
    }
  })();
});

app.append(
  el(
    'header',
    {},
    el('h1', { textContent: 'Xmark' }),
    el('p', { className: 'subtitle', textContent: 'Your saved X posts, organized in folders.' }),
    el('div', { className: 'actions' }, exportButton, importButton, fileInput),
    status,
  ),
  folderList,
);

// --- Folder list ------------------------------------------------------------

function iconButton(name: IconName, label: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const button = el('button', { type: 'button', className: 'icon-button' }, icon(name));
  button.setAttribute('aria-label', label);
  button.addEventListener('click', (event) => {
    // The button sits inside <summary>; without this, clicking it would also toggle the folder.
    event.preventDefault();
    event.stopPropagation();
    onClick(button);
  });
  return button;
}

function folderSection(folder: BookmarkFolder): HTMLElement {
  const details = el('details', { className: 'folder' });
  details.open = openIds.has(folder.id);
  const body = el('div', { className: 'folder-body' });

  const name = el('span', { className: 'folder-name', textContent: folder.name });

  const rename = iconButton('edit', `Rename ${folder.name}`, () => {
    const input = el('input', { className: 'rename-input', value: folder.name, maxLength: MAX_FOLDER_NAME });
    input.setAttribute('aria-label', 'Folder name');
    name.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const finish = async (save: boolean): Promise<void> => {
      if (done) return;
      done = true;
      const next = input.value.trim();
      if (save && next && next !== folder.name) {
        try {
          await renameFolder(folder.id, next);
        } catch (error) {
          showStatus(describeError(error), true);
        }
      }
      await render();
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        void finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        void finish(false);
      }
    });
    input.addEventListener('blur', () => void finish(false));
  });

  // Two-step delete instead of confirm(), which is unreliable inside extension popups.
  let armTimer = 0;
  const remove = iconButton('trash', `Delete ${folder.name}`, (button) => {
    if (button.dataset.armed === undefined) {
      button.dataset.armed = 'true';
      showStatus(`Click delete again to remove "${folder.name}" and its saved posts.`);
      armTimer = window.setTimeout(() => delete button.dataset.armed, 3000);
      return;
    }
    window.clearTimeout(armTimer);
    void deleteFolder(folder.id)
      .then(() => {
        openIds.delete(folder.id);
        showStatus(`Deleted ${folder.name}.`);
        return render();
      })
      .catch((error: unknown) => showStatus(describeError(error), true));
  });
  remove.dataset.danger = 'true';

  const summary = el(
    'summary',
    {},
    icon('folder'),
    name,
    el('span', { className: 'folder-count', textContent: String(folder.postIds.length) }),
    rename,
    remove,
  );

  // Loading posts pulls full snapshots from storage, so only do it for folders the user opens.
  const loadPosts = async (): Promise<void> => {
    try {
      const posts = await getPosts([...folder.postIds].reverse());
      body.replaceChildren();
      if (posts.length === 0) {
        body.append(el('p', { className: 'hint', textContent: 'No saved posts.' }));
        return;
      }
      const list = el('ul', {});
      for (const post of posts) {
        const link = el('a', { href: post.url, target: '_blank', rel: 'noopener noreferrer', textContent: post.title });
        const unsave = iconButton('close', 'Remove from folder', () => {
          void removePostFromFolder(folder.id, post.id).catch((error: unknown) => showStatus(describeError(error), true));
        });
        list.append(el('li', {}, link, unsave));
      }
      body.append(list);
    } catch (error) {
      body.replaceChildren(el('p', { className: 'hint', textContent: describeError(error) }));
    }
  };

  details.addEventListener('toggle', () => {
    if (details.open) {
      openIds.add(folder.id);
      void loadPosts();
    } else {
      openIds.delete(folder.id);
    }
  });
  details.append(summary, body);
  if (details.open) void loadPosts();
  return details;
}

async function render(): Promise<void> {
  try {
    const folders = await getFolders();
    folderList.replaceChildren();
    if (folders.length === 0) {
      folderList.append(
        el('p', {
          className: 'hint',
          textContent: 'No folders yet. On X, use the folder button under any post to create one.',
        }),
      );
      return;
    }
    for (const folder of folders) folderList.append(folderSection(folder));
  } catch (error) {
    showStatus(describeError(error), true);
  }
}

void render();
// Keep the popup in sync with saves made on X while it is open.
onLibraryChanged(() => void render());
