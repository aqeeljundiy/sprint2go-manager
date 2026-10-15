import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Calendar, Clock, Hash, Paperclip, Search as SearchIcon, User as UserIcon, X } from 'lucide-react';
import type { Channel, ChatMessage, User } from '../../types';
import { Popover } from '../ui/Popover';
import { Select, type Option } from '../ui/Select';
import { EmptyState } from '../ui/EmptyState';
import { Avatar } from '../Avatar';
import { usePersisted } from '../../settings';
import { relative } from '../../utils';
import { chanName } from './Sheets';
import { msgText, preview } from './Message';
import { t, tn } from '../../i18n';

type When = 'any' | 'today' | 'week' | 'month';
const DAY = 864e5;

/** Search every channel and direct message I can read, with From, In, Has file and Date filters. Results open the message. */
export function ChatSearch(p: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  channels: Channel[];
  messages: ChatMessage[];
  users: User[];
  me: string;
  workspaceId: string;
  onOpen: (channelId: string, msgId: string) => void;
}) {
  const [q, setQ] = useState('');
  const [from, setFrom] = useState<string>('');
  const [inId, setIn] = useState<string>('');
  const [file, setFile] = useState(false);
  const [when, setWhen] = useState<When>('any');
  const [recent, setRecent] = usePersisted<string[]>(`s2g-chat-searches:${p.me}:${p.workspaceId}`, []);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (p.open) requestAnimationFrame(() => input.current?.focus());
  }, [p.open]);

  // What I may read: channels I'm in, and public channels.
  const readable = useMemo(() => p.channels.filter((c) => c.members.includes(p.me) || (c.kind === 'channel' && !c.private)), [p.channels, p.me]);
  const byId = useMemo(() => new Map(readable.map((c) => [c.id, c] as const)), [readable]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = !!(from || inId || file || when !== 'any');
  const results = useMemo(() => {
    if (!words.length && !filtered) return [];
    const since = when === 'any' ? '' : new Date(Date.now() - (when === 'today' ? DAY : when === 'week' ? 7 * DAY : 30 * DAY)).toISOString();
    const now = new Date().toISOString();
    const out: ChatMessage[] = [];
    for (const m of p.messages) {
      if (!byId.has(m.channelId) || m.kind === 'system' || m.kind === 'summary') continue;
      if (m.sendAt && m.sendAt > now) continue; // not sent yet
      if (from && m.userId !== from) continue;
      if (inId && m.channelId !== inId) continue;
      if (file && !m.files?.length) continue;
      if (since && m.at < since) continue;
      if (words.length) {
        const hay = `${msgText(m)} ${(m.files ?? []).map((f) => f.name).join(' ')}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) continue;
      }
      out.push(m);
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
  }, [p.messages, byId, words.join(' '), from, inId, file, when, filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (m: ChatMessage) => {
    const s = q.trim();
    if (s) setRecent((r) => [s, ...r.filter((x) => x !== s)].slice(0, 6));
    p.onOpen(m.channelId, m.id);
    p.onClose();
  };
  const clear = () => (setFrom(''), setIn(''), setFile(false), setWhen('any'));

  const people: Option[] = [{ value: '', label: t('Anyone') }, ...p.users.filter((u) => !u.deletedAt).map((u) => ({ value: u.id, label: u.id === p.me ? t('You') : u.name, icon: <Avatar person={u} size={20} />, keywords: u.email }))];
  const places: Option[] = [{ value: '', label: t('Anywhere') }, ...readable.map((c) => ({ value: c.id, label: chanName(c, p.users, p.me), group: c.kind === 'dm' ? t('Direct messages') : t('Channels') }))];
  const dates: Option<When>[] = [
    { value: 'any', label: t('Any time') },
    { value: 'today', label: t('Last 24 hours') },
    { value: 'week', label: t('Last 7 days') },
    { value: 'month', label: t('Last 30 days') },
  ];
  const chip = (on: boolean, icon: ReactNode, text: string) => (
    <span className={`csr-chip${on ? ' on' : ''}`}>
      {icon}
      <span className="csr-chip-text">{text}</span>
    </span>
  );

  return (
    <Popover anchor={p.anchor} open={p.open} onClose={p.onClose} width={460} title={t('Search messages')}>
      <div className="chat-search">
        <label className="csr-field">
          <SearchIcon size={16} aria-hidden />
          <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search all channels and DMs')} aria-label={t('Search messages')} enterKeyHint="search" />
          {q && (
            <button type="button" className="icon-btn sm" onClick={() => (setQ(''), input.current?.focus())} aria-label={t('Clear')}>
              <X size={16} />
            </button>
          )}
        </label>
        <div className="csr-chips" role="group" aria-label={t('Filters')}>
          <Select value={from} onChange={setFrom} options={people} searchable label={t('Sender')} title={t('Sender')} className="csr-sel" renderValue={(o) => chip(!!from, <UserIcon size={14} aria-hidden />, from ? t('From {name}', { name: o?.label ?? '' }) : t('Sender'))} />
          <Select value={inId} onChange={setIn} options={places} searchable label={t('In')} title={t('In')} className="csr-sel" renderValue={(o) => chip(!!inId, <Hash size={14} aria-hidden />, inId ? t('In {name}', { name: o?.label ?? '' }) : t('In'))} />
          <button type="button" className={`csr-chip as-btn${file ? ' on' : ''}`} aria-pressed={file} onClick={() => setFile((f) => !f)}>
            <Paperclip size={14} aria-hidden />
            <span className="csr-chip-text">{t('Has file')}</span>
          </button>
          <Select value={when} onChange={setWhen} options={dates} label={t('Date')} title={t('Date')} className="csr-sel" renderValue={(o) => chip(when !== 'any', <Calendar size={14} aria-hidden />, when === 'any' ? t('Date') : (o?.label ?? ''))} />
          {filtered && (
            <button type="button" className="link-btn csr-reset" onClick={clear}>
              {t('Clear filters')}
            </button>
          )}
        </div>
        <div className="csr-body">
          {!words.length && !filtered ? (
            recent.length ? (
              <>
                <h3 className="csr-head">{t('Recent searches')}</h3>
                <div className="csr-list">
                  {recent.map((r) => (
                    <button key={r} type="button" className="csr-recent" onClick={() => setQ(r)}>
                      <Clock size={16} aria-hidden /> <span>{r}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted small csr-hint">{t('Type a word, or pick a filter, to search every channel and direct message you can read.')}</p>
            )
          ) : results.length ? (
            <>
              <h3 className="csr-head">{tn(results.length, '{n} message', '{n} messages')}</h3>
              <div className="csr-list">
                {results.map((m) => {
                  const c = byId.get(m.channelId)!;
                  const u = p.users.find((x) => x.id === m.userId);
                  return (
                    <button key={m.id} type="button" className="csr-row" onClick={() => open(m)}>
                      {u ? <Avatar person={u} size={32} /> : <span className="csr-face" />}
                      <span className="csr-main">
                        <span className="csr-meta">
                          <strong>{m.userId === p.me ? t('You') : (u?.name ?? m.authorName ?? t('Someone'))}</strong>
                          <span className="csr-where">{m.parentId ? t('Thread in {name}', { name: chanName(c, p.users, p.me) }) : chanName(c, p.users, p.me)}</span>
                          <time dateTime={m.at}>{relative(m.at)}</time>
                        </span>
                        <span className="csr-text">
                          <Hit text={preview(m)} words={words} />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState compact icon={<SearchIcon size={20} />} title={t('No messages found')} text={t('Try other words or fewer filters.')} />
          )}
        </div>
      </div>
    </Popover>
  );
}

/** The words someone searched for, marked in a result. */
function Hit({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const esc = words.map((w) => w.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${esc.join('|')})`, 'gi'));
  return <>{parts.map((s, i) => (i % 2 ? <mark key={i}>{s}</mark> : s))}</>;
}
