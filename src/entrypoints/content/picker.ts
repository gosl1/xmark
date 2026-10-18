import {
  addPostToFolder,
  createFolder,
  getFolders,
  MAX_FOLDER_NAME,
  removePostFromFolder,
  type SavedPost,
} from '@/utils/folders';
import { describeError, el, icon } from '@/utils/dom';
import { closePopover, isOpenFor, openPopover } from './popover';
import { capturePost } from './snapshot';

export interface FolderForm {
  form: HTMLFormElement;
  input: HTMLInputElement;
  status: HTMLElement;
  setStatus(message: string, isError?: boolean): void;
}

/** "Folder name" input + Create button + a status line. Shared by the picker and the bookmarks tab bar. */
export function createFolderForm(onSubmit: (name: string) => Promise<void>): FolderForm {
  const input = el('input', {
    type: 'text',
    maxLength: MAX_FOLDER_NAME,
    placeholder: 'Folder name',
    autocomplete: 'off',
  });
  input.setAttribute('aria-label', 'Folder name');
  const submit = el('button', { type: 'submit', textContent: 'Create' });
  const form = el('form', { className: 'xmark-form' }, input, submit);

  const status = el('div', { className: 'xmark-status' });
  status.setAttribute('role', 'status');
  const setStatus = (message: string, isError = false): void => {
    status.textContent = message;
    status.dataset.error = String(isError);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void onSubmit(input.value).catch((error: unknown) => setStatus(describeError(error), true));
  });

  return { form, input, status, setStatus };
}

export function openPicker(anchor: HTMLElement, article: HTMLElement): void {
  if (isOpenFor(anchor)) {
    closePopover();
    return;
  }
  // Snapshot now: the click is the moment the post is guaranteed to be on screen.
  const post = capturePost(article);
  openPopover(anchor, (root) => buildPicker(root, post));
}

function buildPicker(root: HTMLElement, post: SavedPost | undefined): void {
  root.setAttribute('aria-label', 'Save to folder');

  const list = el('div', { className: 'xmark-list' });
  const ui = createFolderForm(async (name) => {
    const folder = await createFolder(name);
    if (post) await addPostToFolder(folder.id, post);
    ui.input.value = '';
    ui.form.hidden = true;
    ui.setStatus(post ? `Saved to ${folder.name}.` : `Created ${folder.name}.`);
    await renderList();
  });
  ui.form.hidden = true;

  const newRow = el(
    'button',
    { type: 'button', className: 'xmark-row' },
    icon('plus'),
    el('span', { className: 'xmark-row-name', textContent: 'New folder' }),
  );
  newRow.addEventListener('click', () => {
    ui.form.hidden = !ui.form.hidden;
    if (!ui.form.hidden) ui.input.focus();
  });

  const run = async (task: () => Promise<void>): Promise<void> => {
    try {
      await task();
    } catch (error) {
      ui.setStatus(describeError(error), true);
    }
  };

  async function renderList(): Promise<void> {
    await run(async () => {
      const folders = await getFolders();
      list.replaceChildren();
      if (folders.length === 0) {
        list.append(el('div', { className: 'xmark-hint', textContent: 'No folders yet. Create one above.' }));
        return;
      }
      for (const folder of folders) {
        const saved = post !== undefined && folder.postIds.includes(post.id);
        const row = el(
          'button',
          { type: 'button', className: 'xmark-row' },
          icon('folder'),
          el('span', { className: 'xmark-row-name', textContent: folder.name }),
          el('span', { className: 'xmark-row-count', textContent: String(folder.postIds.length) }),
          el('span', { className: 'xmark-row-check' }, saved && icon('check')),
        );
        row.setAttribute('aria-pressed', String(saved));
        row.addEventListener('click', () => {
          void run(async () => {
            if (!post) {
              ui.setStatus('Could not read this post. Try again once it finishes loading.', true);
              return;
            }
            if (saved) {
              await removePostFromFolder(folder.id, post.id);
              ui.setStatus(`Removed from ${folder.name}.`);
            } else {
              await addPostToFolder(folder.id, post);
              ui.setStatus(`Saved to ${folder.name}.`);
            }
            await renderList();
          });
        });
        list.append(row);
      }
    });
  }

  root.append(
    el('div', { className: 'xmark-popover-title', textContent: 'Save to folder' }),
    newRow,
    ui.form,
    ui.status,
    list,
  );
  if (!post) ui.setStatus('Could not read this post. Try again once it finishes loading.', true);
  void renderList();
}
