// The mobile audit crawler: opens one app at each screen size, taps every safe control it can see, and saves a
// screenshot plus measurements of every state it reaches (overlaps, touching items, small tap targets, clipped text,
// sideways scroll, things hidden under the bar, console errors).
// Usage: node scripts/mobile-audit.mjs <app path, e.g. /mail> <out dir> [max taps per size]
// Needs the dev servers running (localhost:5173) and Microsoft Edge. Signs in with the demo seed account.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [route = '/home', out = 'audit/mobile', maxArg = '45'] = process.argv.slice(2);
const MAX = Number(maxArg);
const BASE = 'http://localhost:5173';
const app = route.replace(/\W+/g, '') || 'root';
const dir = join(out, app);
mkdirSync(dir, { recursive: true });
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : readFileSync('.env.example', 'utf8');
const PASSWORD = /SEED_PASSWORD=(.*)/.exec(env)?.[1]?.trim() || /SEED_PASSWORD=(.*)/.exec(readFileSync('.env.example', 'utf8'))[1].trim();

const SIZES = [
  { id: 'phone375', width: 375, height: 812, mobile: true },
  { id: 'phone375dark', width: 375, height: 812, mobile: true, dark: true },
  { id: 'phone430', width: 430, height: 932, mobile: true },
  { id: 'ipad768', width: 768, height: 1024, mobile: true },
  { id: 'ipad1024', width: 1024, height: 768, mobile: true },
];
// Never tap anything that changes or loses data, or leaves the app.
const RISKY = /delete|remove|sign out|log ?out|reset|leave|trash|send|discard|clear|revoke|rotate|cancel subscription|archive|empty|disconnect|hide demo|^hide$/i;

// Runs in the page: measures the screen and returns problems.
function measure() {
  const vw = innerWidth, vh = innerHeight;
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return null;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.opacity === '0' || s.display === 'none') return null;
    return r;
  };
  const name = (el) => (el.getAttribute('aria-label') || el.innerText || el.title || el.className || el.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 60);
  const path = (el) => { const p = []; for (let e = el; e && e !== document.body && p.length < 4; e = e.parentElement) p.unshift(e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')); return p.join(' > '); };
  const issues = [];
  if (document.documentElement.scrollWidth > vw + 1) issues.push({ kind: 'sideways-scroll', detail: `page is ${document.documentElement.scrollWidth}px wide at ${vw}px` });
  const inter = [...document.querySelectorAll('button, a[href], [role=button], [role=tab], input, textarea, [contenteditable=true]')];
  for (const el of inter) {
    const r = vis(el);
    if (!r) continue;
    if (vw < 768 && (r.width < 40 || r.height < 40) && !el.closest('.ProseMirror, .rich, [contenteditable]') && el.tagName !== 'INPUT') issues.push({ kind: 'small-tap-target', detail: `${Math.round(r.width)}x${Math.round(r.height)} "${name(el)}"`, where: path(el) });
    if (r.right > vw + 1 || r.left < -1) issues.push({ kind: 'off-screen', detail: `"${name(el)}" runs past the edge`, where: path(el) });
    const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(cx, cy);
    if (top && top !== el && !el.contains(top) && !top.contains(el)) {
      const cover = top.closest('.tabbar, .fab, .mobile-top, .toast, .demo-banner, [class*=banner]');
      if (cover && !cover.contains(el)) issues.push({ kind: 'covered', detail: `"${name(el)}" sits under ${cover.className.split(' ')[0]}`, where: path(el) });
    }
  }
  // Neighbours in a row that touch: avatar against its name, icon against its label.
  for (const parent of document.querySelectorAll('*')) {
    const kids = [...parent.children].filter((k) => vis(k));
    if (kids.length < 2 || kids.length > 12) continue;
    const s = getComputedStyle(parent);
    if (!/flex|grid/.test(s.display)) continue;
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect();
      const sameRow = Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < Math.min(a.height, b.height) / 2;
      if (!sameRow) continue;
      const gap = b.left - a.right;
      const hasText = (kids[i].innerText || '').trim() || (kids[i - 1].innerText || '').trim();
      const hit = (k) => k.matches('button, a, [role=button], [role=tab], label');
      if (gap > -1 && gap < 4 && hasText && a.width > 8 && b.width > 8 && !(hit(kids[i - 1]) && hit(kids[i]))) issues.push({ kind: 'touching', detail: `${Math.round(gap)}px between "${name(kids[i - 1])}" and "${name(kids[i])}"`, where: path(parent) });
      const floats = (k) => /fixed|absolute|sticky/.test(getComputedStyle(k).position);
      if (gap < -2 && b.width > 8 && !floats(kids[i - 1]) && !floats(kids[i])) issues.push({ kind: 'overlap', detail: `"${name(kids[i - 1])}" overlaps "${name(kids[i])}" by ${Math.round(-gap)}px`, where: path(parent) });
    }
  }
  // Content jammed under the top bar (needs at least 8 px of air).
  const bar = document.querySelector('.mobile-top');
  const br = bar && vis(bar);
  if (br) {
    const below = [...document.querySelectorAll('.main *')].filter((el) => !bar.contains(el) && el.children.length <= 8).map((el) => [el, vis(el)]).filter(([, r]) => r && r.top >= br.bottom - 1 && r.top < br.bottom + 40 && r.height > 20 && r.width < vw - 4);
    const first = below.sort((x, y) => x[1].top - y[1].top)[0];
    if (first) { const s2 = getComputedStyle(first[0]); const boxed = s2.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(s2.borderTopWidth) > 0; if (boxed && first[1].top - br.bottom < 8) issues.push({ kind: 'tight-under-header', detail: Math.round(first[1].top - br.bottom) + 'px between the top bar and "' + name(first[0]) + '"', where: path(first[0]) }); }
  }
  // Text cut off without an ellipsis.
  for (const el of document.querySelectorAll('h1,h2,h3,h4,p,span,strong,small,label,button,a,div')) {
    if (el.children.length) continue;
    const r = vis(el);
    if (!r || !(el.innerText || '').trim()) continue;
    const s = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== 'ellipsis' && /hidden|clip/.test(s.overflow + s.overflowX)) issues.push({ kind: 'clipped-text', detail: `"${name(el)}"`, where: path(el) });
    if (parseFloat(s.fontSize) < 12 && vw < 768) issues.push({ kind: 'tiny-text', detail: `${s.fontSize} "${name(el)}"`, where: path(el) });
  }
  const seen = new Set();
  return issues.filter((i) => { const k = i.kind + i.detail; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 80);
}

