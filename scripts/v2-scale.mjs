#!/usr/bin/env node
// The v2 tidy scale (docs/v1-checklist.md, goal 1): v1's own long tail of text sizes, weights, corners and spacings
// folded onto one scale, for /v2 and /admin/v2 only, without touching v1's styles.
//
//   node scripts/v2-scale.mjs          writes src/v2-scale.css (commit it; main.tsx loads it after v2.css)
//   node scripts/v2-scale.mjs --check  fails when src/v2-scale.css is out of date (run after changing any v1 CSS)
//
// How: every rule in v1's desktop CSS that sets one of these properties is repeated under html.s2v2 with the value
// folded onto the scale. Every such declaration is repeated (also the ones already on the scale), so the order and
// specificity between v1's own rules stay exactly as they were (:where(:root.s2v2) adds no weight; the copies load
// after v1's CSS and before src/v2.css and the phone layer). Not folded: the phone layer (src/mobile is not copied;
// max-width blocks are copied unchanged: already on the system and checked by ui-tokens-check), the landing page, the
// old kit builds, var()/calc()/clamp() values and em/rem/% sizes.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const OUT = join(SRC, 'v2-scale.css');

// v1's CSS in the order main.tsx loads it, then the files components import themselves.
const ORDER = ['tokens', 'styles', 'calendar', 'shell', 'brand', 'apps', 'ui', 'round2', 'tables', 'teams', 'polish', 'tasks', 'home', 'mail', 'mailExtras', 'mailSorting', 'admin', 'notify', 'security', 'jobs', 'notes', 'unlimited', 'system', 'appv2'].map((n) => `${n}.css`);
const EXTRA = ['connector.css', 'mailFiles.css', 'phoneMailApps.css', 'settingsSearch.css', 'components/chat/chat.css', 'components/imports/imports.css', 'components/mail/organize.css', 'components/mail/teams.css', 'components/meetExtras.css', 'components/projectPulse.css', 'components/ui/personCard.css', 'components/vault.css'];
const FILES = [...ORDER, ...EXTRA].filter((f) => existsSync(join(SRC, f)));

// The scale: tokens.css (type 24/17/15/13/12, radii 10/16/pill/round, 4/8 spacing), plus 14 for desktop body text and
// v1's display sizes. A value folds to the nearest step.
const SIZES = [12, 13, 14, 15, 17, 20, 24, 28, 32, 36, 44];
const RADII = [6, 8, 10, 12, 16, 24]; // rounded up: a corner never gets smaller, so circles and pills stay round
const SPACE = [4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64];
const nearest = (v, list) => list.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), list[0]);

const px = (fold) => (value) =>
  /var\(|calc\(|clamp\(|min\(|max\(|env\(/.test(value)
    ? null
    : value.replace(/(-?)(\d*\.?\d+)px\b/g, (m, sign, n) => {
        const f = fold(Number(n));
        return f === null ? m : `${f === 0 ? '' : sign}${f}px`;
      });
const FOLD = {
  'font-size': px((n) => (n < 11 ? null : n > 48 ? null : nearest(n, SIZES))),
  'font-weight': (v) => ({ 500: '500', 550: '600', 650: '600', 750: '700', 900: '800', bold: '700' })[v.trim()] ?? (/^\d+$/.test(v.trim()) ? v.trim() : null),
  'border-radius': (v) => (/var\(|calc\(/.test(v) ? null : v.replace(/(\d*\.?\d+)px\b/g, (m, n) => (Number(n) >= 40 ? '999px' : Number(n) === 0 ? '0' : `${RADII.find((r) => r >= Number(n)) ?? Number(n)}px`))),
  // spacing: hairlines (1, 2 px) stay; the rest folds onto the 4/8 scale
  ...Object.fromEntries(['padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'padding-inline', 'padding-block', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'margin-inline', 'margin-block', 'gap', 'row-gap', 'column-gap'].map((p) => [p, px((n) => (n <= 2 || n > 64 ? null : nearest(n, SPACE)))])),
};
for (const c of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) FOLD[`border-${c}-radius`] = FOLD['border-radius'];

const phoneMedia = (node) => {
  for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && p.name === 'media' && /max-width:\s*(767|599|359|480|540|640|700|720)px/.test(p.params)) return true;
  return false;
};
const scope = (sel) =>
  sel
    .split(/,(?![^(]*\))/)
    .map((s) => {
      s = s.trim();
      // :where() adds no weight, so each copy has exactly its v1 rule's specificity and wins only by coming later
      if (/^:root\b/.test(s)) return s.replace(/^:root/, ':root:where(.s2v2)');
      if (/^html\b/.test(s)) return s.replace(/^html/, 'html:where(.s2v2)');
      return `:where(:root.s2v2) ${s}`;
    })
    .join(',\n');

const out = postcss.root();
let rules = 0, folded = 0;
for (const f of FILES) {
  const css = postcss.parse(readFileSync(join(SRC, f), 'utf8'), { from: f });
  css.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes/.test(rule.parent.name)) return;
    const phone = phoneMedia(rule); // copied unchanged, so it still comes after the desktop rule it overrides
    const decls = rule.nodes.filter((d) => d.type === 'decl' && FOLD[d.prop]);
    if (!decls.length) return;
    const copy = postcss.rule({ selector: scope(rule.selector) });
    for (const d of decls) {
      const v = phone ? d.value : FOLD[d.prop](d.value);
      if (v === null) continue;
      if (v !== d.value) folded++;
      copy.append(postcss.decl({ prop: d.prop, value: v, important: d.important }));
    }
    if (!copy.nodes.length) return;
    rules++;
    // keep the media / supports / container wrapper the rule sat in
    let node = copy;
    for (let p = rule.parent; p && p.type === 'atrule'; p = p.parent) node = postcss.atRule({ name: p.name, params: p.params }).append(node);
    out.append(node);
  });
}
const head = `/* GENERATED by scripts/v2-scale.mjs from v1's own CSS: do not edit by hand. ${rules} rules, ${folded} values folded onto the
   v2 scale (text ${SIZES.join('/')}, corners ${RADII.join('/')}/pill/round, spacing ${SPACE.join('/')}), for html.s2v2 (/v2,
   /admin/v2) only. Phone layer, landing page and var()/calc() values are left as v1 has them. */\n`;
const text = head + out.toString() + '\n';
if (process.argv.includes('--check')) {
  if (!existsSync(OUT) || readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') !== text) {
    console.error(`${relative(ROOT, OUT)} is out of date: run node scripts/v2-scale.mjs`);
    process.exit(1);
  }
  console.log('v2 scale up to date.');
} else {
  writeFileSync(OUT, text);
  console.log(`${relative(ROOT, OUT)}: ${rules} rules, ${folded} values folded from ${FILES.length} files.`);
}
