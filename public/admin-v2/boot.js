// Loaded by index.html in <head>, before anything is drawn (the server's CSP allows no inline scripts).
  // The operator console v2 (/admin/v2): since 13 Nov 2026 v1's own console with the v2 layer on top (src/surface.ts,
  // src/v2.css), no kit any more. It keeps its own app icon and manifest (installs as "Operators", opens on /admin/v2).
  var p = location.pathname;
  if (p === '/admin/v2' || p.indexOf('/admin/v2/') === 0) {
    document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"], meta[name="apple-mobile-web-app-title"]').forEach(function (n) { n.remove(); });
    document.write('<link rel="icon" href="/admin-v2/app-icons/favicon.ico" sizes="48x48"><link rel="icon" href="/admin-v2/app-icons/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/admin-v2/app-icons/apple-touch-icon.png"><link rel="manifest" href="/admin-v2/app-icons/site.webmanifest"><meta name="apple-mobile-web-app-title" content="Operators">');
    document.documentElement.classList.add('s2v2');
    document.write('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400..800&text=0123456789&display=swap">');
  }
  // The customer app and client portal v2 (/v2): since 13 Nov 2026 v1's own screens, icon and manifest with the v2
  // layer on top (src/surface.ts, src/v2.css), so no kit here any more. The class goes on before the first paint;
  // digits come from Google Sans Flex (a digits-only download), the text stays Plus Jakarta Sans. v1 at / is unchanged.
  // (The kit build's files in /app-v2 stay in the repo, unused.)
  if (p === '/v2' || p.indexOf('/v2/') === 0) {
    document.documentElement.classList.add('s2v2');
    document.write('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400..800&text=0123456789&display=swap">');
  }