// Runs in the page: the safe controls on screen, each with a stable key.
function controls(RISKY_SRC) {
  const risky = new RegExp(RISKY_SRC, 'i');
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('button, a[href], [role=button], [role=tab], [role=menuitem]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || el.disabled) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.pointerEvents === 'none') continue;
    const label = (el.getAttribute('aria-label') || el.innerText || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    if (!label || risky.test(label)) continue;
    if (el.closest('.rail, .app-rail, .ws-switch, [data-tile]') || ((el.getAttribute('href') || '') && /^\/(home|mail|chat|tasks|projects|teams|tables|calendar|notes|drive|meet|vault)\b/.test(el.getAttribute('href')) && !el.getAttribute('href').startsWith(location.pathname.split('/').slice(0, 2).join('/')))) continue;
    const href = el.getAttribute('href');
    if (href && /^https?:/.test(href) && !href.startsWith(location.origin)) continue;
    const key = label + '|' + Math.round(r.top / 40);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label, x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
  return out;
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { app: route, sizes: [] };
const auth = join(out, '.auth.json');
for (const size of SIZES) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    isMobile: size.mobile,
    hasTouch: size.mobile,
    colorScheme: size.dark ? 'dark' : 'light',
    reducedMotion: 'reduce',
    ...(existsSync(auth) ? { storageState: auth } : {}),
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  if (!existsSync(auth)) {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    const ok = await page.evaluate(async (pw) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'james@demo.sprint2go.com', password: pw }) })).status, PASSWORD);
    if (ok !== 200) throw new Error('login failed: ' + ok);
    await ctx.storageState({ path: auth });
  }
  const open = async () => {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
  };
  const shot = async (name) => {
    const file = `${size.id}__${name}.png`;
    await page.screenshot({ path: join(dir, file) });
    return file;
  };
  const sizeRep = { size: size.id, states: [] };
  await open();
  sizeRep.states.push({ state: 'start', url: page.url(), shot: await shot('00-start'), issues: await page.evaluate(measure) });
  // Phones and the first size get every tap; the others get the start screen and the first taps only.
  const limit = size.id === 'phone375' ? MAX : size.id === 'phone375dark' ? 0 : Math.min(12, MAX);
  const list = (await page.evaluate(controls, RISKY.source)).slice(0, limit);
  let n = 0;
  for (const c of list) {
    n++;
    try {
      await open();
      const now = await page.evaluate(controls, RISKY.source);
      const same = now.find((x) => x.key === c.key) ?? now.find((x) => x.label === c.label);
      if (!same) continue;
      const before = await page.evaluate(() => document.body.innerHTML.length + location.href);
      await page.mouse.click(same.x, same.y);
      await page.waitForTimeout(700);
      const after = await page.evaluate(() => document.body.innerHTML.length + location.href);
      if (after === before) {
        sizeRep.states.push({ state: `tap "${c.label}"`, nothing: true });
        continue;
      }
      sizeRep.states.push({ state: `tap "${c.label}"`, url: page.url(), shot: await shot(String(n).padStart(2, '0') + '-' + c.label.replace(/[^a-z0-9]+/gi, '-').slice(0, 30)), issues: await page.evaluate(measure) });
    } catch (e) {
      sizeRep.states.push({ state: `tap "${c.label}"`, error: String(e).slice(0, 160) });
    }
  }
  sizeRep.consoleErrors = [...new Set(errors)].slice(0, 20);
  report.sizes.push(sizeRep);
  await ctx.close();
}
await browser.close();
writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));
const total = report.sizes.reduce((a, s) => a + s.states.length, 0);
console.log(`${route}: ${total} states, ${report.sizes.reduce((a, s) => a + s.states.reduce((b, x) => b + (x.issues?.length ?? 0), 0), 0)} measured issues`);
