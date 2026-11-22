/**
 * The opening screen (#splash in index.html) shows the moment the page arrives, before any of the app has loaded. It
 * stays until the app has drawn something real in #root, then fades out (180 ms, ease-in) and is removed.
 *
 * "Something real" is anything but a blank placeholder: Root's `.boot` while it asks who is signed in, the console's
 * `.boot`, and the `.lazy-wait` of a screen whose code is still on its way. So every path (sign-in, the app, /admin,
 * /try, an invite, the crash screen) hides it at the right moment without having to call anything.
 */
const BLANK = '.boot, .lazy-wait';

function drawn(root: HTMLElement) {
  const first = root.firstElementChild;
  if (!first || first.matches(BLANK)) return false;
  // A wrapper whose only content is a placeholder hasn't drawn yet either.
  return !(first.childElementCount === 1 && first.firstElementChild!.matches(BLANK) && !first.textContent?.trim());
}

/**
 * The app's stylesheets come as <link rel="preload" as="style" data-s2g-css> (vite.config.ts stylesWithoutBlocking), so
 * they download from the start without holding up the opening screen. This turns each into a stylesheet right where it
 * stands (the order of the cascade stays the same, and v2's layers, added later, still come after) and resolves when
 * all have loaded or failed: the app draws only once its styles are in.
 */
export function applyStyles(): Promise<void> {
  const waits = [...document.querySelectorAll<HTMLLinkElement>('link[data-s2g-css]')].map((pre) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    if (pre.hasAttribute('crossorigin')) css.setAttribute('crossorigin', pre.getAttribute('crossorigin') ?? '');
    // The address exactly as written ("/assets/…"): Vite checks link[href="…"] before adding a style a lazy screen
    // needs, and a full address there would make it add a second copy, after v2's layers.
    css.setAttribute('href', pre.getAttribute('href')!);
    const done = new Promise<void>((ok) => {
      css.onload = css.onerror = () => ok();
    });
    pre.replaceWith(css);
    return done;
  });
  return Promise.all(waits).then(() => {});
}

/**
 * Started as this module loads. src/main.tsx imports this file before anything else, so the stylesheets are in place
 * before any other module asks Vite for a lazy screen (Root.tsx starts the app's download as it loads): Vite looks at
 * the page's stylesheets when asked, and would otherwise add second copies of these.
 */
export const appStyles: Promise<void> = typeof document === 'undefined' ? Promise.resolve() : applyStyles();

export function startSplash() {
  const splash = document.getElementById('splash');
  const root = document.getElementById('root');
  if (!splash || !root) return;
  let done = false;
  const hide = () => {
    if (done) return;
    done = true;
    watch.disconnect();
    // One frame later, so the app's first frame is painted underneath before the fade starts.
    requestAnimationFrame(() => {
      splash.classList.add('is-leaving');
      const remove = () => splash.remove();
      splash.addEventListener('animationend', remove, { once: true });
      setTimeout(remove, 400); // a background tab pauses animations: it still goes
    });
  };
  const watch = new MutationObserver(() => drawn(root) && hide());
  watch.observe(root, { childList: true, subtree: true });
  if (drawn(root)) hide();
}
