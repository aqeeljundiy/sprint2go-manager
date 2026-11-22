// Loaded by index.html with `defer` (the server's CSP allows no inline scripts): it runs once the page is read, before
// the app's own script, so the v2 class is on <html> before React draws anything. Nothing here holds up the first paint;
// the opening screen (#splash in index.html) is already showing.
// Since 15 Nov 2026 v2 is the main version: the app at / and the console at /admin. v1 is kept as the backup at /v1 and
// /admin/v1 and gets none of the v2 parts (src/surface.ts decides the same way). Old /v2 and /admin/v2 links are sent to
// the same page without the /v2 by the server; this file also handles them when it isn't in front (vite dev).
(function () {
  var head = document.head;
  function add(tag, attrs) {
    var n = document.createElement(tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    head.appendChild(n);
  }
  // The opening screen speaks the device's language: the same choice as deviceLang() and browserLang() in src/i18n
  // (the saved pick, else the first Indonesian or English entry in the browser's list). setLang() takes <html lang> over.
  function browserLang() {
    var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < list.length; i++) {
      var code = String(list[i]).toLowerCase();
      if (code.indexOf('id') === 0 || code.indexOf('in') === 0) return 'id';
      if (code.indexOf('en') === 0) return 'en';
    }
    return 'en';
  }
  var lang = 'en';
  try {
    var saved = localStorage.getItem('s2g-lang');
    lang = saved === 'id' || saved === 'en' ? saved : browserLang();
  } catch (e) {
    lang = browserLang(); // storage blocked
  }
  if (lang === 'id') {
    document.documentElement.lang = 'id';
    // The app waits for its Indonesian words before drawing: start them now, next to the app's own script, instead of
    // after it (vite.config.ts earlyDownloads puts their address on the page; there is none in development).
    var words = document.querySelector('meta[name="s2g-words-id"]');
    if (words) add('link', { rel: 'modulepreload', crossorigin: '', href: words.getAttribute('content') });
  }
  // The app itself (mail, chat, tasks…), on the addresses where someone signed in lands: started now instead of after
  // the app's script has run. The same rule as Root.tsx, which asks for it there; sign-in, sign-up, the console, the
  // consent screen and invites never download it up front.
  var appFiles = document.querySelector('meta[name="s2g-app"]');
  if (appFiles && !/^\/(signin|signup|admin|oauth)(\/|$)/.test(location.pathname) && !/[?&]invite=/.test(location.search))
    appFiles
      .getAttribute('content')
      .split(' ')
      .forEach(function (href) {
        if (/\.css$/.test(href)) add('link', { rel: 'preload', as: 'style', crossorigin: '', href: href });
        else add('link', { rel: 'modulepreload', crossorigin: '', href: href });
      });
  // The text face for every version. Added from here, a stylesheet never blocks the first paint (display=swap).
  add('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap' });

  var p = location.pathname;
  if (p === '/v2' || p.indexOf('/v2/') === 0) p = p.slice(3) || '/';
  else if (p === '/admin/v2' || p.indexOf('/admin/v2/') === 0) p = '/admin' + p.slice(9);
  var v1 = p === '/v1' || p.indexOf('/v1/') === 0 || p === '/admin/v1' || p.indexOf('/admin/v1/') === 0;
  if (v1) return;
  // v2's styles (src/main.tsx loads them in order): downloading from now, so they're in when the app's script asks.
  var v2Css = document.querySelector('meta[name="s2g-v2"]');
  if (v2Css)
    v2Css
      .getAttribute('content')
      .split(' ')
      .forEach(function (href) {
        add('link', { rel: 'preload', as: 'style', crossorigin: '', href: href });
      });
  var digits = { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400..800&text=0123456789&display=swap' };
  function dropIcons(sel) {
    document.querySelectorAll(sel).forEach(function (n) {
      n.remove();
    });
  }
  // The operator console v2 (/admin): v1's own console with the v2 layer on top (src/surface.ts, src/v2.css). It keeps
  // its own app icon and manifest (installs as "Operators", opens on /admin).
  if (p === '/admin' || p.indexOf('/admin/') === 0) {
    dropIcons('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"], meta[name="apple-mobile-web-app-title"]');
    add('link', { rel: 'icon', href: '/admin-v2/app-icons/favicon.ico', sizes: '48x48' });
    add('link', { rel: 'icon', href: '/admin-v2/app-icons/favicon.svg', type: 'image/svg+xml' });
    add('link', { rel: 'apple-touch-icon', href: '/admin-v2/app-icons/apple-touch-icon.png' });
    add('link', { rel: 'manifest', href: '/admin-v2/app-icons/site.webmanifest' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'Operators' });
    document.documentElement.classList.add('s2v2', 's2v2-admin');
    add('link', digits);
    return;
  }
  // The customer app and client portal v2 (every other app address): v1's own screens with the v2 layer on top. Digits
  // come from Google Sans Flex (a digits-only download), the text stays Plus Jakarta Sans. The rounded v2 icon replaces
  // the tab icons; the install manifest stays the main one (/manifest.webmanifest, start and scope /), so installed apps
  // and their shortcuts keep working. (The kit build's files in /app-v2 stay in the repo, unused.)
  dropIcons('link[rel~="icon"], link[rel="apple-touch-icon"]');
  add('link', { rel: 'icon', href: '/v2-icons/favicon.ico', sizes: '48x48' });
  // Not /v2-icons/favicon.svg: that one wraps a 512 px picture (260 KB) and downloaded while the app was opening.
  add('link', { rel: 'icon', href: '/v2-icons/favicon-32.png', type: 'image/png', sizes: '32x32' });
  add('link', { rel: 'apple-touch-icon', href: '/v2-icons/apple-touch-icon.png' });
  document.documentElement.classList.add('s2v2');
  add('link', digits);
})();
