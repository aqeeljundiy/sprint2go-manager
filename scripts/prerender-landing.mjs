// Runs after `vite build` (npm run build): renders the landing page to HTML in English (dist/landing.html, served at /)
// and Bahasa Indonesia (dist/landing.id.html, at /id), with each language's title, link previews (Open Graph), hreflang
// and structured data. Without this the page is an empty div until its script runs, so link previews in WhatsApp,
// Slack and LinkedIn show nothing and search engines only ever see English.
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const SITE = (process.env.SITE_URL || 'https://sprint2go.com').replace(/\/$/, '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { renderToString } = await import('react-dom/server');
  const { createElement } = await import('react');
  const { Landing } = await vite.ssrLoadModule('/src/landing/Landing.tsx');
  const { STR } = await vite.ssrLoadModule('/src/landing/i18n.ts');
  const shell = readFileSync('dist/landing.html', 'utf8');

  const meta = {
    en: { url: `${SITE}/`, locale: 'en_US', title: 'sprint2go · One app for agencies and their clients', description: 'Email, chat, tasks, calendar, files, meetings and passwords for your team in one app. Free for up to 5 people.' },
    id: { url: `${SITE}/id`, locale: 'id_ID', title: 'sprint2go · Satu aplikasi untuk agensi dan kliennya', description: 'Email, chat, tugas, kalender, file, rapat dan kata sandi untuk tim Anda dalam satu aplikasi. Gratis hingga 5 orang.' },
  };

  for (const lang of ['en', 'id']) {
    const m = meta[lang];
    const faq = STR[lang].faq.items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }));
    const ld = [
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'sprint2go', url: `${SITE}/`, logo: `${SITE}/icon-512.png` },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'sprint2go',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, Windows, macOS, iOS, Android',
        url: m.url,
        inLanguage: lang,
        description: m.description,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'IDR' },
      },
      { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang, mainEntity: faq },
    ];
    const head = [
      `<link rel="canonical" href="${m.url}" />`,
      `<link rel="alternate" hreflang="en" href="${SITE}/" />`,
      `<link rel="alternate" hreflang="id" href="${SITE}/id" />`,
      `<link rel="alternate" hreflang="x-default" href="${SITE}/" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="sprint2go" />`,
      `<meta property="og:url" content="${m.url}" />`,
      `<meta property="og:title" content="${esc(m.title)}" />`,
      `<meta property="og:description" content="${esc(m.description)}" />`,
      `<meta property="og:image" content="${SITE}/icon-512.png" />`,
      `<meta property="og:locale" content="${m.locale}" />`,
      `<meta property="og:locale:alternate" content="${lang === 'en' ? meta.id.locale : meta.en.locale}" />`,
      `<meta name="twitter:card" content="summary" />`,
      `<meta name="twitter:title" content="${esc(m.title)}" />`,
      `<meta name="twitter:description" content="${esc(m.description)}" />`,
      `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
    ].join('\n    ');
    const body = renderToString(createElement(Landing, { initialLang: lang }));
    const html = shell
      .replace(/<html lang="[^"]*"/, `<html lang="${lang}"`)
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(m.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(m.description)}" />`)
      .replace('</head>', `    ${head}\n  </head>`)
      .replace('<div id="landing"></div>', `<div id="landing">${body}</div>`);
    if (!html.includes('og:title') || !html.includes('ln-hero')) throw new Error(`Prerender failed for ${lang}`);
    writeFileSync(lang === 'en' ? 'dist/landing.html' : 'dist/landing.id.html', html);
    console.log(`Landing prerendered (${lang}): ${Math.round(html.length / 1024)} KB`);
  }
} finally {
  await vite.close();
}
