// The operator console v2 at /admin/v2, built on aqeel-admin-kit (public/admin-v2/kit, theme public/admin-v2/admin-theme.css,
// loaded by index.html before anything is drawn). v1 at /admin stays as it is, as the fallback.
// React draws each page inside <ak-page>; the frame and the sidebar are the kit's, drawn once from nav.ts.
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import './kit.css';
import { signOut } from '../../sync';
import { ApiError, get, post } from '../api';
import { AdminCtx, type Ctx, type Me } from '../ui';
import { isLang, setLang, t, type Lang } from '../../i18n';
import { BASE, navIdOf, sidebarHtml } from './nav';
import { Today } from './pages/Today';

const Sample = lazy(() => import('./pages/Sample').then((m) => ({ default: m.Sample })));
const Tickets = lazy(() => import('./pages/Tickets').then((m) => ({ default: m.Tickets })));
const TicketSettings = lazy(() => import('./pages/Tickets').then((m) => ({ default: m.TicketSettings })));
const Ticket = lazy(() => import('./pages/Tickets').then((m) => ({ default: m.TicketPage })));
const Companies = lazy(() => import('./pages/Companies').then((m) => ({ default: m.Companies })));
const Company = lazy(() => import('./pages/Companies').then((m) => ({ default: m.CompanyPage })));
const People = lazy(() => import('./pages/People').then((m) => ({ default: m.People })));
const Person = lazy(() => import('./pages/People').then((m) => ({ default: m.PersonPage })));
const Money = lazy(() => import('./pages/Money').then((m) => ({ default: m.Money })));
const Growth = lazy(() => import('./pages/Growth').then((m) => ({ default: m.Growth })));
const Announcements = lazy(() => import('./pages/Announcements').then((m) => ({ default: m.Announcements })));
const Server = lazy(() => import('./pages/Server').then((m) => ({ default: m.Server })));
const Mail = lazy(() => import('./pages/Mail').then((m) => ({ default: m.Mail })));
const AISetup = lazy(() => import('./pages/AISetup').then((m) => ({ default: m.AISetup })));
const Team = lazy(() => import('./pages/Team').then((m) => ({ default: m.Team })));

type FullMe = Me & { totpOn: boolean; verified: boolean; lang?: Lang | null };

/** /admin/v2/<section>/<a>/<b> */
function parse(path: string) {
  const [section = '', a = '', b = ''] = path.slice(BASE.length).replace(/^\/+/, '').split('/');
  return { section, a: decodeURIComponent(a), b: decodeURIComponent(b) };
}

function route(path: string): ReactNode {
  const { section, a, b } = parse(path);
  switch (section) {
    case '_kit': return <Sample />;
    case 'tickets': return a === 'settings' ? <TicketSettings /> : a ? <Ticket id={a} key={a} /> : <Tickets />;
    case 'companies': return a ? <Company id={a} tab={b} key={a} /> : <Companies />;
    case 'people': return a ? <Person id={a} key={a} /> : <People />;
    case 'money': return <Money tab={a} />;
    case 'growth': return <Growth />;
    case 'announcements': return <Announcements />;
    case 'server': return <Server tab={a} />;
    case 'mail': return <Mail />;
    case 'ai': return <AISetup tab={a} />;
    case 'team': return <Team tab={a} />;
    default: return <Today />;
  }
}

export function KitAdmin() {
  const [me, setMe] = useState<FullMe | null | 'denied'>(null);
  const [path, setPath] = useState(location.pathname);
  const [tick, setTick] = useState(0);
  const load = useCallback(() => get<FullMe>('me').then(setMe, () => setMe('denied')), []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    document.documentElement.setAttribute('data-s2k', '');
    document.documentElement.dataset.theme = 'light'; // the kit theme is light only for now (kit-requests.md: dark mode)
  }, []);
  useEffect(() => {
    if (me && me !== 'denied' && isLang(me.lang)) void setLang(me.lang);
  }, [me]);

  const go = useCallback((to: string) => {
    if (!to.startsWith(BASE)) {
      if (to.startsWith('/admin')) to = BASE + to.slice('/admin'.length); // v1 links inside shared helpers
      else return location.assign(to);
    }
    history.pushState(null, '', to);
    setPath(to.split('?')[0]);
    window.scrollTo({ top: 0 });
  }, []);
  // Links inside the console move without reloading the page (the sidebar keeps its place and glides).
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith(BASE)) return;
      e.preventDefault();
      go(url.pathname + url.search);
    };
    const pop = () => setPath(location.pathname);
    document.addEventListener('click', click);
    window.addEventListener('popstate', pop);
    return () => (document.removeEventListener('click', click), window.removeEventListener('popstate', pop));
  }, [go]);

  const ctx: Ctx | null = useMemo(
    () =>
      me && me !== 'denied'
        ? {
            me,
            may: (p) => me.perms.includes(p),
            go,
            toast: (text, action) => window.AdminKit?.toast(text, action ? { action: { label: action.label, onClick: action.run } } : undefined),
            tick,
            bump: () => setTick((n) => n + 1),
            // Signing in as a customer is the riskiest thing an operator can do: always a reason (a ticket number) and a confirm.
            signInAs: (userId, ticket) =>
              void (async () => {
                const ref = ticket ? String(ticket) : await window.AdminKit.prompt({ title: t('Sign in as this person?'), label: t('Ticket number this is for (the server asks for it)'), confirmLabel: t('Continue') });
                if (!ref) return;
                const ok = await window.AdminKit.confirm({ title: t('Sign in as this person?'), body: t('You will see and act as them for up to 12 hours. It is logged with your name and ticket #{n}, and they can see it.', { n: ref }), confirmLabel: t('Sign in as them'), tone: 'danger' });
                if (!ok) return;
                post('person/signin-as', { userId, ticket: Number(ref) || ref })
                  .then(() => location.assign('/'))
                  .catch((e: Error) => window.AdminKit.toast.error(e.message));
              })(),
          }
        : null,
    [me, go, tick],
  );

  if (me === null) return <Frame signedOut><div className="s2k-gate" aria-busy="true" /></Frame>;
  if (me === 'denied')
    return (
      <Frame signedOut>
        <Gate title={t('Operators only')} text={t('This account is not on the sprint2go operator team. An owner can add you under Team.')}>
          <a className="ak-btn ak-btn--primary" href="/">{t('Open the app')}</a>
          <button type="button" className="ak-btn ak-btn--ghost" onClick={() => void signOut()}>{t('Sign out')}</button>
        </Gate>
      </Frame>
    );
  if (!me.totpOn || !me.verified) return <Frame signedOut><TwoStep me={me} onDone={() => void load()} /></Frame>;

  return (
    <AdminCtx.Provider value={ctx!}>
      <Frame path={path}>
        <Suspense fallback={<div className="ak-stack"><ak-placeholder kind="list" rows="6" /></div>}>
          <div className="s2k-route" key={path}>{route(path)}</div>
        </Suspense>
      </Frame>
    </AdminCtx.Provider>
  );
}

