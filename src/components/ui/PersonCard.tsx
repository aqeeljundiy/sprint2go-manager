import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Check, Copy, ListTodo, Mail, MessageCircle, Phone, Search } from 'lucide-react';
import type { Status, Team, User } from '../../types';
import { Avatar } from '../Avatar';
import { Popover } from './Popover';
import { Sheet } from './Sheet';
import { usePhone } from '../../mobile/media';
import { t } from '../../i18n';
import './personCard.css';

/** Someone the card can show: a teammate (has `userId`) or an outside contact (just a name and an email). */
export interface CardPerson {
  name: string;
  email: string;
  userId?: string;
  title?: string;
  color?: string;
  photo?: string;
  teams?: string[];
  phone?: string;
  company?: string;
  timeZone?: string; // an IANA name: shows their local time
  guest?: boolean; // someone at a client with portal access
  status?: Status;
  presence?: 'active' | 'away' | 'meeting';
}

type Who = string | { id?: string; userId?: string; name?: string; email?: string };

interface Api {
  open: (who: Who, anchor: HTMLElement | null) => void;
}

const Ctx = createContext<Api | null>(null);

/** Opens the shared profile card: `usePersonCard()?.open(personOrEmail, event.currentTarget)`. Null outside the app. */
export const usePersonCard = () => useContext(Ctx);

/** Props for something that opens the card when tapped, without also opening the row it sits in. */
export function cardTrigger(api: Api | null, who: Who) {
  if (!api) return {};
  const open = (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    api.open(who, e.currentTarget);
  };
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => (e.key === 'Enter' || e.key === ' ') && open(e),
    // A row that opens on press (long-press, drag) shouldn't start from the face.
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  };
}

/** A name that opens the card: `<PersonName who={email}>Ana</PersonName>`. Plain text when there's no card. */
export function PersonName({ who, children, className = '' }: { who: Who; children: ReactNode; className?: string }) {
  const api = usePersonCard();
  if (!api) return <span className={className}>{children}</span>;
  return (
    <span className={`person-link ${className}`} aria-label={t('Profile')} {...cardTrigger(api, who)}>
      {children}
    </span>
  );
}

export function PersonCardProvider({
  children,
  me,
  users,
  memberIds,
  teams,
  statuses,
  presence,
  contacts,
  guests,
  onMessage,
  onEmail,
  onEmailsWith,
  onTasks,
}: {
  children: ReactNode;
  me: string;
  users: User[];
  memberIds: string[]; // teammates in this company (the rest of `users` show as people without Message)
  teams: Team[];
  statuses: Record<string, Status | undefined>;
  presence: (userId: string) => 'active' | 'away' | 'meeting';
  contacts: { name: string; email: string }[];
  guests: { name: string; email: string; phone?: string; company?: string }[];
  onMessage: (userId: string) => void;
  onEmail: (p: { name: string; email: string }) => void;
  onEmailsWith: (email: string) => void;
  onTasks: (userId: string) => void;
}) {
  const [who, setWho] = useState<CardPerson | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const data = useRef({ users, memberIds, teams, statuses, presence, contacts, guests });
  data.current = { users, memberIds, teams, statuses, presence, contacts, guests };

  const resolve = useCallback((w: Who): CardPerson | null => {
    const d = data.current;
    const key = typeof w === 'string' ? w : (w.userId ?? w.id ?? w.email ?? '');
    const email = (typeof w === 'string' ? w : (w.email ?? '')).toLowerCase();
    const u = d.users.find((x) => x.id === key || (!!email && x.email.toLowerCase() === email));
    if (u && !u.deletedAt) {
      const st = d.statuses[u.id];
      return {
        name: u.name,
        email: u.email,
        userId: d.memberIds.includes(u.id) ? u.id : undefined,
        title: u.title,
        color: u.color,
        photo: u.photo,
        teams: d.teams.filter((tm) => tm.members.includes(u.id) || tm.leadId === u.id).map((tm) => tm.name),
        status: st && (!st.until || st.until > new Date().toISOString()) ? st : undefined,
        presence: d.memberIds.includes(u.id) ? d.presence(u.id) : undefined,
      };
    }
    if (!email.includes('@')) return null;
    const g = d.guests.find((x) => x.email.toLowerCase() === email);
    const c = d.contacts.find((x) => x.email.toLowerCase() === email);
    const name = (typeof w === 'string' ? '' : w.name) || g?.name || c?.name || email;
    return { name, email: g?.email ?? c?.email ?? email, phone: g?.phone, company: g?.company, guest: !!g };
  }, []);

  const api = useMemo<Api>(
    () => ({
      open: (w, el) => {
        const p = resolve(w);
        if (!p) return;
        const same = anchor.current === el;
        anchor.current = el;
        setWho((cur) => (cur && same && cur.email === p.email ? null : p));
      },
    }),
    [resolve],
  );

  const close = useCallback(() => setWho(null), []);
  const run = (fn: () => void) => () => (close(), fn());

  return (
    <Ctx.Provider value={api}>
      {children}
      {who && (
        <CardShell anchor={anchor} onClose={close} name={who.name}>
          <CardBody
            p={who}
            me={me}
            onMessage={who.userId ? run(() => onMessage(who.userId!)) : undefined}
            onEmail={run(() => onEmail({ name: who.name, email: who.email }))}
            onEmailsWith={run(() => onEmailsWith(who.email))}
            onTasks={who.userId ? run(() => onTasks(who.userId!)) : undefined}
          />
        </CardShell>
      )}
    </Ctx.Provider>
  );
}

