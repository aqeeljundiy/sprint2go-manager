import { useEffect, useRef, useState } from 'react';
import { primaryDomain } from '../domains';
import { Check, ChevronsUpDown, FlaskConical, LayoutGrid, Loader2, Plus, Settings2, UserPlus } from 'lucide-react';
import type { Client, Role, Workspace } from '../types';
import type { OtherSignIn } from '../signedIn';
import { WorkspaceLogo } from './WorkspaceLogo';
import { Badge } from './ui/Person';
import { isSandbox } from '../sandbox';
import { t, tn } from '../i18n';

interface Props {
  workspaces: Workspace[];
  current: Workspace;
  unread: Record<string, number>;
  onSwitch: (id: string) => void;
  onAdd?: () => void;
  onSettings?: () => void;
  /** Companies this person is a client of (their portals). */
  portals?: { key: string; ws: Workspace; client: Client; unread?: number }[];
  currentPortal?: string; // set while a portal is open
  onPortal?: (key: string) => void;
  onHome?: () => void; // a guest's "Shared with you" overview
  addLabel?: string;
  /** Their own demo company when it isn't open yet (not made, or hidden): opening it makes it or shows it again. */
  demo?: { busy?: boolean; onOpen: () => void } | null;
  /** Your role in each company, shown under its name. */
  roles?: Record<string, Role>;
  /** The email you're signed in with, shown above your companies when other accounts are signed in too. */
  signedInAs?: string;
  /** Other accounts signed in on this browser, with their companies: a click switches to them (src/signedIn.ts). */
  elsewhere?: OtherSignIn[];
  onElsewhere?: (userId: string, workspaceId: string) => void;
  onAddAccount?: () => void;
}

const roleWord = (r: Role) => (r === 'owner' ? t('Owner') : r === 'admin' ? t('Admin') : t('Member'));

export function WorkspaceSwitcher({ workspaces, current, unread, onSwitch, onAdd, onSettings, portals = [], currentPortal, onPortal, onHome, addLabel = t('Add a workspace'), demo, roles, signedInAs, elsewhere = [], onElsewhere, onAddAccount }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  // The demo company opened (or another company was picked elsewhere): the menu closes on the new company.
  useEffect(() => setOpen(false), [current.id]);

  const pick = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="ws-switch" ref={ref}>
      <button className={`ws-current ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} title={t('Switch workspace')}>
        <WorkspaceLogo ws={current} size={30} />
        <span className="sb-label ws-name">
          <strong>{current.name}</strong>
          <small>{currentPortal ? t('Shared space') : isSandbox(current) ? t('Demo company') : (primaryDomain(current) || t('Workspace'))}</small>
        </span>
        <ChevronsUpDown size={15} className="sb-label ws-chev" />
      </button>

      {open && (
        <div className="ws-menu" role="menu">
          {workspaces.length > 0 && <div className="ws-menu-title">{elsewhere.length && signedInAs ? t('Signed in as {email}', { email: signedInAs }) : t('Workspaces')}</div>}
          {workspaces.map((w, i) => (
            <button key={w.id} className={`ws-item ${w.id === current.id && !currentPortal ? 'on' : ''}`} onClick={() => pick(() => onSwitch(w.id))}>
              <WorkspaceLogo ws={w} size={32} />
              <span className="ws-name">
                <span className="ws-name-line">
                  <strong>{w.name}</strong>
                  {isSandbox(w) && (
                    <Badge tone="info" small>
                      {t('Demo')}
                    </Badge>
                  )}
                </span>
                <small>
                  {isSandbox(w)
                    ? t('Your own copy to try things in')
                    : roles?.[w.id]
                      ? `${roleWord(roles[w.id])} · ${primaryDomain(w) || t('no domain')}`
                      : `${tn(w.accounts.filter((a) => !a.temp).length, '{n} account', '{n} accounts')} · ${primaryDomain(w) || t('no domain')}`}
                </small>
              </span>
              {unread[w.id] ? <span className="ws-unread">{unread[w.id]}</span> : null}
              {w.id === current.id && !currentPortal ? <Check size={16} className="ws-check" /> : i < 9 && <kbd>⌥{i + 1}</kbd>}
            </button>
          ))}
          {demo && (
            <button className="ws-item ws-demo" onClick={demo.onOpen} disabled={demo.busy}>
              <span className="ws-demo-icon" aria-hidden="true">
                {demo.busy ? <Loader2 size={16} className="spin" /> : <FlaskConical size={16} />}
              </span>
              <span className="ws-name">
                <span className="ws-name-line">
                  <strong>{demo.busy ? t('Making your demo company…') : t('Demo company')}</strong>
                  <Badge tone="info" small>
                    {t('Demo')}
                  </Badge>
                </span>
                <small>{t('A sample agency to try everything in, just for you')}</small>
              </span>
            </button>
          )}
          {portals.length > 0 && (
            <>
              <div className="ws-menu-title">{t('Shared with you')}</div>
              {onHome && (
                <button className="am-item" onClick={() => pick(onHome)}>
                  <LayoutGrid size={16} /> {t('See everything shared with you')}
                </button>
              )}
              {portals.map((pt) => (
                <button key={pt.key} className={`ws-item ${pt.key === currentPortal ? 'on' : ''}`} onClick={() => pick(() => onPortal?.(pt.key))}>
                  <WorkspaceLogo ws={pt.ws} size={32} />
                  <span className="ws-name">
                    <strong>{pt.ws.name}</strong>
                    <small>{t('Shared space · {name}', { name: pt.client.name })}</small>
                  </span>
                  {pt.unread ? <span className="ws-unread">{pt.unread}</span> : null}
                  {pt.key === currentPortal && <Check size={16} className="ws-check" />}
                </button>
              ))}
            </>
          )}
          {elsewhere.map((o) => (
            <div key={o.id} className="ws-elsewhere">
              <div className="ws-menu-title">{t('Signed in as {email}', { email: o.email })}</div>
              {o.companies.length ? (
                o.companies.map((w) => (
                  <button key={w.id} className="ws-item" onClick={() => pick(() => onElsewhere?.(o.id, w.id))}>
                    <WorkspaceLogo ws={w} size={32} />
                    <span className="ws-name">
                      <strong>{w.name}</strong>
                      <small>{t('Opens as {name}', { name: o.name.split(' ')[0] || o.email })}</small>
                    </span>
                  </button>
                ))
              ) : (
                <button className="ws-item" onClick={() => pick(() => onElsewhere?.(o.id, ''))}>
                  <span className="ws-name">
                    <strong>{o.name || o.email}</strong>
                    <small>{t('No companies yet')}</small>
                  </span>
                </button>
              )}
            </div>
          ))}
          {(onAdd || onSettings || onAddAccount) && <div className="am-sep" />}
          {onAddAccount && (
            <button className="am-item" onClick={() => pick(onAddAccount)}>
              <UserPlus size={16} /> {t('Add another account')}
            </button>
          )}
          {onAdd && (
            <button className="am-item" onClick={() => pick(onAdd)}>
              <Plus size={16} /> {addLabel}
            </button>
          )}
          {onSettings && !currentPortal && (
            <button className="am-item" onClick={() => pick(onSettings)}>
              <Settings2 size={16} /> {t('Workspace settings')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
