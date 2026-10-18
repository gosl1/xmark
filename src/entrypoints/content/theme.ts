/**
 * X has three themes (Default/light, Dim, Lights out) and a user-chosen accent
 * color. We read them from the page instead of hard-coding colors, and expose
 * them to style.css as `data-xmark-theme` and `--xmark-accent`.
 */
export function startThemeSync(): () => void {
  const root = document.documentElement;

  const apply = (): void => {
    // X paints its theme as an inline background on <body>: white, #15202b or black.
    const [r = 255, g = 255, b = 255] = (getComputedStyle(document.body).backgroundColor.match(/\d+/g) ?? []).map(Number);
    const sum = r + g + b;
    root.dataset.xmarkTheme = sum > 600 ? 'light' : sum < 30 ? 'dark' : 'dim';

    // The sidebar "Post" button uses the accent color. Ignore greys (some layouts render it black/white).
    const post = document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
    const rgb = post ? getComputedStyle(post).backgroundColor.match(/\d+/g)?.map(Number) : undefined;
    if (rgb && rgb.length >= 3 && Math.max(...rgb.slice(0, 3)) - Math.min(...rgb.slice(0, 3)) > 30) {
      root.style.setProperty('--xmark-accent', `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`);
    }
  };

  apply();
  const observer = new MutationObserver(apply);
  observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });

  return () => {
    observer.disconnect();
    delete root.dataset.xmarkTheme;
    root.style.removeProperty('--xmark-accent');
  };
}
