import type { SavedPost } from '@/utils/folders';

const STATUS_PATH = /^\/([^/]+)\/status\/(\d+)/;

// Removed from every snapshot, both when saving and again when rendering
// (stored HTML can come from an imported backup, so it is never trusted).
const UNSAFE = 'script, iframe, object, embed, link, style, base, [data-xmark]';
const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'poster']);
const UNSAFE_URL = /^\s*(?:javascript:|data:text\/html)/i;

export const isStatusPage = (): boolean => STATUS_PATH.test(location.pathname);

interface Permalink {
  id: string;
  handle: string;
}

/**
 * Finds the permalink of the post an <article> shows. The link wrapping the
 * <time> element is the post's own permalink; the first /status/ link can
 * belong to a quoted post, so it is only a fallback.
 */
function findPermalink(article: Element): Permalink | undefined {
  const candidates: (Element | null)[] = [
    article.querySelector('time')?.closest('a') ?? null,
    ...article.querySelectorAll('a[href*="/status/"]'),
  ];
  for (const link of candidates) {
    const href = link?.getAttribute('href');
    if (!href) continue;
    const match = new URL(href, location.origin).pathname.match(STATUS_PATH);
    if (match?.[1] && match[2]) return { handle: match[1], id: match[2] };
  }
  return undefined;
}

export function getPostId(article: Element): string | undefined {
  return findPermalink(article)?.id;
}

/** Strips anything executable from a DOM subtree, in place. */
export function sanitize(root: Element): void {
  root.querySelectorAll(UNSAFE).forEach((node) => node.remove());

  // Video players are blob/MSE based and cannot be cloned; keep the poster frame instead.
  root.querySelectorAll('video').forEach((video) => {
    const poster = video.getAttribute('poster');
    if (!poster) {
      video.remove();
      return;
    }
    const image = document.createElement('img');
    image.src = poster;
    image.alt = '';
    image.className = video.className;
    image.setAttribute('style', video.getAttribute('style') ?? '');
    video.replaceWith(image);
  });

  for (const node of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      const unsafeUrl = URL_ATTRIBUTES.has(name) && UNSAFE_URL.test(attribute.value);
      if (name.startsWith('on') || name === 'srcdoc' || unsafeUrl) node.removeAttribute(attribute.name);
    }
  }
}

/** Freezes the post shown in `article` into a storable record. */
export function capturePost(article: Element): SavedPost | undefined {
  const link = findPermalink(article);
  if (!link) return undefined;

  const text = article
    .querySelector<HTMLElement>('[data-testid="tweetText"]')
    ?.innerText.replace(/\s+/g, ' ')
    .trim();
  const title = (text ? `@${link.handle}: ${text}` : `Post by @${link.handle}`).slice(0, 300);

  const clone = article.cloneNode(true) as HTMLElement;
  sanitize(clone);

  return {
    id: link.id,
    url: `${location.origin}/${link.handle}/status/${link.id}`,
    title,
    html: clone.outerHTML,
    savedAt: Date.now(),
  };
}

/** Turns stored HTML back into a DOM node, sanitizing it again. Returns null if it holds no <article>. */
export function renderSnapshot(html: string): HTMLElement | null {
  // DOMParser builds an inert document: nothing runs and nothing loads until the node is imported.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const article = doc.body.querySelector('article');
  if (!article) return null;
  const node = document.importNode(article, true) as HTMLElement;
  sanitize(node);
  return node;
}
