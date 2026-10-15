import { Fragment, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useActionMenu } from './ui/ActionSheet';
import { usePersisted } from '../settings';
import { TabDefaultsCtx, arrange, type TabPrefs } from './ui/TabBar';
import { Briefcase, UsersRound, KeyRound, Table2, NotebookPen, Bell, CalendarDays, EyeOff, HardDrive, House, ListChecks, Mail, MessagesSquare, MoreHorizontal, Plus, Search, Sparkles, Video, type LucideIcon } from 'lucide-react';
import { term } from '../terms';
import { t } from '../i18n';
import type { AppId } from '../types';

// Names are getters, so they're read in the person's language each time (docs/i18n.md).
export const APPS: { id: AppId; readonly name: string; icon: LucideIcon; path: string }[] = [
  { id: 'home', get name() { return t('Home'); }, icon: House, path: '/home' },
  { id: 'mail', get name() { return t('Mail'); }, icon: Mail, path: '/mail' },
  { id: 'chat', get name() { return t('Chat'); }, icon: MessagesSquare, path: '/chat' },
  { id: 'tasks', get name() { return t('Tasks'); }, icon: ListChecks, path: '/tasks' },
  {
    id: 'projects',
    get name() {
      return term.Many; // Projects, or Clients for companies that use that word
    },
    icon: Briefcase,
    path: '/projects',
  },
  { id: 'teams', get name() { return t('Teams'); }, icon: UsersRound, path: '/teams' },
  { id: 'tables', get name() { return t('Tables'); }, icon: Table2, path: '/tables' },
  { id: 'calendar', get name() { return t('Calendar'); }, icon: CalendarDays, path: '/calendar' },
  { id: 'notes', get name() { return t('Notes'); }, icon: NotebookPen, path: '/notes' },
  { id: 'drive', get name() { return t('Drive'); }, icon: HardDrive, path: '/drive' },
  { id: 'meet', get name() { return t('Meet'); }, icon: Video, path: '/meet' },
  { id: 'vault', get name() { return t('Vault'); }, icon: KeyRound, path: '/vault' },
];

/** An app's name in English, the key its words come from: for words saved now and read later in each reader's language (a notice). */
export const appWord = (id: AppId): string => (id === 'projects' ? (term.word === 'client' ? 'Clients' : 'Projects') : (({ home: 'Home', mail: 'Mail', chat: 'Chat', tasks: 'Tasks', teams: 'Teams', tables: 'Tables', calendar: 'Calendar', notes: 'Notes', drive: 'Drive', meet: 'Meet', vault: 'Vault' }) as Record<string, string>)[id] ?? id);

interface Props {
  current: AppId | 'settings';
  enabled: AppId[];
  badges: Partial<Record<AppId, number>>;
  workspace: ReactNode; // the workspace switcher
  account: ReactNode; // avatar + account menu
  notifications: ReactNode; // bell popover (when open)
  unreadNotices: number;
  noticesOpen: boolean;
  aiOpen: boolean;
  onApp: (id: AppId) => void;
  onSearch: () => void;
  onAskAI: () => void;
  onNotices: () => void;
  /** Tablets: the phone bar's apps, pinned on top in the same order, with the rest under a line. */
  pinned?: AppId[];
  onPinned?: (bar: AppId[]) => void;
  /** Apps this person hid (the company has them on): right-click an app to hide it, the + under the apps shows them again. */
  hidden?: AppId[];
  onHide?: (id: AppId) => void;
  onShow?: (id: AppId) => void;
}

/** The apps in this person's order (drag them in the rail, or use Settings → Your apps), else the company's. */
export function useAppOrder() {
  const shared = useContext(TabDefaultsCtx);
  const [mine, setMine] = usePersisted<TabPrefs | null>('s2g-tabs:rail', null);
  const prefs = mine ?? shared.defaults.rail ?? null;
  return { arranged: (list: typeof APPS) => arrange(list, prefs), setOrder: (order: string[]) => setMine({ order, hidden: [] }), reset: () => setMine(null), mine, shared };
}

