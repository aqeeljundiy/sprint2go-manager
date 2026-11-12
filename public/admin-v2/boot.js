// Loaded by index.html in <head>, before anything is drawn (the server's CSP allows no inline scripts).
  // The operator console v2 (/admin/v2) is built on aqeel-admin-kit: its stylesheet, theme and script load here,
  // only on those addresses, before the page is drawn (so the sidebar never flashes half-built).
  var p = location.pathname;
  if (p === '/admin/v2' || p.indexOf('/admin/v2/') === 0) {
    // Its own app icon and manifest (made with the kit's make-icons.mjs from sprint2go's mark), so it installs
    // as "Operators" and opens on /admin/v2; the app's own icon tags above make way.
    document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"], meta[name="theme-color"], meta[name="apple-mobile-web-app-title"]').forEach(function (n) { n.remove(); });
    document.write('<link rel="icon" href="/admin-v2/app-icons/favicon.ico" sizes="48x48"><link rel="icon" href="/admin-v2/app-icons/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/admin-v2/app-icons/apple-touch-icon.png"><link rel="manifest" href="/admin-v2/app-icons/site.webmanifest"><meta name="theme-color" content="#ffffff"><meta name="apple-mobile-web-app-title" content="Operators"><meta name="mobile-web-app-capable" content="yes">');
      document.write('<link rel="stylesheet" href="/admin-v2/kit/admin-kit.css"><link rel="stylesheet" href="/admin-v2/admin-theme.css"><scr' + 'ipt defer blocking="render" src="/admin-v2/kit/admin-kit.js"></scr' + 'ipt>');
  }
  // The customer app and client portal v2 (/v2): since 13 Nov 2026 v1's own screens, icon and manifest with the v2
  // layer on top (src/surface.ts, src/v2.css), so no kit here any more. The class goes on before the first paint;
  // digits come from Google Sans Flex (a digits-only download), the text stays Plus Jakarta Sans. v1 at / is unchanged.
  // (The kit build's files in /app-v2 stay in the repo, unused.)
  if (p === '/v2' || p.indexOf('/v2/') === 0) {
    document.documentElement.classList.add('s2v2');
    document.write('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400..800&text=0123456789&display=swap">');
  }
