import './v2.css';
import './ab.css';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, ArrowLeft, Building2, Check, ClipboardList, CreditCard, Gauge, Inbox, Infinity as InfinityIcon, Languages, LifeBuoy, LogOut, Megaphone, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Rows3, Rows4, Search, ChevronRight, ServerCog, ShieldCheck, Sparkles, Sun, TrendingUp, UserCog, Users, X, type LucideIcon } from 'lucide-react';
import { Wordmark } from '../../components/Logo';
import { signOut } from '../../sync';
import { ApiError, get, post, ROLE_LABEL, type Perm } from './api';
import { AdminCtx, Initials, type Ctx, type Me } from './ui';
import { Today } from './pages/Today';
import { Tickets, TicketPage } from './pages/Tickets';
import { Companies, CompanyPage } from './pages/Companies';
import { People, PersonPage } from './pages/People';
import { Money } from './pages/Money';
import { Growth } from './pages/Growth';
import { Product } from './pages/Product';
import { Platform } from './pages/Platform';
import { Team } from './pages/Team';
import { AIPage } from './pages/AI';
import { Whitelist } from './pages/Whitelist';
import { Popover } from '../../components/ui/Popover';
import { LANGS, getLang, isLang, rememberLang, setLang, t, tx, type Lang } from '../../i18n';
import { tj } from '../../i18n/tj';
import { useLang } from '../../i18n/useLang';

type Item = { id: string; label: string; icon: LucideIcon; perm?: Perm };
// Getters: each read gives the words in the console's language of the moment (docs/i18n.md).
const NAV: { group: string; items: Item[] }[] = [
  { get group() { return tx('nav', 'Inbox'); }, items: [{ id: 'today', get label() { return t('Today'); }, icon: Gauge }, { id: 'tickets', get label() { return t('Tickets'); }, icon: LifeBuoy }] },
  { get group() { return t('Customers'); }, items: [{ id: 'companies', get label() { return t('Companies'); }, icon: Building2 }, { id: 'people', get label() { return t('People'); }, icon: Users }, { id: 'whitelist', get label() { return t('Whitelist'); }, icon: InfinityIcon }] },
  { get group() { return t('Business'); }, items: [{ id: 'money', get label() { return tx('nav', 'Money'); }, icon: CreditCard }, { id: 'ai', label: 'AI', icon: Sparkles }, { id: 'growth', get label() { return t('Growth'); }, icon: TrendingUp }] },
  { get group() { return tx('nav', 'Run'); }, items: [{ id: 'product', get label() { return t('Product'); }, icon: Megaphone }, { id: 'platform', get label() { return t('Platform'); }, icon: ServerCog }, { id: 'team', get label() { return t('Team & settings'); }, icon: UserCog }] },
];


/** The Section / Page path in the top bar. */
const navGroupOf = (id: string) => NAV.find((g) => g.items.some((x) => x.id === id))?.group ?? NAV[0].group;
const navLabelOf = (id: string) => NAV.flatMap((g) => g.items).find((x) => x.id === id)?.label ?? t('Today');
const crumbTab = (id: string) => id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');

/** /admin/v2/<section>/<id or tab>/<tab> */
function parse(path: string) {
  const [, , , section = 'today', a = '', b = ''] = path.split('/');
  return { section: section || 'today', a: decodeURIComponent(a), b: decodeURIComponent(b) };
}

/** Marks the page as v2 (every v2 style is scoped to it) and keeps it out of search engines until cutover. */
function useV2Document() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.ui = 'v2';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => {
      delete root.dataset.ui;
      robots.remove();
    };
  }, []);
}

type Theme = 'system' | 'light' | 'dark';
/** Light, dark or the system's, remembered on this device. */
function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('s2g-admin-theme') as Theme) || 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => (document.documentElement.dataset.theme = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme);
    apply();
    mq.addEventListener('change', apply);
    try {
      localStorage.setItem('s2g-admin-theme', theme);
    } catch {
      /* private mode */
    }
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system'))] as const;
}

/**
 * The console's language: the operator's own pick here (kept on the server with their operator record, so it follows
 * them), else their app account's, else this device's. Operators may have no app language at all.
 */
