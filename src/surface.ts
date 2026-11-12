// Which surface this page is: v1 (the app at /, the console at /admin) or v2 (the app at /v2, the console at
// /admin/v2). Since 13 Nov 2026 v2 is v1's own screens and components with a layer on top (docs/v1-checklist.md):
// motion, friendlier words, this week's fixes and the tidy scale in src/v2.css. Everything v2 adds checks `v2` here,
// so v1 at / and /admin behaves exactly as before and stays the backup.
// No imports: tryOut.ts and the boot code read it before anything else.

const path = typeof location !== 'undefined' ? location.pathname : '/';
/** The customer app and client portal at /v2. */
export const teamV2 = /^\/v2(\/|$)/.test(path);
/** The operator console at /admin/v2. */
export const adminV2 = /^\/admin\/v2(\/|$)/.test(path);
/** Either v2 surface. */
export const v2 = teamV2 || adminV2;
/** Where "the app" is from here: /v2 on v2, / on v1. */
export const appHome = v2 ? '/v2' : '/';
/** Where the console is from here. */
export const adminHome = v2 ? '/admin/v2' : '/admin';
/** A console address written the v1 way (/admin/tickets) for this surface (/admin/v2/tickets on v2). */
export const adminPath = (to: string) => (adminV2 && /^\/admin(\/|$)/.test(to) && !/^\/admin\/v2(\/|$)/.test(to) ? to.replace(/^\/admin/, '/admin/v2') : to);

// The v2 layer's styles all sit under html.s2v2, so they never touch v1. Only the team app and portal for now:
// /admin/v2 is still the kit build until the owner approves the new Home (then it becomes v1's console + the layer).
if (teamV2 && typeof document !== 'undefined') document.documentElement.classList.add('s2v2');
