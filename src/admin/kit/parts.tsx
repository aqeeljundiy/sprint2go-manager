// Small React wrappers around the kit's parts, so every v2 page is built the same way. No look here: the kit and
// the theme (public/admin-v2/admin-theme.css) draw everything.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AkList, AkListOptions } from './kit';
import { t } from '../../i18n';

/** The title block every page shares: one h1, one summary line, actions on the right (main action last). */
export function Page({ title, sub, actions, children, tabTitle }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; tabTitle?: string }) {
  useEffect(() => {
    document.title = `${tabTitle ?? (typeof title === 'string' ? title : t('Console'))} · sprint2go operators`;
  }, [title, tabTitle]);
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

export function Card({ title, aside, children, id, flush }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; id?: string; flush?: boolean }) {
  return (
    <section className="ak-card" id={id}>
      {title && (
        <div className="ak-card__head">
          <h2>{title}</h2>
          {aside}
        </div>
      )}
      {flush ? children : <div className="ak-card__body">{children}</div>}
    </section>
  );
}

export type Tone = 'success' | 'warn' | 'danger' | 'info' | 'neutral';
export const Chip = ({ tone = 'neutral', children, plain }: { tone?: Tone; children: ReactNode; plain?: boolean }) => (
  <ak-chip tone={tone} {...(plain ? { plain: '' } : {})}>
    {children}
  </ak-chip>
);

/** Segmented view switch inside one page (never links to other pages). */
export function Tabs<T extends string>({ id, value, items, onChange }: { id: string; value: T; items: { id: T; label: string; count?: number }[]; onChange: (v: T) => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    const on = (e: Event) => onChange((e as CustomEvent).detail.value as T);
    el?.addEventListener('change', on);
    return () => el?.removeEventListener('change', on);
  }, [onChange]);
  return (
    <ak-tabs id={id} ref={ref}>
      {items.map((i) => (
        <button key={i.id} type="button" data-value={i.id} aria-selected={i.id === value ? 'true' : 'false'}>
          {i.label}
          {i.count ? <span className="ak-count">{i.count}</span> : null}
        </button>
      ))}
    </ak-tabs>
  );
}

/** An ak-select dropdown whose change comes back to React. */
export function Dropdown({ value, options, onChange, label, block, disabled }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; label: string; block?: boolean; disabled?: boolean }) {
  const ref = useRef<HTMLElement & { value: string; options: unknown }>(null);
  useLayoutEffect(() => {
    if (ref.current) (ref.current.options = options), (ref.current.value = value);
  }, [options, value]);
  useEffect(() => {
    const el = ref.current;
    const on = (e: Event) => onChange((e as CustomEvent).detail.value);
    el?.addEventListener('change', on);
    return () => el?.removeEventListener('change', on);
  }, [onChange]);
  return <ak-select ref={ref} label={label} {...(block ? { block: '' } : {})} {...(disabled ? { disabled: '' } : {})} />;
}

/** A side panel (or with side="center" a centered window). Content is drawn into the kit's own sheet. */
export function Drawer({ open, onClose, heading, side, children }: { open: boolean; onClose: () => void; heading: string; side?: 'center' | 'right'; children: ReactNode }) {
  const ref = useRef<HTMLElement & { content: HTMLElement; show: () => void; hide: () => void }>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setHost(ref.current?.content ?? null), []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) el.show();
    else el.hide();
  }, [open]);
  useEffect(() => {
    const el = ref.current;
    const on = () => onClose();
    el?.addEventListener('close', on);
    return () => el?.removeEventListener('close', on);
  }, [onClose]);
  return (
    <>
      <ak-drawer ref={ref} heading={heading} {...(side ? { side } : {})} />
      {host && createPortal(children, host)}
    </>
  );
}

/** A button that opens a list of actions. Items are plain buttons; the kit clicks the original. */
export function Menu({ label, items, trigger }: { label: string; trigger?: ReactNode; items: ({ label: string; run: () => void; danger?: boolean } | 'divider' | null | false | undefined | '')[] }) {
  return (
    <ak-menu label={label} align="end" trigger-class={trigger ? 'ak-btn ak-btn--ghost ak-btn--icon' : 'ak-btn'}>
      {trigger && <span slot="trigger">{trigger}</span>}
      {items.map((i, n) => (!i ? null : i === 'divider' ? <hr key={n} /> : <button key={n} type="button" onClick={i.run} {...(i.danger ? { 'data-tone': 'danger' } : {})}>{i.label}</button>))}
    </ak-menu>
  );
}

/** The kit's list page (views, search, filters, sort, paging, all in the address) on a card React does not touch inside. */
export function useKitList<T>(options: () => AkListOptions<T>, rows: T[] | null) {
  const host = useRef<HTMLElement>(null);
  const list = useRef<AkList<T> | null>(null);
  useEffect(() => {
    if (!host.current || list.current) return;
    list.current = window.AdminKit.list(host.current, options());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (rows && list.current) list.current.setRows(rows);
  }, [rows]);
  const el = (
    <section className="ak-card" ref={host}>
      <ak-placeholder kind="list" rows="6" />
    </section>
  );
  return { el, list };
}

/** A ready-to-use failure box. */
export const Failed = ({ error, retry }: { error: string; retry?: () => void }) => (
  <div className="ak-banner" data-tone="danger">
    <div>
      <strong>{t('This did not load')}</strong>
      {error}
    </div>
    {retry && <button className="ak-btn" type="button" onClick={retry}>{t('Try again')}</button>}
  </div>
);

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
