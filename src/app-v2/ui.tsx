// The customer app v2's small helpers on top of the kit wrappers the console already has (src/admin/kit/parts.tsx).
// No look here: the kit and public/app-v2/app-theme.css draw everything.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { t } from '../i18n';
import { fmtDate, fmtTime } from '../i18n/format';

const day = (d: Date) => fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' });
export { Card, Chip, Tabs, Drawer, Menu, Dropdown, useKitList, esc, type Tone } from '../admin/kit/parts';

/** Where the v2 app lives. v1 stays at / as the backup. */
export const BASE = '/v2';

export interface V2Ctx {
  go: (to: string) => void;
  toast: (text: string, o?: { description?: string; action?: { label: string; onClick: () => void } }) => void;
  /** Words for the app's own suffix in the tab title: the company's name (or the guest's portal). */
  where: string;
}
export const V2 = createContext<V2Ctx>({ go: () => {}, toast: () => {}, where: 'sprint2go' });
export const useV2 = () => useContext(V2);

/** The title block every page shares: one h1, one summary line, actions on the right (main action last). */
export function Page({ title, sub, actions, children }: { title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const { where } = useV2();
  useEffect(() => {
    document.title = `${title} · ${where}`;
  }, [title, where]);
  return (
    <>
      <header className="ak-page-head">
        <div>
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {actions && <div className="ak-actions">{actions}</div>}
      </header>
      <div className="ak-stack">{children}</div>
    </>
  );
}

/** One date field (ak-date), its change back to React. */
export function DateField({ value, onChange, label, clearable }: { value: string; onChange: (v: string) => void; label: string; clearable?: boolean }) {
  const ref = useRef<HTMLElement & { value: string }>(null);
  useLayoutEffect(() => {
    if (ref.current && ref.current.value !== value) ref.current.value = value;
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    const on = (e: Event) => onChange((e as CustomEvent).detail.value ?? '');
    el?.addEventListener('change', on);
    return () => el?.removeEventListener('change', on);
  }, [onChange]);
  return <ak-date ref={ref} label={label} block="" {...(clearable ? { clearable: '', 'clear-label': t('No date') } : {})} />;
}

/** "Today 14:00", "Thu 13 Nov", for rows. */
export function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const today = new Date().toDateString() === d.toDateString();
  return today ? `${t('Today')} ${fmtTime(d)}` : day(d);
}
export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const uid = () => Math.random().toString(36).slice(2, 10);

/** A plain empty state inside a card: what is missing and what to do. */
export const Empty = ({ title, text, children }: { title: string; text?: string; children?: ReactNode }) => (
  <div className="s2a-empty">
    <strong>{title}</strong>
    {text && <p className="ak-muted">{text}</p>}
    {children}
  </div>
);

/** A link to the same screen in the app at / (v1). Used where v2 has no writing tool of its own yet (docs/admin-kit-v2-app-queue.md). */
export const InV1 = ({ to, children }: { to: string; children: ReactNode }) => (
  <a className="ak-btn" href={to}>
    {children}
  </a>
);
