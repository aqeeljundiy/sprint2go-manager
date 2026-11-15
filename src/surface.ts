// Which surface this page is: v2 (the main version since 15 Nov 2026: the app at /, the console at /admin) or v1 (the
// backup: the app at /v1, the console at /admin/v1). v2 is v1's own screens and components with a layer on top
// (docs/v1-checklist.md): motion, friendlier words, the week's fixes and the tidy scale in src/v2.css. Everything v2
// adds checks `v2` here, so v1 under /v1 and /admin/v1 behaves exactly as it did at / and /admin before the switch.
// Old /v2 and /admin/v2 links go to the same page without the /v2 (server/index.ts, and redirectOldV2 below).
// No imports: tryOut.ts and the boot code read it before anything else.

/** /v2/mail -> /mail, /admin/v2/tickets -> /admin/tickets (null when the address has no old /v2 in it). */
export function withoutV2(path: string): string | null {
  if (/^\/v2(\/|$)/.test(path)) return path.replace(/^\/v2/, '') || '/';
  if (/^\/admin\/v2(\/|$)/.test(path)) return path.replace(/^\/admin\/v2/, '/admin');
  return null;
}
/** /v1/admin… is the v1 console too: its address is /admin/v1… */
export function v1AdminAlias(path: string): string | null {
  return /^\/v1\/admin(\/|$)/.test(path) ? path.replace(/^\/v1\/admin/, '/admin/v1') : null;
}

// Without our server in front (vite dev, a static host), an old /v2 link still lands on the right page.
if (typeof location !== 'undefined' && typeof history !== 'undefined' && typeof document !== 'undefined' && document.documentElement.dataset.page !== 'landing') {
  const to = withoutV2(location.pathname) ?? v1AdminAlias(location.pathname);
  if (to) history.replaceState(history.state, '', `${to}${location.search}${location.hash}`);
}

const path = typeof location !== 'undefined' ? location.pathname : '/';
/** The v1 console, kept as the backup at /admin/v1. */
export const adminV1 = /^\/admin\/v1(\/|$)/.test(path);
/** The v1 team app and client portal, kept as the backup at /v1. */
export const teamV1 = /^\/v1(\/|$)/.test(path);
/** Either v1 surface (the backup). */
export const v1 = teamV1 || adminV1;
const admin = /^\/admin(\/|$)/.test(path);
/** The marketing landing page (landing.html, <html data-page="landing">) is neither: it stays as it is, light only. */
const landing = typeof document !== 'undefined' && document.documentElement.dataset.page === 'landing';
/** The operator console v2, at /admin. */
export const adminV2 = admin && !adminV1;
/** The customer app and client portal v2: every app address that isn't the console, the landing page or the v1 backup. */
export const teamV2 = !admin && !teamV1 && !landing;
/** Either v2 surface. */
export const v2 = teamV2 || adminV2;
/** Where "the app" is from here: / on v2, /v1 on v1. */
export const appHome = teamV1 || adminV1 ? '/v1' : '/';
/** Where the console is from here. */
export const adminHome = v1 ? '/admin/v1' : '/admin';
/** A console address written the plain way (/admin/tickets) for this surface (/admin/v1/tickets on v1). */
export const adminPath = (to: string) => (adminV1 && /^\/admin(\/|$)/.test(to) && !/^\/admin\/v1(\/|$)/.test(to) ? to.replace(/^\/admin/, '/admin/v1') : to);

// The v2 layer's styles all sit under html.s2v2 (html.s2v2-admin on the console), so they never touch v1.
if (v2 && typeof document !== 'undefined') {
  document.documentElement.classList.add('s2v2');
  if (adminV2) document.documentElement.classList.add('s2v2-admin');
  // Going from one page to another fades instead of snapping (full page loads; inside the app each screen already
  // rises in). Only on v2, so v1's pages stay as they were; reduced motion turns it off.
  const vt = document.createElement('style');
  vt.textContent = '@view-transition{navigation:auto}::view-transition-old(root){animation-duration:180ms}::view-transition-new(root){animation-duration:240ms}@media (prefers-reduced-motion:reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none}}';
  document.head.appendChild(vt);
}