function useConsoleLang(saved: Lang | null | undefined) {
  useEffect(() => {
    if (isLang(saved)) void setLang(saved);
  }, [saved]);
  const lang = useLang();
  const pick = (l: Lang) => {
    rememberLang(l);
    void setLang(l);
    void post('me/lang', { lang: l }).catch(() => {});
  };
  return [lang, pick] as const;
}

/** The operator backend: the people who run sprint2go. Its own shell, the app's parts and look. */
export function AdminV2() {
  useV2Document();
  const [theme, nextTheme] = useTheme();
  const [me, setMe] = useState<(Me & { totpOn: boolean; verified: boolean; lang?: Lang | null }) | null | 'denied'>(null);
  const [lang, pickLang] = useConsoleLang(me && me !== 'denied' ? me.lang : null);
  const [langOpen, setLangOpen] = useState(false);
  const langBtn = useRef<HTMLButtonElement>(null);
  const [path, setPath] = useState(location.pathname);
  const [toasts, setToasts] = useState<{ id: number; text: string; out?: boolean; action?: { label: string; run: () => void } }[]>([]);
  const [tick, setTick] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  // Desktop: the nav folds to icons (remembered on this device; Ctrl+B or the button at its foot).
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem('s2g-adm2-folded') === '1';
    } catch {
      return false;
    }
  });
  const toggleFold = useCallback(() => {
    setFolded((f) => {
      try {
        localStorage.setItem('s2g-adm2-folded', f ? '0' : '1');
      } catch {
        /* private window */
      }
      return !f;
    });
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') (e.preventDefault(), toggleFold());
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [toggleFold]);
  const [search, setSearch] = useState(false);
  // Density: comfortable (roomy, the default) or compact (more rows on screen); remembered on this device.
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem('s2g-adm2-compact') === '1';
    } catch {
      return false;
    }
  });
  const toggleCompact = useCallback(() => {
    setCompact((c) => {
      try {
        localStorage.setItem('s2g-adm2-compact', c ? '0' : '1');
      } catch {
        /* private window */
      }
      return !c;
    });
  }, []);
  const goRef = useRef<(to: string) => void>(() => {});
  // g then a letter jumps to a section (g t Today, g k Tickets, g c Companies, g p People, g m Money, g a AI).
  useEffect(() => {
    let armed = 0;
    const map: Record<string, string> = { t: 'today', k: 'tickets', c: 'companies', p: 'people', w: 'whitelist', m: 'money', a: 'ai', g: 'growth', r: 'product', l: 'platform', s: 'team' };
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      if (armed && Date.now() - armed < 1200 && map[key]) {
        armed = 0;
        e.preventDefault();
        goRef.current(`/admin/v2/${map[key]}`);
        return;
      }
      armed = key === 'g' ? Date.now() : 0;
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const [open, setOpen] = useState(0); // new and open tickets, for the nav
  const load = useCallback(() => get('me').then(setMe, () => setMe('denied')), []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    const pop = () => setPath(location.pathname);
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') (e.preventDefault(), setSearch((s) => !s));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const ready = !!me && me !== 'denied' && me.totpOn && me.verified;
  useEffect(() => {
    if (!ready) return;
    const count = () => get<{ tickets: { status: string }[] }>('tickets').then((r) => setOpen(r.tickets.filter((x) => x.status === 'new' || x.status === 'open').length), () => {});
    void count();
    const timer = setInterval(() => document.visibilityState === 'visible' && void count(), 60_000);
    return () => clearInterval(timer);
  }, [ready, tick]);
  useEffect(() => {
    document.title = t('sprint2go · Operator') + ' (v2)';
  }, [lang]);
  // The server writes some of what the pages show (labels, warnings) in the console's language: load them again.
  const firstLang = useRef(lang);
  useEffect(() => {
    if (lang !== firstLang.current) setTick((n) => n + 1);
  }, [lang]);

  const go = useCallback((to: string) => {
    // The server's links (warnings, search results) point at v1's /admin/…: inside v2 they open the v2 screen.
    if (to.startsWith('/admin') && !to.startsWith('/admin/v2') && !to.startsWith('/api/')) to = to.replace(/^\/admin/, '/admin/v2');
    if (to.startsWith('/admin/v2')) {
      history.pushState(null, '', to);
      setPath(to.split('?')[0]);
      setNavOpen(false);
      document.querySelector('.a2-main')?.scrollTo({ top: 0 });
      document.querySelector<HTMLElement>('.a2-main h1')?.focus?.();
    } else location.assign(to);
  }, []);
  goRef.current = go;
  const toast = useCallback((text: string, action?: { label: string; run: () => void }) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-2), { id, text, action }]);
    // Slides out, then goes.
    setTimeout(() => setToasts((list) => list.map((x) => (x.id === id ? { ...x, out: true } : x))), action ? 7000 : 4000);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), (action ? 7000 : 4000) + 200);
  }, []);

  if (me === null) return <div className="boot" />;
  if (me === 'denied')
    return (
      <Gate title={t('Operators only')} text={t('This account isn’t on the sprint2go operator team. An owner can add you under Team & settings.')}>
        <a className="primary-btn signin-btn" href="/">
          {t('Open the app')}
        </a>
        <p className="signin-switch">
          <button type="button" className="link-btn" onClick={() => void signOut()}>
            {t('Sign out')}
          </button>
        </p>
      </Gate>
    );
  if (!me.totpOn) return <Enroll email={me.email} onDone={() => void load()} />;
  if (!me.verified) return <Verify email={me.email} onDone={() => void load()} />;

  const { section, a, b } = parse(path);
  const ctx: Ctx = {
    me,
    may: (p) => me.perms.includes(p),
    go,
    toast,
    tick,
    bump: () => setTick((n) => n + 1),
    signInAs: (userId, ticket) =>
      void post('person/signin-as', { userId, ticket })
        .then(() => location.assign('/'))
        .catch((e: Error) => toast(e.message)),
  };
  let page: ReactNode;
  if (section === 'tickets') page = a ? <TicketPage id={a} key={a} /> : <Tickets />;
  else if (section === 'companies') page = a ? <CompanyPage id={a} tab={b || 'overview'} key={a} /> : <Companies />;
  else if (section === 'people') page = a ? <PersonPage id={a} key={a} /> : <People />;
  else if (section === 'whitelist') page = <Whitelist />;
  else if (section === 'money') page = <Money tab={a || 'revenue'} />;
  else if (section === 'ai') page = <AIPage tab={a || 'margin'} />;
  else if (section === 'growth') page = <Growth />;
  else if (section === 'product') page = <Product tab={a || 'announcements'} />;
  else if (section === 'platform') page = <Platform tab={a || 'health'} />;
  else if (section === 'team') page = <Team tab={a || 'operators'} />;
  else page = <Today />;

  return (
    <AdminCtx.Provider value={ctx}>
      <div className={`a2 ab ${navOpen ? 'nav-open' : ''} ${folded ? 'folded' : ''} ${compact ? 'compact' : ''}`}>
        <header className="a2-topbar">
          <button className="icon-btn" onClick={() => setNavOpen(true)} aria-label={t('Open menu')}>
            <Menu size={18} />
          </button>
          <Wordmark height={20} />
          <span className="spacer" />
          <button className="icon-btn" onClick={() => setSearch(true)} aria-label={t('Search')}>
            <Search size={18} />
          </button>
        </header>
        <div className="a2-scrim" onClick={() => setNavOpen(false)} />
        <aside className="a2-nav" aria-label={t('Backend')}>
          <div className="a2-brand">
            <Wordmark height={20} />
            <span className="a2-brand-tag">{t('Operator')}</span>
            <button className="icon-btn sm a2-nav-close" onClick={() => setNavOpen(false)} aria-label={t('Close menu')}>
              <X size={16} />
            </button>
          </div>
          <button type="button" className="a2-searchbtn" onClick={() => (setNavOpen(false), setSearch(true))}>
            <Search size={14} />
            <span>{tx('console', 'Search everything')}</span>
            <kbd>Ctrl K</kbd>
          </button>
          <nav className="a2-groups">
            {NAV.map((g) => (
              <div key={g.group} className="a2-group">
                <span className="a2-group-label">{g.group}</span>
                {g.items.map((it) => (
                  <a
                    key={it.id}
                    href={`/admin/v2/${it.id}`}
                    className={`a2-nav-item ${section === it.id ? 'on' : ''}`}
                    title={folded ? it.label : undefined}
                    aria-current={section === it.id ? 'page' : undefined}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) return;
                      e.preventDefault();
                      go(`/admin/v2/${it.id}`);
                    }}
                  >
                    <it.icon size={16} />
                    <span>{it.label}</span>
                    {it.id === 'tickets' && open > 0 && <em className="a2-nav-badge">{open}</em>}
                  </a>
                ))}
              </div>
            ))}
          </nav>
          <div className="a2-me">
            <Initials name={me.name || me.email} size={30} />
            <span className="a2-me-text">
              <strong>{me.name || me.email}</strong>
              <small>{ROLE_LABEL[me.role]}</small>
            </span>
            <span className="a2-me-actions">
              <button className="icon-btn sm" onClick={nextTheme} title={t('Theme: {theme}', { theme: themeName(theme) })} aria-label={t('Theme: {theme}. Change', { theme: themeName(theme) })}>
                {theme === 'dark' ? <Moon size={16} /> : theme === 'light' ? <Sun size={16} /> : <Monitor size={16} />}
              </button>
              <button ref={langBtn} className="icon-btn sm" onClick={() => setLangOpen((o) => !o)} title={t('Language')} aria-label={t('Language: {language}. Change', { language: LANGS.find((l) => l.id === lang)?.name ?? lang })} aria-haspopup="menu" aria-expanded={langOpen}>
                <Languages size={16} />
              </button>
              <Popover anchor={langBtn} open={langOpen} onClose={() => setLangOpen(false)} width={200} align="end" title={t('Language')}>
                <div className="a2-menu" role="menu">
                  {LANGS.map((l) => (
                    <button key={l.id} type="button" role="menuitemradio" aria-checked={l.id === getLang()} className={`a2-lang ${l.id === lang ? 'on' : ''}`} onClick={() => (setLangOpen(false), pickLang(l.id))} lang={l.id}>
                      <span>{l.name}</span>
                      {l.id === lang && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </Popover>
              <button className="icon-btn sm a2-fold-nav" onClick={toggleFold} title={folded ? t('Show the menu') : t('Fold the menu')} aria-label={folded ? t('Show the menu') : t('Fold the menu')} aria-pressed={folded}>
                {folded ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
              <a className="icon-btn sm" href="/" title={t('Back to the app')} aria-label={t('Back to the app')}>
                <ArrowLeft size={16} />
              </a>
              <button className="icon-btn sm" onClick={() => void signOut()} title={t('Sign out')} aria-label={t('Sign out')}>
                <LogOut size={16} />
              </button>
            </span>
          </div>
        </aside>
        <div className="ab-work">
          <div className="ab-bar">
            <nav className="ab-crumbs" aria-label={t('Where you are')}>
              <span>{navGroupOf(section)}</span>
              <ChevronRight size={14} aria-hidden />
              <button type="button" className={a ? '' : 'on'} onClick={() => go(`/admin/v2/${section}`)}>
                {navLabelOf(section)}
              </button>
              {a && (
                <>
                  <ChevronRight size={14} aria-hidden />
                  <span className="on ab-crumb-last">{b || /^[a-z]+$/.test(a) ? crumbTab(a) : a}</span>
                </>
              )}
            </nav>
            <span className="spacer" />
            <button type="button" className="ab-cmdk" onClick={() => setSearch(true)}>
              <Search size={14} />
              <span>{t('Search')}</span>
              <kbd>Ctrl K</kbd>
            </button>
            <button type="button" className="icon-btn sm ab-density" onClick={toggleCompact} aria-pressed={compact} title={compact ? t('Comfortable rows') : t('Compact rows')} aria-label={compact ? t('Comfortable rows') : t('Compact rows')}>
              {compact ? <Rows3 size={16} /> : <Rows4 size={16} />}
            </button>
          </div>
          <main className="a2-main" key={section + a}>
            {page}
          </main>
        </div>
        {search && <Palette onClose={() => setSearch(false)} go={go} />}
        <div className="a2-toasts" role="status" aria-live="polite">
          {toasts.map((tst) => (
            <div key={tst.id} className={`a2-toast ${tst.out ? 'out' : ''}`}>
              <span>{tst.text}</span>
              {tst.action && (
                <button
                  type="button"
                  onClick={() => {
                    tst.action!.run();
                    setToasts((x) => x.filter((y) => y.id !== tst.id));
                  }}
                >
                  {tst.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </AdminCtx.Provider>
  );
}

/* ---------- ⌘K ---------- */

const KIND_ICON: Record<string, LucideIcon> = { company: Building2, person: Users, ticket: Inbox, invoice: CreditCard, mailbox: Activity };
/** What each kind of search result is, in words. */
const kindName = (kind: string) => ({ company: tx('kind', 'company'), person: tx('kind', 'person'), ticket: tx('kind', 'ticket'), invoice: tx('kind', 'invoice'), mailbox: tx('kind', 'mailbox') })[kind] ?? kind;
const themeName = (theme: Theme) => (theme === 'dark' ? t('dark') : theme === 'light' ? t('light') : t('the system’s'));
/** Places to jump to (called while rendering: the titles are in the console's language). */
const jumps = () => [
  { title: t('Today'), to: '/admin/v2/today' },
  { title: t('Tickets'), to: '/admin/v2/tickets' },
  { title: t('Companies'), to: '/admin/v2/companies' },
  { title: t('People'), to: '/admin/v2/people' },
  { title: t('Revenue'), to: '/admin/v2/money/revenue' },
  { title: t('Invoices'), to: '/admin/v2/money/invoices' },
  { title: t('Plans & coupons'), to: '/admin/v2/money/plans' },
  { title: t('AI margin'), to: '/admin/v2/ai/margin' },
  { title: t('Our AI keys'), to: '/admin/v2/ai/keys' },
  { title: t('AI models per job'), to: '/admin/v2/ai/models' },
  { title: t('AI prices'), to: '/admin/v2/ai/prices' },
  { title: t('Growth'), to: '/admin/v2/growth' },
  { title: t('Announcements'), to: '/admin/v2/product/announcements' },
  { title: t('Feature flags'), to: '/admin/v2/product/flags' },
  { title: t('Email to owners'), to: '/admin/v2/product/broadcasts' },
  { title: t('Platform health'), to: '/admin/v2/platform/health' },
  { title: t('Mail queue'), to: '/admin/v2/platform/mail' },
  { title: t('Errors'), to: '/admin/v2/platform/errors' },
  { title: t('Backups'), to: '/admin/v2/platform/backups' },
  { title: t('Safety'), to: '/admin/v2/platform/safety' },
  { title: t('Operator team'), to: '/admin/v2/team/operators' },
  { title: t('Saved replies'), to: '/admin/v2/team/replies' },
  { title: t('Backend settings'), to: '/admin/v2/team/settings' },
  { title: t('Audit log'), to: '/admin/v2/team/audit' },
];
function Palette({ onClose, go }: { onClose: () => void; go: (to: string) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ kind: string; id: string; title: string; sub: string; to: string }[]>([]);
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!q.trim()) return (setResults([]), setI(0));
      get<{ results: typeof results }>('search?q=' + encodeURIComponent(q.trim())).then((r) => (setResults(r.results), setI(0)), () => {});
    }, 140);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('button.on')?.scrollIntoView({ block: 'nearest' });
  }, [i]);
  const lang = useLang();
  const places = useMemo(() => jumps().filter((j) => !q || j.title.toLowerCase().includes(q.toLowerCase())).map((j) => ({ kind: 'jump', id: j.to, title: j.title, sub: t('Go to'), to: j.to })), [q, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = [...results, ...places].slice(0, 30);
  const pick = (x: { to: string }) => (onClose(), go(x.to));
  return (
    <div className="palette-scrim a2-palette-scrim" onMouseDown={onClose}>
      <div className="a2-palette" role="dialog" aria-label={t('Search')} onMouseDown={(e) => e.stopPropagation()}>
        <label className="a2-palette-input">
          <Search size={16} />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('Company, person, ticket number, invoice or mailbox')}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') (e.preventDefault(), setI((x) => Math.min(all.length - 1, x + 1)));
              if (e.key === 'ArrowUp') (e.preventDefault(), setI((x) => Math.max(0, x - 1)));
              if (e.key === 'Enter' && all[i]) pick(all[i]);
            }}
          />
          <kbd>esc</kbd>
        </label>
        <div className="a2-palette-list" ref={list}>
          {all.length === 0 && <p className="a2-palette-empty">{t('Nothing found for “{q}”.', { q })}</p>}
          {all.map((x, k) => {
            const Icon = KIND_ICON[x.kind] ?? ClipboardList;
            return (
              <button key={x.kind + x.id} type="button" className={k === i ? 'on' : ''} onMouseEnter={() => setI(k)} onClick={() => pick(x)}>
                <Icon size={15} />
                <span>
                  <strong>{x.title}</strong>
                  <small>{x.sub}</small>
                </span>
                {x.kind !== 'jump' && <em>{kindName(x.kind)}</em>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- two-step sign-in ---------- */

function Gate({ title, text, children }: { title: string; text: ReactNode; children: ReactNode }) {
  return (
    <div className="signin">
      <div className="signin-card a2-gate">
        <Wordmark height={28} />
        <span className="a2-gate-icon">
          <ShieldCheck size={20} />
        </span>
        <h1>{title}</h1>
        <div className="signin-sub">{text}</div>
        {children}
      </div>
    </div>
  );
}
function CodeInput({ onSubmit, busy, error }: { onSubmit: (code: string) => void; busy: boolean; error: string | null }) {
  const [code, setCode] = useState('');
  const ok = code.replace(/\D/g, '').length === 6;
  return (
    <form
      className="a2-code-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSubmit(code);
      }}
    >
      <input className="a2-code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} placeholder="123 456" autoFocus aria-label={t('Six-digit code')} />
      {error && <p className="signin-error">{error}</p>}
      <button className="primary-btn signin-btn" disabled={busy || !ok}>
        {busy ? t('Checking…') : t('Continue')}
      </button>
    </form>
  );
}
function Verify({ email, onDone }: { email: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Gate title={t('Your 2FA code')} text={t('Open your authenticator app and enter the code for sprint2go ({email}). It’s asked again every 12 hours.', { email })}>
      <CodeInput
        busy={busy}
        error={error}
        onSubmit={(code) => {
          setBusy(true);
          setError(null);
          post('2fa/verify', { code })
            .then(onDone)
            .catch((e: ApiError) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      />
      <p className="signin-switch">
        {tj('Lost your phone? Another owner can reset your 2FA. {signOut}', {
          signOut: (
            <button type="button" className="link-btn" onClick={() => void signOut()}>
              {t('Sign out')}
            </button>
          ),
        })}
      </p>
    </Gate>
  );
}
function Enroll({ email, onDone }: { email: string; onDone: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    post('2fa/setup').then(setSetup, (e: Error) => setError(e.message));
  }, []);
  return (
    <Gate title={t('Turn on two-step sign-in')} text={t('The backend can see and change every company, so it needs a second step. Scan this with Google Authenticator, 1Password or any authenticator app, then enter the code it shows.')}>
      <div className="a2-qr">{setup ? <img src={setup.qr} alt={t('QR code for your authenticator app')} width={180} height={180} /> : <span className="a2-qr-wait" />}</div>
      {setup && <p className="a2-secret">{tj('Can’t scan? Enter this key: {key}', { key: <code className="mono">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code> })}</p>}
      <CodeInput
        busy={busy}
        error={error}
        onSubmit={(code) => {
          setBusy(true);
          setError(null);
          post('2fa/verify', { code })
            .then(onDone)
            .catch((e: ApiError) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      />
      <p className="signin-switch">
        {tj('Signed in as {email}. {signOut}', {
          email,
          signOut: (
            <button type="button" className="link-btn" onClick={() => void signOut()}>
              {t('Sign out')}
            </button>
          ),
        })}
      </p>
    </Gate>
  );
}