/** The far-left column: one icon per app, like Slack or Teams. Drag an app to move it. */
export function AppRail(p: Props) {
  const { arranged, setOrder } = useAppOrder();
  const on = APPS.filter((a) => p.enabled.includes(a.id));
  const pinned = (p.pinned ?? []).map((id) => on.find((a) => a.id === id)).filter((a): a is (typeof APPS)[number] => !!a);
  const apps = [...pinned, ...arranged(on.filter((a) => !pinned.includes(a)))];
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  // Right-click an app (long-press on touch): open it, hide it, or bring back one that's hidden.
  const [hit, setHit] = useState<AppId | null>(null);
  const hiddenApps = APPS.filter((a) => p.hidden?.includes(a.id));
  const showList = () => hiddenApps.map((a) => ({ label: t('Show {app}', { app: a.name }), icon: a.icon, group: 'show', run: () => p.onShow?.(a.id) }));
  const appMenu = useActionMenu(() => {
    const a = APPS.find((x) => x.id === hit);
    return [
      ...(a ? [{ label: t('Open {app}', { app: a.name }), icon: a.icon, run: () => p.onApp(a.id) }] : []),
      ...(a && a.id !== 'home' && p.onHide ? [{ label: t('Hide {app}', { app: a.name }), icon: EyeOff, run: () => p.onHide!(a.id) }] : []),
      ...showList(),
    ];
  });
  const moreBtn = useRef<HTMLButtonElement>(null);
  const appsRef = useRef<HTMLDivElement>(null);
  // A short screen scrolls the app list: keep the open app in view.
  useEffect(() => {
    appsRef.current?.querySelector<HTMLElement>('.rail-app.on')?.scrollIntoView({ block: 'nearest' });
  }, [p.current]);
  const moreMenu = useActionMenu(showList, { title: t('Hidden apps') });
  // A short window: the apps that fit, then More with the rest. The open app always keeps its place on the rail.
  const [fit, setFit] = useState(0);
  useEffect(() => {
    const el = appsRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const row = el.querySelector<HTMLElement>('.rail-app:not(.rail-more)')?.offsetHeight ?? 0;
      const n = row ? Math.floor((el.clientHeight - 16) / (row + 2)) : 0;
      setFit((x) => (x === n ? x : n));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const slots = fit - (hiddenApps.length ? 1 : 0);
  let shown = apps;
  if (fit > 0 && apps.length > slots) {
    const keep = Math.max(1, slots - 1);
    shown = apps.slice(0, keep);
    const cur = apps.find((a) => a.id === p.current);
    if (cur && !shown.includes(cur)) shown = [...shown.slice(0, keep - 1), cur];
  }
  const rest = apps.filter((a) => !shown.includes(a));
  const overBtn = useRef<HTMLButtonElement>(null);
  const overMenu = useActionMenu(() => rest.map((a) => ({ label: a.name, icon: a.icon, run: () => p.onApp(a.id) })), { title: t('More apps') });
  const drop = () => {
    if (drag && over && drag !== over.id && pinned.length) {
      // Tablets: whatever ends up above the line is the bar (the same four as on the phone).
      const ids: string[] = apps.map((a) => a.id as string).filter((x) => x !== drag);
      ids.splice(ids.indexOf(over.id) + (over.after ? 1 : 0), 0, drag);
      p.onPinned?.(ids.slice(0, pinned.length) as AppId[]);
      setOrder([...ids, ...arranged(APPS).map((a) => a.id as string).filter((x) => !ids.includes(x))]);
    } else if (drag && over && drag !== over.id) {
      const ids: string[] = arranged(APPS).map((a) => a.id as string).filter((x) => x !== drag);
      ids.splice(ids.indexOf(over.id) + (over.after ? 1 : 0), 0, drag);
      setOrder(ids);
    }
    setDrag(null);
    setOver(null);
  };
  return (
    <nav className="rail" aria-label={t('Apps')}>
      <div className="rail-ws">{p.workspace}</div>
      <div className="rail-apps" ref={appsRef}>
        {shown.map(({ id, name, icon: Icon }, i) => (
          <Fragment key={id}>
          {i === pinned.length && i > 0 && <span className="rail-sep" aria-hidden="true" />}
          <button
            className={`rail-app ${p.current === id ? 'on' : ''}${drag === id ? ' tab-dragging' : ''}${over?.id === id && drag !== id ? (over.after ? ' drop-below' : ' drop-above') : ''}`}
            onClick={() => p.onApp(id)}
            onContextMenu={(e) => (setHit(id), appMenu.bind.onContextMenu(e))}
            title={name}
            aria-label={name}
            aria-current={p.current === id ? 'page' : undefined}
            draggable
            onDragStart={(e) => ((e.dataTransfer.effectAllowed = 'move'), e.dataTransfer.setData('text/plain', id), setDrag(id))}
            onDragEnd={() => (setDrag(null), setOver(null))}
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              const after = e.clientY > r.top + r.height / 2;
              if (over?.id !== id || over.after !== after) setOver({ id, after });
            }}
            onDrop={(e) => (e.preventDefault(), drop())}
          >
            <span className="rail-icon">
              <Icon size={19} />
              {p.badges[id] ? <i>{p.badges[id]! > 99 ? '99+' : p.badges[id]}</i> : null}
            </span>
          </button>
          </Fragment>
        ))}
        {rest.length > 0 && (
          <button ref={overBtn} type="button" className="rail-app rail-more" onClick={() => overMenu.openFrom(overBtn)} title={t('More apps')} aria-label={t('More apps')}>
            <span className="rail-icon">
              <MoreHorizontal size={18} />
            </span>
          </button>
        )}
        {hiddenApps.length > 0 && (
          <button ref={moreBtn} type="button" className="rail-app rail-more" onClick={() => moreMenu.openFrom(moreBtn)} title={t('Show a hidden app')} aria-label={t('Show a hidden app')}>
            <span className="rail-icon">
              <Plus size={18} />
            </span>
          </button>
        )}
        {appMenu.menu}
        {moreMenu.menu}
        {overMenu.menu}
      </div>
      <div className="rail-foot">
        <button className="rail-tool" onClick={p.onSearch} title={t('Search everything (⌘K)')}>
          <Search size={18} />
        </button>
        <button className={`rail-tool ai ${p.aiOpen ? 'on' : ''}`} onClick={p.onAskAI} title={t('Ask AI (⌘J)')}>
          <Sparkles size={18} />
        </button>
        <div className="rail-notices">
          <button className={`rail-tool ${p.noticesOpen ? 'on' : ''}`} onClick={p.onNotices} title={t('Notifications')}>
            <Bell size={18} />
            {p.unreadNotices ? <i>{p.unreadNotices}</i> : null}
          </button>
          {p.noticesOpen && p.notifications}
        </div>
        <div className="rail-account">{p.account}</div>
      </div>
    </nav>
  );
}
