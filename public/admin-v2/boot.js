// Loaded by index.html in <head>, before anything is drawn (the server's CSP allows no inline scripts).
// Since 15 Nov 2026 v2 is the main version: the app at / and the console at /admin. v1 is kept as the backup at /v1 and
// /admin/v1 and gets none of this (src/surface.ts decides the same way). Old /v2 and /admin/v2 links are sent to the
// same page without the /v2 by the server; this file also handles them when it isn't in front (vite dev).
(function () {
  var p = location.pathname;
  if (p === '/v2' || p.indexOf('/v2/') === 0) p = p.slice(3) || '/';
  else if (p === '/admin/v2' || p.indexOf('/admin/v2/') === 0) p = '/admin' + p.slice(9);
  var v1 = p === '/v1' || p.indexOf('/v1/') === 0 || p === '/admin/v1' || p.indexOf('/admin/v1/') === 0;
  if (v1) return;
  var digits = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400..800&text=0123456789&display=swap">';
  // The operator console v2 (/admin): v1's own console with the v2 layer on top (src/surface.ts, src/v2.css). It keeps
  // its own app icon and manifest (installs as "Operators", opens on /admin).
  if (p === '/admin' || p.indexOf('/admin/') === 0) {
    document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"], meta[name="apple-mobile-web-app-title"]').forEach(function (n) { n.remove(); });
    document.write('<link rel="icon" href="/admin-v2/app-icons/favicon.ico" sizes="48x48"><link rel="icon" href="/admin-v2/app-icons/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/admin-v2/app-icons/apple-touch-icon.png"><link rel="manifest" href="/admin-v2/app-icons/site.webmanifest"><meta name="apple-mobile-web-app-title" content="Operators">');
    document.documentElement.classList.add('s2v2', 's2v2-admin');
    document.write(digits);
    return;
  }
  // The customer app and client portal v2 (every other app address): v1's own screens with the v2 layer on top. The
  // class goes on before the first paint; digits come from Google Sans Flex (a digits-only download), the text stays
  // Plus Jakarta Sans. The rounded v2 icon replaces the tab icons; the install manifest stays the main one
  // (/manifest.webmanifest, start and scope /), so installed apps and their shortcuts keep working.
  // (The kit build's files in /app-v2 stay in the repo, unused.)
  document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach(function (n) { n.remove(); });
  document.write('<link rel="icon" href="/v2-icons/favicon.ico" sizes="48x48"><link rel="icon" href="/v2-icons/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/v2-icons/apple-touch-icon.png">');
  document.documentElement.classList.add('s2v2');
  document.write(digits);
})();
