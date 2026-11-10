import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, Copy, Search, X } from 'lucide-react';
import { SmoothHeight } from '../../components/ui/Smooth';
import { Popover } from '../../components/ui/Popover';
import { Select } from '../../components/ui/Select';
import { get, type Perm } from './api';
import { Avatar } from '../../components/Avatar';
import { Badge as UiBadge, PersonCell } from '../../components/ui/Person';
import { EmptyState } from '../../components/ui/EmptyState';
import { Layer } from '../../components/ui/Layer';
import { t, tn } from '../../i18n';

/* ---------- the backend's shared state ---------- */

export interface Me {
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'support' | 'finance' | 'readonly';
  perms: Perm[];
  supportEmail: string;
}
export interface Ctx {
  me: Me;
  may: (p: Perm) => boolean;
  go: (to: string) => void;
  toast: (text: string, action?: { label: string; run: () => void }) => void;
  signInAs: (userId: string, ticket?: number) => void;
  /** Bumped after changes so lists elsewhere reload (e.g. the ticket count in the nav). */
  tick: number;
  bump: () => void;
}
export const AdminCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAdmin = () => useContext(AdminCtx);

/** Loads one admin endpoint; reloads when `deps` or the shared tick change, and every `poll` ms when asked. */
export function useApi<T>(path: string | null, deps: unknown[] = [], poll?: number) {
  const { tick } = useAdmin();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let on = true;
    get<T>(path).then(
      (d) => on && (setData(d), setError(null)),
      (e: Error) => on && setError(e.message),
    );
    return () => {
      on = false;
    };
  }, [path, tick, n, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!poll) return;
    const t = setInterval(() => document.visibilityState === 'visible' && setN((x) => x + 1), poll);
    return () => clearInterval(t);
  }, [poll]);
  return { data, error, reload: () => setN((x) => x + 1), setData };
}

/** Runs a change, then toasts and reloads; errors become a toast too. */
export function useAct() {
  const { toast, bump } = useAdmin();
  return async (run: () => Promise<unknown>, done?: string) => {
    try {
      await run();
      if (done) toast(done);
      bump();
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Something went wrong.'));
      return false;
    }
  };
}

/* ---------- layout ---------- */

