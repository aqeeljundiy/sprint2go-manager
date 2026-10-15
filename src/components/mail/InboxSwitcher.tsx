// Mail's inbox picker (desktop sidebar): one button that says which inbox you're looking at, opening a list of All
// inboxes, each mailbox (unread and any problem under it), the temporary addresses, and the ways to add one.
// It replaced a long list of every address under "Inboxes" (Gmail's account picker, Superhuman's split switcher).
import { useRef } from 'react';
import { ChevronsUpDown, Inbox, Layers, MoreHorizontal, Plus, Timer, UserRoundCheck, Users, type LucideIcon } from 'lucide-react';
import type { Account } from '../../types';
import type { MailState } from '../../mailStatus';
import { useActionMenu } from '../ui/ActionSheet';
import { lifeLeft } from '../TempAddress';
import { usePhone } from '../../mobile/media';
import { t, tn } from '../../i18n';

export function InboxSwitcher(p: {
  accounts: Account[];
  active: string; // 'all' or an account id
  unread: Record<string, number>;
  state?: Record<string, MailState>;
  delegated?: Set<string>;
  brandColor?: (email: string) => string | undefined;
  onPick: (id: string) => void;
  onNewTemp?: () => void;
  onAddAccount?: () => void;
  onTempMenu?: (a: Account, anchor: HTMLElement) => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const phone = usePhone();
  const more = useRef<HTMLButtonElement>(null);
  const boxes = p.accounts.filter((a) => !a.temp);
  const temps = p.accounts.filter((a) => a.temp);
  const iconOf = (a: Account): LucideIcon => (a.temp ? Timer : a.kind === 'shared' ? Users : p.delegated?.has(a.id) ? UserRoundCheck : Inbox);
  const subOf = (a: Account) => {
    const bad = p.state?.[a.id] && !p.state[a.id].ok ? p.state[a.id].label : null;
    const n = p.unread[a.id] ?? 0;
    return [a.temp ? lifeLeft(a) : p.delegated?.has(a.id) ? t('Delegated to you') : a.kind === 'shared' ? t('Shared inbox') : null, bad, n ? tn(n, '{n} unread', '{n} unread') : null].filter(Boolean).join(' · ');
  };
  const many = boxes.length > 1 || temps.length > 0;
  const menu = useActionMenu(
    () => [
      ...(many ? [{ label: t('All inboxes'), icon: Layers, hint: p.unread.all ? tn(p.unread.all, '{n} unread', '{n} unread') : undefined, checked: p.active === 'all', run: () => p.onPick('all') }] : []),
      ...boxes.map((a) => ({ label: a.email, icon: iconOf(a), hint: subOf(a) || undefined, checked: p.active === a.id, group: 'boxes', run: () => p.onPick(a.id) })),
      ...temps.map((a) => ({ label: a.email, icon: Timer, hint: subOf(a) || undefined, checked: p.active === a.id, group: 'temp', run: () => p.onPick(a.id) })),
      ...(p.onNewTemp ? [{ label: t('New temporary address'), icon: Plus, hint: t('Made in seconds, deleted by itself'), group: 'add', run: p.onNewTemp }] : []),
      ...(p.onAddAccount ? [{ label: t('Add an email address'), icon: Plus, group: 'add', run: p.onAddAccount }] : []),
    ],
    // A menu by the button on computers; a sheet from the bottom on phones.
    { menu: !phone, className: 'inbox-switch-menu', title: t('Inboxes') },
  );
  const cur = p.accounts.find((a) => a.id === p.active);
  const Icon = cur ? iconOf(cur) : Layers;
  const name = cur ? cur.email : t('All inboxes');
  const sub = cur ? subOf(cur) : p.unread.all ? tn(p.unread.all, '{n} unread', '{n} unread') : tn(boxes.length, '{n} inbox', '{n} inboxes');
  return (
    <div className="inbox-switch">
      <button ref={btn} type="button" className="inbox-switch-btn" onClick={() => menu.openFrom(btn)} aria-haspopup="menu" aria-expanded={menu.open} title={name}>
        <span className="inbox-switch-icon">
          <Icon size={17} />
          {cur && p.brandColor?.(cur.email) && <span className="brand-dot" style={{ background: p.brandColor(cur.email) }} aria-hidden />}
        </span>
        <span className="sb-label inbox-switch-text">
          <strong>{name}</strong>
          {sub && <small>{sub}</small>}
        </span>
        <ChevronsUpDown size={15} className="sb-label inbox-switch-chev" />
      </button>
      {cur?.temp && p.onTempMenu && (
        <button ref={more} type="button" className="icon-btn sm sb-label" title={t('Copy, share or delete')} aria-label={t('Copy, share or delete')} onClick={() => more.current && p.onTempMenu!(cur, more.current)}>
          <MoreHorizontal size={15} />
        </button>
      )}
      {menu.menu}
    </div>
  );
}
