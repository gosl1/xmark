import { el } from '@/utils/dom';

/**
 * One popover at a time, anchored to an element.
 *
 * The old panel was positioned once from the click's clientX/clientY, so it
 * stayed glued to the viewport while the post scrolled away. This one is
 * re-measured against its anchor on every scroll/resize, flips above the
 * anchor when there is no room below, and closes when the anchor leaves the
 * screen or is removed (X recycles timeline cells as you scroll).
 */

interface Current {
  anchor: HTMLElement;
  root: HTMLElement;
  cleanup: () => void;
}

let current: Current | undefined;

export const isOpenFor = (anchor: Element): boolean => current?.anchor === anchor;

export function closePopover(): void {
  if (!current) return;
  const { anchor, root, cleanup } = current;
  current = undefined;
  cleanup();
  root.remove();
  anchor.setAttribute('aria-expanded', 'false');
}

export function openPopover(anchor: HTMLElement, build: (root: HTMLElement) => void): HTMLElement {
  closePopover();

  const root = el('div', { className: 'xmark-popover' });
  root.dataset.xmark = 'popover';
  root.setAttribute('role', 'dialog');
  build(root);
  document.body.append(root);
  anchor.setAttribute('aria-expanded', 'true');

  const place = (): void => {
    const rect = anchor.getBoundingClientRect();
    const onScreen = anchor.isConnected && rect.bottom > 0 && rect.top < window.innerHeight;
    if (!onScreen) {
      closePopover();
      return;
    }
    const width = root.offsetWidth;
    const height = root.offsetHeight;
    const below = rect.bottom + 6;
    const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, rect.top - height - 6);
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    root.style.top = `${top}px`;
    root.style.left = `${left}px`;
  };

  let frame = 0;
  const schedule = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place();
    });
  };

  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (target instanceof Node && !root.contains(target) && !anchor.contains(target)) closePopover();
  };
  const onEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    closePopover();
    anchor.focus({ preventScroll: true });
  };
  // Keep typing in the popover away from X's single-key shortcuts (j, k, n, ...).
  const stopKeys = (event: Event): void => event.stopPropagation();

  const resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(root);
  window.addEventListener('scroll', schedule, { capture: true, passive: true });
  window.addEventListener('resize', schedule);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onEscape, true);
  for (const type of ['keydown', 'keyup', 'keypress']) root.addEventListener(type, stopKeys);

  current = {
    anchor,
    root,
    cleanup: () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onEscape, true);
    },
  };

  place();
  root.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true });
  return root;
}
