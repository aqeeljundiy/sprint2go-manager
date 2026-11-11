// The operator console's sidebar (the why review's proposed navigation, docs/admin-kit-v2-plan.md): one template,
// drawn once; only aria-current moves when the page changes.
import { t } from '../../i18n';

const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  today: svg('<path d="M4 13a8 8 0 1 1 16 0"/><path d="m12 13 4-4"/><path d="M4 17h16"/>'),
  support: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m5.6 5.6 3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>'),
  customers: svg('<path d="M3 21V7l6-4 6 4v14"/><path d="M15 11h6v10H3"/><path d="M8 9h2M8 13h2M8 17h2"/>'),
  business: svg('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>'),
  system: svg('<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>'),
  team: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>'),
  tickets: svg('<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>'),
  companies: svg('<path d="M3 21V7l6-4 6 4v14"/><path d="M15 11h6v10H3"/>'),
  more: svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  out: svg('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="m10 17-5-5 5-5M5 12h11"/>'),
};

export const BASE = '/admin/v2';
type Link = { id: string; label: string };
type Group = { label: string; icon: string; links: Link[]; tab?: { id: string; label: string; icon: string } };
/** The sections, in order. A group with one page is still a group (labels nav): Support holds Tickets and its settings. */
export const NAV = (): { top: Link & { icon: string }; groups: Group[]; foot: Link & { icon: string } } => ({
  top: { id: '', label: t('Today'), icon: ICON.today },
  groups: [
    { label: t('Support'), icon: ICON.support, links: [{ id: 'tickets', label: t('Tickets') }], tab: { id: 'tickets', label: t('Tickets'), icon: ICON.tickets } },
    { label: t('Customers'), icon: ICON.customers, links: [{ id: 'companies', label: t('Companies') }, { id: 'people', label: t('People') }], tab: { id: 'companies', label: t('Companies'), icon: ICON.companies } },
    { label: t('Business'), icon: ICON.business, links: [{ id: 'money', label: t('Money') }, { id: 'growth', label: t('Growth') }, { id: 'announcements', label: t('Announcements') }] },
    { label: t('System'), icon: ICON.system, links: [{ id: 'server', label: t('Server') }, { id: 'mail', label: t('Mail') }, { id: 'ai', label: t('AI setup') }] },
  ],
  foot: { id: 'team', label: t('Team'), icon: ICON.team },
});

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const href = (id: string) => (id ? `${BASE}/${id}` : BASE);

/** The sidebar's inner HTML. The kit builds groups, the gliding highlight and the phone tab bar from it. */
export function sidebarHtml(brand: string, current: string | null = null) {
  const n = NAV();
  const a = (l: Link, icon = '', extra = '') => `<a href="${href(l.id)}" data-nav="${l.id}"${l.id === current ? ' aria-current="page"' : ''}${extra}>${icon}${esc(l.label)}</a>`;
  return [
    `<div slot="brand" class="s2k-brand">${brand}<span class="s2k-brand__tag">${esc(t('Operators'))}</span></div>`,
    a(n.top, n.top.icon, ` data-tab data-tab-label="${esc(n.top.label)}"`),
    ...n.groups.map((g) => {
      const tabbed = (l: Link) => (g.tab?.id === l.id ? a(l, `<template data-tab-icon>${g.tab.icon}</template>`, ` data-tab data-tab-label="${esc(g.tab.label)}"`) : a(l));
      return `<ak-nav-group label="${esc(g.label)}"><span slot="icon">${g.icon}</span>${g.links.map(tabbed).join('')}</ak-nav-group>`;
    }),
    `<div class="s2k-side-foot">${a(n.foot, n.foot.icon)}<button class="ak-btn ak-btn--ghost s2k-search" type="button" data-ak-open="command">${ICON.search}<span>${esc(t('Search'))}</span><kbd class="ak-kbd">Ctrl K</kbd></button></div>`,
  ].join('');
}

/** Which sidebar link a path belongs to ('' = Today). */
export function navIdOf(path: string) {
  const rest = path.slice(BASE.length).replace(/^\//, '');
  return rest.split('/')[0] ?? '';
}
