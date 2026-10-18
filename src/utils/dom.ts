import { FolderError } from '@/utils/folders';

type Child = Node | string | false | null | undefined;

/** Tiny hyperscript helper: el('button', { className: 'x', type: 'button' }, 'Label') */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children.filter((child): child is Node | string => Boolean(child)));
  return node;
}

// Stroke icons on a 24x24 grid. Styling (size, stroke) lives in CSS under .xmark-icon.
const ICONS = {
  folder:
    'M3 6.5A2.5 2.5 0 0 1 5.5 4h3.9c.6 0 1.2.3 1.6.8L12 6h6.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  close: 'M6 6l12 12M18 6L6 18',
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('xmark-icon');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

const FOLDER_ERRORS: Record<FolderError['code'], string> = {
  empty: 'Enter a folder name.',
  duplicate: 'A folder with that name already exists.',
  missing: 'That folder no longer exists.',
};

/** Turns any thrown value into a short message that is safe to show in the UI. */
export function describeError(error: unknown): string {
  if (error instanceof FolderError) return FOLDER_ERRORS[error.code];
  if (error instanceof Error && /invalidated/i.test(error.message)) {
    // Happens on open X tabs after the extension is reloaded or updated.
    return 'Xmark was updated. Reload this page to keep using it.';
  }
  if (error instanceof Error && error.message.startsWith('This file')) return error.message;
  console.error('Xmark error:', error);
  return 'Something went wrong. Try again.';
}