/** The kit's frame. The sidebar is drawn once from its template; on each page only aria-current moves. */
function Frame({ path, signedOut, children }: { path?: string; signedOut?: boolean; children: ReactNode }) {
  const side = useRef<HTMLElement & { refresh?: () => void }>(null);
  // The first page's link is marked in the template itself: the kit reads it while building the sidebar.
  const first = useRef(path);
  const html = useMemo(() => sidebarHtml(`<img class="s2k-mark" src="/favicon.svg" alt=""><span class="s2k-word">sprint<b>2</b>go</span>`, first.current === undefined ? null : navIdOf(first.current)), []);
  useLayoutEffect(() => {
    const s = side.current;
    if (!s || path === undefined || path === first.current) return;
    const id = navIdOf(path);
    s.querySelectorAll<HTMLAnchorElement>('a[data-nav]').forEach((a) => (a.dataset.nav === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    // refresh() throws if the kit has not built the sidebar yet (kit-requests.md); it has by the first click.
    try {
      s.refresh?.();
    } catch {
      /* not built yet: it reads aria-current itself when it builds */
    }
  }, [path]);
  useEffect(() => {
    window.AdminKit?.command.add([{ group: t('Account'), label: t('Sign out'), run: () => void signOut() }]);
  }, []);
  return (
    <ak-frame data-ak-locale="id-ID" menu-label={t('Menu')} {...(signedOut ? { 'signed-out': '' } : {})}>
      {!signedOut && <ak-sidebar ref={side} dangerouslySetInnerHTML={{ __html: html }} />}
      <ak-page>{children}</ak-page>
    </ak-frame>
  );
}

function Gate({ title, text, children }: { title: string; text: ReactNode; children: ReactNode }) {
  return (
    <div className="s2k-gate">
      <span className="s2k-brand"><img className="s2k-mark s2k-mark--big" src="/favicon.svg" alt="" /><span className="s2k-word s2k-word--big">sprint<b>2</b>go</span></span>
      <section className="ak-card s2k-gate__card">
        <div className="ak-card__body ak-stack">
          <h1>{title}</h1>
          <p className="ak-muted">{text}</p>
          {children}
        </div>
      </section>
    </div>
  );
}

/** Two-step sign-in: set it up the first time, then a code every 12 hours. */
function TwoStep({ me, onDone }: { me: FullMe; onDone: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!me.totpOn) post('2fa/setup').then(setSetup, (e: Error) => setError(e.message));
  }, [me.totpOn]);
  const ok = code.replace(/\D/g, '').length === 6;
  return (
    <Gate
      title={me.totpOn ? t('Your 2FA code') : t('Turn on two-step sign-in')}
      text={me.totpOn ? t('Open your authenticator app and enter the code for sprint2go ({email}). It is asked again every 12 hours.', { email: me.email }) : t('The console can see and change every company, so it needs a second step. Scan this with any authenticator app, then enter the code it shows.')}
    >
      {!me.totpOn && <div className="s2k-qr">{setup ? <img src={setup.qr} alt={t('QR code for your authenticator app')} width={180} height={180} /> : <ak-loader />}</div>}
      {setup && <p className="ak-muted">{t('Cannot scan? Enter this key:')} <code className="s2k-mono">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code></p>}
      <form
        className="ak-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          setBusy(true);
          setError(null);
          post('2fa/verify', { code })
            .then(onDone)
            .catch((e: ApiError) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <div className="ak-field">
          <label htmlFor="s2k-code">{t('Six-digit code')}</label>
          <input id="s2k-code" className="ak-input s2k-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} placeholder="123 456" autoFocus />
        </div>
        {error && <div className="ak-banner" data-tone="danger"><div>{error}</div></div>}
        <button className="ak-btn ak-btn--primary" disabled={busy || !ok}>{busy ? t('Checking…') : t('Continue')}</button>
      </form>
      <button type="button" className="ak-btn ak-btn--ghost" onClick={() => void signOut()}>{t('Sign out')}</button>
    </Gate>
  );
}