/** A bottom sheet on phones, a popover next to the face or name on wider screens. */
function CardShell({ anchor, onClose, name, children }: { anchor: React.RefObject<HTMLElement | null>; onClose: () => void; name: string; children: ReactNode }) {
  const phone = usePhone();
  if (phone)
    return (
      <Sheet onClose={onClose} label={name} className="pcard-sheet">
        {children}
      </Sheet>
    );
  return (
    <Popover anchor={anchor} open onClose={onClose} width={320} title={name}>
      {children}
    </Popover>
  );
}

function localTime(tz: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date());
  } catch {
    return '';
  }
}

function CardBody({
  p,
  me,
  onMessage,
  onEmail,
  onEmailsWith,
  onTasks,
}: {
  p: CardPerson;
  me: string;
  onMessage?: () => void;
  onEmail: () => void;
  onEmailsWith: () => void;
  onTasks?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);
  const copy = () => {
    void navigator.clipboard?.writeText(p.email).then(() => setCopied(true), () => {});
  };
  const first = p.name.split(' ')[0] || p.name;
  const isMe = p.userId === me;
  const time = p.timeZone ? localTime(p.timeZone) : '';
  const presence = p.presence === 'meeting' ? t('In a meeting') : p.presence === 'away' ? t('Away') : p.presence === 'active' ? t('Active') : '';

  return (
    <div className="pcard">
      <div className="pcard-head">
        <span className="pcard-face">
          <Avatar person={{ name: p.name, email: p.email, color: p.color, photo: p.photo }} size={72} />
          {p.presence && <span className={`pcard-dot is-${p.presence}`} aria-hidden="true" />}
        </span>
        <div className="pcard-who">
          <div className="pcard-name">{p.name}</div>
          {(p.title || p.company) && <div className="pcard-sub">{[p.title, p.company].filter(Boolean).join(' · ')}</div>}
          {p.guest && <div className="pcard-sub">{t('Guest')}</div>}
        </div>
      </div>

      {(presence || p.status) && (
        <div className="pcard-status">
          {p.status ? (
            <>
              <span aria-hidden="true">{p.status.emoji}</span> {p.status.text}
            </>
          ) : (
            presence
          )}
        </div>
      )}

      <dl className="pcard-facts">
        <div className="pcard-fact">
          <dt>{t('Email')}</dt>
          <dd>
            <button type="button" className="pcard-copy" onClick={copy} aria-label={t('Copy {email}', { email: p.email })}>
              <span className="pcard-val">{p.email}</span>
              <span className={`pcard-copied ${copied ? 'on' : ''}`} aria-live="polite" title={copied ? t('Copied') : t('Copy')}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </span>
            </button>
          </dd>
        </div>
        {p.phone && (
          <div className="pcard-fact">
            <dt>{t('Phone')}</dt>
            <dd>
              <a href={`tel:${p.phone}`} className="pcard-val">
                {p.phone}
              </a>
            </dd>
          </div>
        )}
        {!!p.teams?.length && (
          <div className="pcard-fact">
            <dt>{p.teams.length > 1 ? t('Teams') : t('Team')}</dt>
            <dd className="pcard-val">{p.teams.join(', ')}</dd>
          </div>
        )}
        {time && (
          <div className="pcard-fact">
            <dt>{t('Local time')}</dt>
            <dd className="pcard-val">{time}</dd>
          </div>
        )}
      </dl>

      <div className="pcard-actions">
        {!isMe &&
          (onMessage ? (
            <button type="button" className="primary-btn pcard-primary" onClick={onMessage}>
              <MessageCircle size={16} /> {t('Message')}
            </button>
          ) : (
            <button type="button" className="primary-btn pcard-primary" onClick={onEmail}>
              <Mail size={16} /> {t('Email')}
            </button>
          ))}
        <div className="pcard-icons">
          {onMessage && !isMe && (
            <button type="button" className="icon-btn" onClick={onEmail} aria-label={t('Email')} title={t('Email')}>
              <Mail size={20} />
            </button>
          )}
          {p.phone && (
            <a className="icon-btn" href={`tel:${p.phone}`} aria-label={t('Call')} title={t('Call')}>
              <Phone size={20} />
            </a>
          )}
          <button type="button" className="icon-btn" onClick={onEmailsWith} aria-label={t('Emails with {name}', { name: first })} title={t('Emails with {name}', { name: first })}>
            <Search size={20} />
          </button>
          {onTasks && (
            <button type="button" className="icon-btn" onClick={onTasks} aria-label={t('View tasks')} title={t('View tasks')}>
              <ListTodo size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
