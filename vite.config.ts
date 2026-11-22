import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * The service worker (src/sw.js) goes out as /sw.js, stamped with this build: a new build is a new worker, which
 * takes over at once, so a deploy reaches installed phones without anyone reinstalling.
 */
function serviceWorker(): Plugin {
  const source = (build: string) => readFileSync('src/sw.js', 'utf8').replace('__BUILD__', build);
  return {
    name: 's2g-service-worker',
    generateBundle(_options, bundle) {
      const build = createHash('sha256').update(Object.keys(bundle).sort().join('\n')).update(readFileSync('src/sw.js')).update(readFileSync('public/offline.html')).update(readFileSync('public/offline.js')).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: source(build) });
    },
    // In development the worker isn't registered by itself; this is here for turning notifications on to try them.
    configureServer(server) {
      server.middlewares.use('/sw.js', (_req, res) => {
        res.setHeader('content-type', 'text/javascript');
        res.end(source('dev'));
      });
      // Our work board (public/backlog) at /backlog, like the server does.
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/backlog' && req.url !== '/backlog/') return next();
        res.setHeader('content-type', 'text/html');
        res.end(readFileSync('public/backlog/index.html'));
      });
    },
  };
}

/**
 * Two downloads the app needs before it draws but only asks for once its own script has run: the Indonesian words
 * (src/i18n/id, for devices in Indonesian) and the app itself (src/App.tsx, split off so the sign-in page doesn't wait
 * for it; Root.tsx loads it). This puts their addresses on the page (<meta name="s2g-words-id">, <meta name="s2g-app">)
 * so public/admin-v2/boot.js can start them at the same time as the app's script, and only when they'll be needed.
 */
function earlyDownloads(): Plugin {
  return {
    name: 's2g-early-downloads',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle || !html.includes('id="root"')) return html;
        const chunks = Object.values(ctx.bundle).filter((c) => c.type === 'chunk');
        const entry = (path: string) => chunks.find((c) => c.facadeModuleId?.replace(/\\/g, '/').endsWith(path));
        const tags: { tag: string; attrs: Record<string, string>; injectTo: 'head-prepend' }[] = [];
        const words = entry('/src/i18n/id/index.ts');
        if (words) tags.push({ tag: 'meta', attrs: { name: 's2g-words-id', content: `/${words.fileName}` }, injectTo: 'head-prepend' });
        const app = entry('/src/App.tsx');
        if (app) {
          // The app's chunk, every chunk it imports (not those the page loads anyway) and their styles.
          const onPage = new Set<string>();
          const page = (name: string) => {
            const c = ctx.bundle![name];
            if (!c || c.type !== 'chunk' || onPage.has(name)) return;
            onPage.add(name);
            c.imports.forEach(page);
          };
          if (ctx.chunk) page(ctx.chunk.fileName); // this page's own script and everything it imports up front
          const files = new Set<string>();
          const walk = (name: string) => {
            const c = ctx.bundle![name];
            if (!c || c.type !== 'chunk' || files.has(name) || onPage.has(name)) return;
            files.add(name);
            c.viteMetadata?.importedCss.forEach((css) => files.add(css));
            c.imports.forEach(walk);
          };
          walk(app.fileName);
          // The app's styles must stay in the main stylesheet (src/Root.tsx imports them where App's import used to be):
          // styles that came with its own download would land after v2's layers and change the cascade.
          const ownStyles = [...files].filter((f) => f.endsWith('.css'));
          if (ownStyles.length)
            throw new Error(`src/App.tsx brought its own styles (${ownStyles.join(', ')}). Import the .css files they come from in src/Root.tsx, next to the others there, so they stay in the main stylesheet.`);
          tags.push({ tag: 'meta', attrs: { name: 's2g-app', content: [...files].map((f) => `/${f}`).join(' ') }, injectTo: 'head-prepend' });
        }
        // v2's three layers of styles (src/main.tsx v2Styles), for every v2 address.
        // (Style-only imports leave no script chunk behind: found by the file each style was built from.)
        const assets = Object.values(ctx.bundle).filter((a) => a.type === 'asset');
        const v2 = ['src/v2-scale.css', 'src/v2.css', 'src/v2-flex.css'].flatMap((path) => assets.find((a) => a.originalFileNames?.some((n) => n.replace(/\\/g, '/').endsWith(path)))?.fileName ?? []);
        if (v2.length) tags.push({ tag: 'meta', attrs: { name: 's2g-v2', content: v2.map((f) => `/${f}`).join(' ') }, injectTo: 'head-prepend' });
        return { html, tags };
      },
    },
  };
}

/**
 * The app's stylesheets download at once but don't hold up the first paint: Vite's <link rel="stylesheet"> in <head>
 * would keep the opening screen (#splash) from showing until about 150 KB of styles had arrived. They become
 * <link rel="preload" as="style" data-s2g-css>; src/splash.ts turns them into stylesheets, in the same order, and the
 * app waits for them before it draws (src/main.tsx). Only the app's page, not the landing page.
 */
function stylesWithoutBlocking(): Plugin {
  return {
    name: 's2g-styles-without-blocking',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!html.includes('id="splash"')) return html;
        return html.replace(/<link rel="stylesheet"( crossorigin)? href="(\/assets\/[^"]+\.css)">/g, '<link rel="preload" as="style"$1 href="$2" data-s2g-css>');
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker(), earlyDownloads(), stylesWithoutBlocking()],
  // `npm run dev` talks to the local server (npm run server) for data, sign-in and AI (S2G_API picks another address).
  // Two pages: the app (index.html) and the public landing page (landing.html, small and fast, no app code).
  build: { rollupOptions: { input: { app: 'index.html', landing: 'landing.html' } } },
  // AI apps' addresses too (/mcp and their sign-in); /oauth/authorize stays here: it's the app's consent screen.
  server: { proxy: Object.fromEntries(['/api', '/mcp', '/oauth/token', '/oauth/register', '/oauth/revoke', '/.well-known/oauth-'].map((p) => [p, { target: process.env.S2G_API ?? 'http://127.0.0.1:8787', changeOrigin: false }])) },
});
