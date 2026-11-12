// The kit frame shared by the team app and the client portal at /v2: one sidebar template drawn once, only
// aria-current moves; links inside /v2 change page without reloading, so the highlight glides.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './app.css';
import { t } from '../i18n';
import { BASE } from './ui';

const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  home: svg('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
  meetings: svg('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>'),
  tasks: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>'),
  projects: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5h8v2"/>'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  notes: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>'),
  drive: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  tables: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 4v16"/>'),
  vault: svg('<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
  people: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  requests: svg('<path d="M12 5v14M5 12h14"/>'),
  work: svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  files: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>'),
  done: svg('<path d="m5 12 5 5 9-10"/>'),
  star: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>'),
  archive: svg('<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>'),
};

export type NavLink = { id: string; label: string; icon?: string; tab?: string };
export type NavGroup = { label: string; links: NavLink[] };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The sidebar's inner HTML. `tab` marks the phone tab bar's pages (with the label shown there). */
export function sidebarHtml(o: { base: string; brand: string; top: NavLink[]; groups: NavGroup[]; foot: NavLink[]; current: string | null }) {
  const href = (id: string) => (id ? `${o.base}/${id}` : o.base);
  const a = (l: NavLink, inGroup = false) =>
    `<a href="${href(l.id)}" data-nav="${l.id}"${l.id === o.current ? ' aria-current="page"' : ''}${l.tab ? ` data-tab data-tab-label="${esc(l.tab)}"` : ''}>${l.icon && l.tab ? `<template data-tab-icon>${l.icon}</template>` : ''}${l.icon && !inGroup ? l.icon : ''}${esc(l.label)}</a>`;
  return [
    `<div slot="brand" class="s2a-brand">${o.brand}</div>`,
    ...o.top.map((l) => a(l)),
    ...o.groups.map((g) => `<ak-nav-group label="${esc(g.label)}">${g.links.map((l) => a(l, true)).join('')}</ak-nav-group>`),
    `<div class="s2a-side-foot">${o.foot.map((l) => a(l)).join('')}<button class="ak-btn ak-btn--ghost s2a-search" type="button" data-ak-open="command">${ICON.search}<span>${esc(t('Search'))}</span><kbd class="ak-kbd">Ctrl K</kbd></button></div>`,
  ].join('');
}

/** The first part after the base: which sidebar link a path belongs to. */
export const navIdOf = (path: string, base: string) => path.slice(base.length).replace(/^\//, '').split('/')[0] ?? '';

/** The current /v2 path, and go() that moves inside it without a reload. Links to other addresses load normally. */
export function useV2Path(base = BASE) {
  const [path, setPath] = useState(location.pathname);
  const go = useCallback(
    (to: string) => {
      if (!to.startsWith(base)) return location.assign(to);
      history.pushState(null, '', to);
      setPath(to.split('?')[0]);
      window.scrollTo({ top: 0 });
    },
    [base],
  );
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !(url.pathname === base || url.pathname.startsWith(base + '/'))) return;
      e.preventDefault();
      go(url.pathname + url.search);
    };
    const pop = () => setPath(location.pathname);
    document.addEventListener('click', click);
    window.addEventListener('popstate', pop);
    return () => (document.removeEventListener('click', click), window.removeEventListener('popstate', pop));
  }, [go, base]);
  return { path, go };
}

/** The kit's frame. The sidebar is drawn once; on each page only aria-current moves (and refresh() for the tab bar). */
export function Frame({ path, base, sidebar, children }: { path: string; base: string; sidebar: (current: string) => string; children: ReactNode }) {
  const side = useRef<HTMLElement & { refresh?: () => void }>(null);
  const first = useRef(path);
  const html = useMemo(() => sidebar(navIdOf(first.current, base)), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.documentElement.setAttribute('data-s2a', '');
    document.documentElement.dataset.theme = 'light'; // the kit theme is light only (kit-requests.md: dark mode)
    return () => document.documentElement.removeAttribute('data-s2a');
  }, []);
  useLayoutEffect(() => {
    const s = side.current;
    if (!s || path === first.current) return;
    const id = navIdOf(path, base);
    s.querySelectorAll<HTMLAnchorElement>('a[data-nav]').forEach((a) => (a.dataset.nav === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    try {
      s.refresh?.();
    } catch {
      /* the kit builds it on its first pass and reads aria-current itself */
    }
  }, [path, base]);
  return (
    <ak-frame data-ak-locale="id-ID" menu-label={t('Menu')}>
      <ak-sidebar ref={side} dangerouslySetInnerHTML={{ __html: html }} />
      <ak-page>{children}</ak-page>
    </ak-frame>
  );
}