export function Page({ title, sub, actions, children, back, wide }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; back?: { label: string; to: string }; wide?: boolean }) {
  const { go } = useAdmin();
  return (
    <div className={`a2-page ${wide ? 'wide' : ''}`}>
      {back && (
        <button type="button" className="a2-back" onClick={() => go(back.to)}>
          <ArrowLeft size={16} />
          <span>{back.label}</span>
        </button>
      )}
      <header className="a2-head">
        <div className="a2-head-text">
          <h1 tabIndex={-1}>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {actions && <div className="a2-head-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
export function Section({ title, actions, children, hint }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className="a2-section">
      {(title || actions) && (
        <div className="a2-section-head">
          {title && <h2>{title}</h2>}
          {hint && <span className="a2-hint">{hint}</span>}
          {actions && <div className="a2-section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
export function Tabs<T extends string>({ value, items, onChange }: { value: T; items: { id: T; label: ReactNode; count?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="a2-tabs" role="tablist">
      {items.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count ? <span className="a2-count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ---------- numbers ---------- */

export function Stats({ children }: { children: ReactNode }) {
  return <div className="a2-stats">{children}</div>;
}
/** A number with what it means: a trend against before, and whether up is good. */
export function Stat({ label, value, hint, delta, onClick, tone, i = 0 }: { label: string; value: ReactNode; hint?: ReactNode; delta?: { text: string; dir: 'up' | 'down' | 'flat'; good: boolean } | null; onClick?: () => void; tone?: 'warn' | 'bad'; i?: number }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`a2-stat ${tone ?? ''} ${onClick ? 'click' : ''}`} onClick={onClick} style={{ ['--i' as string]: i }}>
      <span className="a2-stat-label">{label}</span>
      <b>{value}</b>
      {(delta || hint) && (
        <span className="a2-stat-foot">
          {delta && delta.dir !== 'flat' && (
            <span className={`a2-delta ${delta.good ? 'good' : 'bad'}`}>
              {delta.dir === 'up' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
              {delta.text}
            </span>
          )}
          {hint && <span className="a2-stat-hint">{hint}</span>}
        </span>
      )}
    </Tag>
  );
}
export function deltaOf(now: number, before: number | null | undefined, upIsGood = true, fmt: (n: number) => string = (n) => `${n}`) {
  if (before === null || before === undefined) return null;
  const diff = now - before;
  if (!diff) return { text: t('same as before'), dir: 'flat' as const, good: true };
  const pct = before ? Math.round((Math.abs(diff) / before) * 100) : null;
  return { text: pct !== null && pct < 1000 ? `${pct}%` : fmt(Math.abs(diff)), dir: diff > 0 ? ('up' as const) : ('down' as const), good: diff > 0 === upIsGood };
}

/* ---------- small parts ---------- */

/** The app's own pill (components/ui/Person.tsx): the console and the app share one look. */
export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' | 'info'; children: ReactNode }) {
  return <UiBadge tone={tone}>{children}</UiBadge>;
}
export function HealthPill({ h }: { h: { score: number; label: string } }) {
  return (
    <span className={`a2-health ${h.label}`} title={t('Health {score} of 100', { score: h.score })}>
      <span className="a2-health-track">
        <i style={{ width: `${Math.max(6, h.score)}%` }} />
      </span>
      <em>{h.score}</em>
    </span>
  );
}
export function Dot({ color }: { color: string }) {
  return <i className="a2-dot" style={{ background: color }} />;
}
/** A face for someone with no photo here: the app's avatar, in their colour. */
export function Initials({ name, color, size = 28, email }: { name: string; color?: string | null; size?: number; email?: string }) {
  return <Avatar person={{ name, email: email ?? name, color: color || undefined }} size={size} />;
}
/** Someone in a table: the app's person cell (avatar centred on name and email, badges as pills on the name's line). */
export function Who({ name, email, color, badges, sub }: { name: string; email?: string; color?: string | null; badges?: ReactNode; sub?: ReactNode | null }) {
  return <PersonCell person={{ name, email, color }} badges={badges} sub={sub} />;
}
/** An empty list: the app's empty state (title, a line on what to do, the action). */
export function Empty({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return <EmptyState className="a2-empty-state" icon={icon} title={title} text={text} action={action} />;
}
export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="a2-skel" role="status" aria-label={t('Loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} style={{ ['--i' as string]: i }} />
      ))}
    </div>
  );
}
export function Failed({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <Empty
      title={t('Couldn’t load this')}
      text={error}
      action={
        retry && (
          <button className="ghost-btn sm" onClick={retry}>
            {t('Try again')}
          </button>
        )
      }
    />
  );
}
export function CopyBtn({ text, label = t('Copy'), iconOnly }: { text: string; label?: string; iconOnly?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={iconOnly ? 'icon-btn sm' : 'ghost-btn sm'}
      title={label}
      aria-label={label}
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check size={13} /> : <Copy size={13} />}
      {!iconOnly && ` ${done ? t('Copied') : label}`}
    </button>
  );
}
export function KV({ items }: { items: { k: ReactNode; v: ReactNode }[] }) {
  return (
    <dl className="a2-kv">
      {items.map((x, i) => (
        <div key={i}>
          <dt>{x.k}</dt>
          <dd>{x.v}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`a2-field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Switch({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <div className="a2-switch-row">
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
        <span />
      </button>
    </div>
  );
}

/** A small menu next to a button (more actions). Becomes a bottom sheet on phones. */
export function Menu({ label, items, icon, align = 'end' }: { label: ReactNode; icon?: ReactNode; align?: 'start' | 'end'; items: ({ label: string; run: () => void; danger?: boolean; hint?: string } | null | false)[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const list = items.filter(Boolean) as { label: string; run: () => void; danger?: boolean; hint?: string }[];
  if (!list.length) return null;
  return (
    <>
      <button ref={ref} type="button" className="ghost-btn sm" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {icon}
        {label}
        <ChevronDown size={13} className={`rot-chev ${open ? 'open' : ''}`} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={240} align={align} title={typeof label === 'string' ? label : t('Actions')}>
        <div className="a2-menu" role="menu">
          {list.map((x) => (
            <button
              key={x.label}
              type="button"
              role="menuitem"
              className={x.danger ? 'danger' : ''}
              onClick={() => {
                setOpen(false);
                x.run();
              }}
            >
              <span>{x.label}</span>
              {x.hint && <small>{x.hint}</small>}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

/** A rupiah amount shown with thousands dots (2.499.000), typed as plain digits. */
export function MoneyInput({ value, onChange, disabled, label }: { value: number; onChange: (v: number) => void; disabled?: boolean; label?: string }) {
  return (
    <input
      className="a2-money"
      inputMode="numeric"
      value={value ? value.toLocaleString('id-ID') : '0'}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
    />
  );
}

/* ---------- dialogs ---------- */

export function Dialog({ title, onClose, children, foot, size = 'md' }: { title: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <Layer>
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className={`modal a2-modal ${size}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : t('Dialog')} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <span className="dump-title">{title}</span>
          <button className="icon-btn sm" onClick={onClose} aria-label={t('Close')}>
            <X size={15} />
          </button>
        </header>
        <div className="modal-body">
          <SmoothHeight>{children}</SmoothHeight>
        </div>
        {foot && <footer className="modal-foot">{foot}</footer>}
      </div>
    </div>
    </Layer>
  );
}

/** Why a company left: the label is read when it's shown, in the console's language. */
export const WHY = [
  { value: 'unpaid', get label() { return t('Didn’t pay'); } },
  { value: 'price', get label() { return t('Too expensive'); } },
  { value: 'features', get label() { return t('Missing features'); } },
  { value: 'competitor', get label() { return t('Moved to another tool'); } },
  { value: 'closed', get label() { return t('Business closed'); } },
  { value: 'abuse', get label() { return t('Abuse or spam'); } },
  { value: 'test', get label() { return t('Test or duplicate'); } },
  { value: 'other', get label() { return t('Something else'); } },
];

/** Asks before something that matters: a reason (with why, for churn), or a typed word for what can't be undone. */
export function Confirm({ title, text, action, danger, word, reason, why, onClose, onConfirm }: { title: string; text: ReactNode; action: string; danger?: boolean; word?: string; reason?: string; why?: boolean; onClose: () => void; onConfirm: (v: { reason: string; why: string }) => Promise<unknown> }) {
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const [w, setW] = useState(why ? '' : 'other');
  const [busy, setBusy] = useState(false);
  const ok = (!word || typed === word) && (!why || !!w);
  return (
    <Dialog
      title={title}
      size="sm"
      onClose={onClose}
      foot={
        <>
          <button className="ghost-btn" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            className={danger ? 'primary-btn danger-btn' : 'primary-btn'}
            disabled={busy || !ok}
            onClick={() => {
              setBusy(true);
              void onConfirm({ reason: note, why: w }).finally(() => setBusy(false));
            }}
          >
            {action}
          </button>
        </>
      }
    >
      <div className="a2-form">
        <p className="a2-dialog-text">{text}</p>
        {why && (
          <Field label={t('Why')}>
            <Select value={w || null} placeholder={t('Pick a reason')} options={WHY.map((x) => ({ value: x.value, label: x.label }))} onChange={setW} label={t('Why')} />
          </Field>
        )}
        {reason !== undefined && (
          <Field label={reason}>
            <input value={note} onChange={(e) => setNote(e.target.value)} autoFocus={!word && !why} />
          </Field>
        )}
        {word && (
          <Field label={t('Type {word} to confirm', { word })}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

/* ---------- the table every list uses ---------- */

export interface Col<T> {
  key: string;
  label: string;
  render: (r: T) => ReactNode;
  sort?: (r: T) => string | number;
  width?: string; // a grid column, e.g. '2fr' or '120px'
  align?: 'right';
  hide?: 'phone' | 'tablet'; // gone below this width
}
export interface View<T> {
  id: string;
  label: string;
  test: (r: T) => boolean;
}

/** Reads and writes one table's state in the URL (?<id>.view=…&<id>.sort=…&<id>.q=…&<id>.page=…), so a filtered list can be shared and Back works. */
function useUrlState(id: string) {
  const read = () => {
    const u = new URLSearchParams(location.search);
    const g = (k: string) => u.get(`${id}.${k}`);
    return { view: g('view'), sort: g('sort'), q: g('q') ?? '', page: Math.max(1, Number(g('page')) || 1) };
  };
  const [st, setSt] = useState(read);
  useEffect(() => {
    const pop = () => setSt(read());
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const write = (next: Partial<{ view: string | null; sort: string | null; q: string; page: number }>) => {
    const merged = { ...st, ...next };
    setSt(merged);
    const u = new URLSearchParams(location.search);
    const put = (k: string, v: string | null | undefined) => (v ? u.set(`${id}.${k}`, v) : u.delete(`${id}.${k}`));
    put('view', merged.view);
    put('sort', merged.sort);
    put('q', merged.q || null);
    put('page', merged.page > 1 ? String(merged.page) : null);
    const qs = u.toString();
    history.replaceState(history.state, '', location.pathname + (qs ? `?${qs}` : ''));
  };
  return [st, write] as const;
}
export const PAGE_SIZE = 25;

/**
 * The list every screen uses: views (filters with counts), search, sort, row selection with bulk actions, and pages of
 * 25. Its state lives in the URL, prefixed with the table's id.
 */
export function Table<T>({ id, rows, cols, rowKey, onOpen, views, search, bulk, empty, initialSort, dense, rowTone }: { id: string; rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; onOpen?: (r: T) => void; views?: View<T>[]; search?: (r: T) => string; bulk?: (sel: T[], clear: () => void) => ReactNode; empty?: { title: string; text?: string; action?: ReactNode }; initialSort?: { key: string; dir: 1 | -1 }; dense?: boolean; rowTone?: (r: T) => string | undefined }) {
  const [url, setUrl] = useUrlState(id);
  const firstWithRows = (views?.find((v) => rows.some(v.test)) ?? views?.[0])?.id ?? '';
  const view = url.view && views?.some((v) => v.id === url.view) ? url.view : firstWithRows;
  const sort = url.sort ? { key: url.sort.replace(/^-/, ''), dir: (url.sort.startsWith('-') ? -1 : 1) as 1 | -1 } : initialSort ?? null;
  const q = url.q;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const clear = () => setSel(new Set());
  useEffect(() => {
    if (!sel.size) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.modal-scrim, .pop') && clear();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [sel.size]);
  const v = views?.find((x) => x.id === view);
  const counted = views?.map((x) => ({ ...x, n: rows.filter(x.test).length }));
  let shown = v ? rows.filter(v.test) : rows;
  if (q && search) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    shown = shown.filter((r) => words.every((w) => search(r).toLowerCase().includes(w)));
  }
  if (sort) {
    const c = cols.find((x) => x.key === sort.key);
    if (c?.sort)
      shown = [...shown].sort((a, b) => {
        const x = c.sort!(a), y = c.sort!(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const page = Math.min(url.page, pages);
  const from = (page - 1) * PAGE_SIZE;
  const slice = shown.slice(from, from + PAGE_SIZE);
  const selected = shown.filter((r) => sel.has(rowKey(r)));
  const template = [bulk ? '40px' : null, ...cols.map((c) => c.width ?? '1fr')].filter(Boolean).join(' ');
  const templateT = [bulk ? '40px' : null, ...cols.filter((c) => c.hide !== 'tablet').map((c) => c.width ?? '1fr')].filter(Boolean).join(' ');
  const allOn = slice.length > 0 && slice.every((r) => sel.has(rowKey(r)));
  const filtered = !!q || (view !== firstWithRows && rows.length > 0);
  // Saved views: a named mix of view, filter words and sort, kept per table on this device.
  const savedKey = `s2g-adm2-saved:${id}`;
  const [saved, setSaved] = useState<{ name: string; view: string; q: string; sort: string }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(savedKey) ?? '[]');
    } catch {
      return [];
    }
  });
  const keepSaved = (list: typeof saved) => {
    setSaved(list);
    try {
      localStorage.setItem(savedKey, JSON.stringify(list));
    } catch {
      /* private window */
    }
  };
  const sortStr = sort ? (sort.dir === -1 ? '-' : '') + sort.key : '';
  const activeSaved = saved.find((x) => x.view === view && x.q === q && x.sort === sortStr)?.name;
  return (
    <div className="a2-table-wrap">
      {(views || search) && (saved.length > 0 || filtered) && (
        <div className="ab-saved" aria-label={t('Saved views')}>
          <span>{t('Saved views')}</span>
          {saved.map((x) => (
            <button key={x.name} type="button" className={activeSaved === x.name ? 'on' : ''} onClick={() => (setUrl({ view: x.view, q: x.q, sort: x.sort || null, page: 1 }), clear())} onContextMenu={(e) => (e.preventDefault(), keepSaved(saved.filter((y) => y.name !== x.name)))} title={t('Right-click to remove')}>
              {x.name}
            </button>
          ))}
          {filtered && !activeSaved && (
            <button
              type="button"
              onClick={() => {
                const name = `${v?.label ?? t('All')}${q ? ` · ${q}` : ''}`;
                keepSaved([...saved.filter((y) => y.name !== name), { name, view, q, sort: sortStr }]);
              }}
            >
              + {t('Save this view')}
            </button>
          )}
        </div>
      )}
      {(views || search) && (
        <div className="a2-table-bar">
          {counted && (
            <div className="a2-views" role="tablist" aria-label={t('Views')}>
              {counted.map((x) => (
                <button key={x.id} type="button" role="tab" aria-selected={view === x.id} className={view === x.id ? 'on' : ''} onClick={() => (setUrl({ view: x.id, page: 1 }), clear())}>
                  <span>{x.label}</span>
                  <span className="a2-count">{x.n}</span>
                </button>
              ))}
            </div>
          )}
          {search && (
            <label className="a2-search">
              <Search size={16} />
              <input value={q} onChange={(e) => setUrl({ q: e.target.value, page: 1 })} placeholder={t('Filter')} aria-label={t('Filter')} />
              {q && (
                <button type="button" className="a2-icon-btn" onClick={() => setUrl({ q: '', page: 1 })} aria-label={t('Clear')}>
                  <X size={14} />
                </button>
              )}
            </label>
          )}
        </div>
      )}
      <div className="a2-sr" aria-live="polite">{selected.length ? tn(selected.length, '{n} selected', '{n} selected') : ''}</div>
      <SmoothHeight>
        {bulk && selected.length > 0 && (
          <div className="a2-bulk">
            <strong>{tn(selected.length, '{n} selected', '{n} selected')}</strong>
            <span className="a2-bulk-acts">{bulk(selected, clear)}</span>
            <button type="button" className="ghost-btn sm" onClick={clear}>
              {t('Clear')}
            </button>
          </div>
        )}
      </SmoothHeight>
      {shown.length === 0 ? (
        filtered ? (
          <Empty
            title={t('Nothing matches')}
            text={q ? t('Try fewer words.') : empty?.title}
            action={
              <button type="button" className="ghost-btn sm" onClick={() => setUrl({ q: '', view: null, page: 1 })}>
                {t('Clear filters')}
              </button>
            }
          />
        ) : (
          <Empty title={empty?.title ?? t('Nothing here')} text={empty?.text} action={empty?.action} />
        )
      ) : (
        <>
          <div className={`a2-table ${dense ? 'dense' : ''}`} role="table" style={{ ['--cols' as string]: template, ['--cols-t' as string]: templateT }}>
            <div className="a2-tr head" role="row">
              {bulk && (
                <label className="a2-check">
                  <input type="checkbox" aria-label={t('Select all')} checked={allOn} onChange={() => setSel((s) => {
                    const n = new Set(s);
                    slice.forEach((r) => (allOn ? n.delete(rowKey(r)) : n.add(rowKey(r))));
                    return n;
                  })} />
                </label>
              )}
              {cols.map((c) => (
                <span key={c.key} role="columnheader" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined} className={`${c.align === 'right' ? 'r' : ''} ${c.hide ? `hide-${c.hide}` : ''}`}>
                  {c.sort ? (
                    <button type="button" className={`a2-sort ${sort?.key === c.key ? 'on' : ''}`} onClick={() => setUrl({ sort: sort?.key === c.key ? (sort.dir === 1 ? `-${c.key}` : c.key) : `-${c.key}`, page: 1 })}>
                      {c.label}
                      {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  ) : (
                    c.label
                  )}
                </span>
              ))}
            </div>
            {slice.map((r) => {
              const k = rowKey(r);
              return (
                <div key={k} role="row" className={`a2-tr ${onOpen ? 'click' : ''} ${sel.has(k) ? 'sel' : ''} ${rowTone?.(r) ?? ''}`} onClick={(e) => onOpen && !(e.target as HTMLElement).closest('button, a, input, .a2-check') && onOpen(r)} tabIndex={onOpen ? 0 : undefined} onKeyDown={(e) => onOpen && e.key === 'Enter' && e.target === e.currentTarget && onOpen(r)}>
                  {bulk && (
                    <label className="a2-check">
                      <input type="checkbox" aria-label={t('Select')} checked={sel.has(k)} onChange={() => setSel((s) => {
                        const n = new Set(s);
                        n.has(k) ? n.delete(k) : n.add(k);
                        return n;
                      })} />
                    </label>
                  )}
                  {cols.map((c, ci) => (
                    <span key={c.key} role="cell" className={`${ci === 0 ? 'first' : ''} ${c.align === 'right' ? 'r' : ''} ${c.hide ? `hide-${c.hide}` : ''}`} data-label={c.label}>
                      {c.render(r)}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="a2-pager">
            <span className="a2-pager-text">{t('{from}-{to} of {n}', { from: from + 1, to: from + slice.length, n: shown.length })}</span>
            {pages > 1 && (
              <span className="a2-pager-acts">
                <button type="button" className="ghost-btn sm" disabled={page <= 1} onClick={() => setUrl({ page: page - 1 })}>
                  {t('Previous')}
                </button>
                <button type="button" className="ghost-btn sm" disabled={page >= pages} onClick={() => setUrl({ page: page + 1 })}>
                  {t('Next')}
                </button>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- charts (plain bars, no library) ---------- */

export function Bars({ data, height = 120, fmt = (n: number) => String(n) }: { data: { label: string; parts: { value: number; tone: 'accent' | 'good' | 'warn' | 'bad' | 'muted'; name: string }[] }[]; height?: number; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.parts.reduce((n, p) => n + Math.max(0, p.value), 0)));
  return (
    <div className="a2-bars" style={{ ['--h' as string]: `${height}px` }}>
      {data.map((d) => {
        const total = d.parts.reduce((n, p) => n + Math.max(0, p.value), 0);
        return (
          <div key={d.label} className="a2-bar-col" title={`${d.label}: ${d.parts.map((p) => `${p.name} ${fmt(p.value)}`).join(', ')}`}>
            <div className="a2-bar-stack">
              {d.parts.map((p) => (
                <span key={p.name} className={p.tone} style={{ height: `${(Math.max(0, p.value) / max) * 100}%` }} />
              ))}
            </div>
            <small>{d.label}</small>
            <em>{total ? fmt(total) : ''}</em>
          </div>
        );
      })}
    </div>
  );
}
export function Legend({ items }: { items: { tone: string; name: string }[] }) {
  return (
    <div className="a2-legend">
      {items.map((i) => (
        <span key={i.name}>
          <i className={i.tone} /> {i.name}
        </span>
      ))}
    </div>
  );
}
