// The customer app v2 at /v2, on aqeel-admin-kit (public/app-v2/kit, theme public/app-v2/app-theme.css, loaded by
// /admin-v2/boot.js before anything is drawn). The app at / (v1) stays as it is, as the backup. Same data: every page
// reads and writes the same synced collections as v1 (src/store.ts), so the server sees the same changes.
// Navigation is the why review's proposal: labelled apps grouped Talk / Plan / Keep, Meetings named as its page,
// Teams folded into People (docs/admin-kit-v2-app-plan.md).
import { lazy, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import type { User, Workspace } from '../types';
import { setBrand } from '../brandInk';
import { usePersisted } from '../settings';
import { signOut } from '../sync';
import { t } from '../i18n';
import { Frame, ICON, sidebarHtml, useV2Path } from './Shell';
import { BASE, V2, type V2Ctx } from './ui';
import { Home } from './pages/Home';
import { TeamCtx } from './team';

const Tasks = lazy(() => import('./pages/Tasks').then((m) => ({ default: m.Tasks })));
const Projects = lazy(() => import('./pages/Projects').then((m) => ({ default: m.Projects })));
const Mail = lazy(() => import('./pages/Talk').then((m) => ({ default: m.Mail })));
const Chat = lazy(() => import('./pages/Talk').then((m) => ({ default: m.Chat })));
const Meetings = lazy(() => import('./pages/Talk').then((m) => ({ default: m.Meetings })));
const Calendar = lazy(() => import('./pages/Plan').then((m) => ({ default: m.Calendar })));
const Notes = lazy(() => import('./pages/Keep').then((m) => ({ default: m.Notes })));
const Drive = lazy(() => import('./pages/Keep').then((m) => ({ default: m.Drive })));
const Tables = lazy(() => import('./pages/Keep').then((m) => ({ default: m.Tables })));
const Vault = lazy(() => import('./pages/Keep').then((m) => ({ default: m.Vault })));
const People = lazy(() => import('./pages/People').then((m) => ({ default: m.People })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

function route(path: string): ReactNode {
  const [section = '', a = ''] = path.slice(BASE.length).replace(/^\/+/, '').split('/').map((s) => decodeURIComponent(s));
  switch (section) {
    case 'mail': return <Mail />;
    case 'chat': return <Chat open={a} />;
    case 'meetings': return <Meetings />;
    case 'tasks': return <Tasks />;
    case 'projects': return <Projects />;
    case 'calendar': return <Calendar />;
    case 'notes': return <Notes open={a} />;
    case 'drive': return <Drive />;
    case 'tables': return <Tables />;
    case 'vault': return <Vault />;
    case 'people': return <People />;
    case 'settings': return <Settings />;
    default: return <Home />;
  }
}

/** The sections, in order. Phone tab bar: Home, Mail, Chat, Tasks, then More (reasons in the plan). */
function nav(brand: string, current: string) {
  return sidebarHtml({
    base: BASE,
    brand,
    current,
    top: [{ id: '', label: t('Home'), icon: ICON.home, tab: t('Home') }],
    groups: [
      { label: t('Talk'), links: [{ id: 'mail', label: t('Mail'), icon: ICON.mail, tab: t('Mail') }, { id: 'chat', label: t('Chat'), icon: ICON.chat, tab: t('Chat') }, { id: 'meetings', label: t('Meetings') }] },
      { label: t('Plan'), links: [{ id: 'tasks', label: t('Tasks'), icon: ICON.tasks, tab: t('Tasks') }, { id: 'projects', label: t('Projects') }, { id: 'calendar', label: t('Calendar') }] },
      { label: t('Keep'), links: [{ id: 'notes', label: t('Notes') }, { id: 'drive', label: t('Drive') }, { id: 'tables', label: t('Tables') }, { id: 'vault', label: t('Vault') }] },
    ],
    foot: [
      { id: 'people', label: t('People'), icon: ICON.people },
      { id: 'settings', label: t('Settings'), icon: ICON.settings },
    ],
  });
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function AppV2({ user, users, workspaces }: { user: User; users: User[]; workspaces: Workspace[] }) {
  const mine = workspaces.filter((w) => w.members.some((m) => m.userId === user.id));
  const [wsId, setWsId] = usePersisted<string>(`s2g-v2-ws:${user.id}`, mine[0]?.id ?? '');
  const ws = mine.find((w) => w.id === wsId) ?? mine[0];
  const { path, go } = useV2Path();
  useEffect(() => {
    if (ws) setBrand(ws.color); // the company's colour is the accent (theme: --ak-accent reads --brand-ink)
  }, [ws?.color]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = window.AdminKit;
    k?.command.add([
      ...mine.filter((w) => w.id !== ws?.id).map((w) => ({ group: t('Company'), label: t('Switch to {name}', { name: w.name }), run: () => setWsId(w.id) })),
      { group: t('Account'), label: t('Open the app at / (version 1)'), run: () => location.assign('/') },
      { group: t('Account'), label: t('Sign out'), run: () => void signOut() },
    ]);
  }, [mine.length, ws?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx: V2Ctx = useMemo(() => ({ go, where: ws?.name ?? 'sprint2go', toast: (text, o) => window.AdminKit?.toast(text, o) }), [go, ws?.name]);
  const team = useMemo(() => (ws ? { me: user, ws, users, members: users.filter((u) => ws.members.some((m) => m.userId === u.id)) } : null), [user, ws, users]);
  if (!ws || !team) return null;
  const brand = `${ws.logo ? `<img src="${escape(ws.logo)}" alt="">` : `<span class="s2a-logo" aria-hidden="true">${escape(ws.name.slice(0, 1).toUpperCase())}</span>`}<span class="s2a-brand__name">${escape(ws.name)}</span>`;
  return (
    <V2.Provider value={ctx}>
      <TeamCtx.Provider value={team}>
        <Frame path={path} base={BASE} sidebar={(cur) => nav(brand, cur)} key={ws.id}>
          <Suspense fallback={<div className="ak-stack"><ak-placeholder kind="list" rows="6" /></div>}>
            <div className="s2a-route" key={path}>{route(path)}</div>
          </Suspense>
        </Frame>
      </TeamCtx.Provider>
    </V2.Provider>
  );
}
