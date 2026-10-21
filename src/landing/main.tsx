import { loadCaps } from '../caps';
import { applyPricing, type PricingOverride } from '../data/pricing';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Landing } from './Landing';
import { startLang } from './i18n';
import './landing.css';

// The built page arrives already rendered (scripts/prerender-landing.mjs). When it's in the visitor's language, React
// takes over that HTML; otherwise (a saved choice of the other language) it draws the page fresh.
const root = document.getElementById('landing')!;
const render = () => {
  const lang = startLang();
  if (root.firstElementChild && document.documentElement.lang === lang) hydrateRoot(root, <Landing initialLang={lang} />);
  else createRoot(root).render(<Landing initialLang={lang} />);
};
// Prices set in the operator backend: wait briefly for them, never long.
// What the server can do (the desktop download shows only when there's a real release to download).
Promise.race([
  Promise.all([
    fetch('/api/pricing')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { pricing?: PricingOverride } | null) => applyPricing(d?.pricing)),
    loadCaps(),
  ]),
  new Promise((ok) => setTimeout(ok, 700)),
])
  .catch(() => {})
  .finally(render);
