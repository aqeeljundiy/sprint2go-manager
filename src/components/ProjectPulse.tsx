import { useMemo, useState } from 'react';
import { Check, Megaphone } from 'lucide-react';
import type { ChatMessage, Client, Meeting, Note, ProjectUpdate, Todo, User } from '../types';
import { term } from '../terms';
import { localDay, relative } from '../utils';
import { Avatar } from './Avatar';
import { Sheet } from './ui/Sheet';
import { EmptyState } from './ui/EmptyState';
import { useLeaving } from './ui/Smooth';
import { PersonName } from './ui/PersonCard';
import { fmtDay, fmtDayWord } from '../i18n/format';
import { t } from '../i18n';
import './projectPulse.css';

/**
 * A project's pulse: its health and status updates (Monday's status column, Basecamp's pinned message), what happened
 * on it lately (Basecamp's per-project timeline) and, across projects, what's mine and coming due (Monday's My Work).
 */

export type Health = ProjectUpdate['health'];
export const healthLabel = (h: Health) => (h === 'on' ? t('On track') : h === 'risk' ? t('At risk') : t('Off track'));
/** The project's latest written update (its health), if anyone posted one. */
export const latestUpdate = (c: Client): ProjectUpdate | undefined => c.updates?.at(-1);

/** A small dot and word for a project's health ("At risk"). */
export function HealthPill({ health, className = '' }: { health: Health; className?: string }) {
  return (
    <span className={`health-pill h-${health} ${className}`}>
      <span className="health-dot" aria-hidden="true" />
      {healthLabel(health)}
    </span>
  );
}

/** Overview's status card: the latest update, and Post update (anyone on the project). */
export function ProjectStatus({ client, users, me, canPost, onPost }: { client: Client; users: User[]; me: string; canPost: boolean; onPost: (u: ProjectUpdate) => void }) {
  const [open, setOpen] = useState(false);
  const last = latestUpdate(client);
  const by = last && users.find((u) => u.id === last.by);
  return (
    <div className="side-card pulse-card">
      <h3>
        {t('Status')}
        {canPost && (
          <button type="button" className="ghost-btn sm" onClick={() => setOpen(true)}>
            <Megaphone size={13} /> {t('Post update')}
          </button>
        )}
      </h3>
      {last ? (
        <div className="pulse-last">
          <HealthPill health={last.health} />
          {last.note && <p className="pulse-note">{last.note}</p>}
          <p className="muted small pulse-by">
            {by ? <PersonName who={{ userId: by.id, email: by.email, name: by.name }}>{by.id === me ? t('You') : by.name}</PersonName> : t('Someone')} · {relative(last.at)}
          </p>
        </div>
      ) : (
        <EmptyState compact text={t('No update yet. Say how {name} is going so nobody has to dig.', { name: client.name })} />
      )}
      {open && <PostUpdate client={client} me={me} onClose={() => setOpen(false)} onPost={(u) => (onPost(u), setOpen(false))} />}
    </div>
  );
}

function PostUpdate({ client, me, onClose, onPost }: { client: Client; me: string; onClose: () => void; onPost: (u: ProjectUpdate) => void }) {
  const [health, setHealth] = useState<Health>(latestUpdate(client)?.health ?? 'on');
  const [note, setNote] = useState('');
  const post = () => onPost({ id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36), health, note: note.trim(), by: me, at: new Date().toISOString() });
  return (
    <Sheet
      title={t('Update on {name}', { name: client.name })}
      onClose={onClose}
      className="pulse-sheet"
      footer={
        <button type="button" className="primary-btn" onClick={post}>
          {t('Post update')}
        </button>
      }
    >
      <div className="pulse-form">
      <div className="pulse-health" role="radiogroup" aria-label={t('How is it going?')}>
        {(['on', 'risk', 'off'] as const).map((h) => (
          <button key={h} type="button" role="radio" aria-checked={health === h} className={`pulse-pick h-${h}${health === h ? ' on' : ''}`} onClick={() => setHealth(h)}>
            <span className="health-dot" aria-hidden="true" />
            {healthLabel(h)}
          </button>
        ))}
      </div>
      <textarea className="pulse-text" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('What changed, and what comes next?')} aria-label={t('Update')} />
      <p className="muted small">{t('Everyone on this {project} gets a notification.', { project: term.one })}</p>
      </div>
    </Sheet>
  );
}

interface Event {
  key: string;
  by: string; // user id
  at: string;
  verb: string;
  what?: string;
  run?: () => void;
}

/** What happened on a project, newest first, by day. Each row names who and what; tapping it opens the thing. */
export function ProjectActivity({
  client,
  tasks,
  notes,
  meetings,
  messages,
  users,
  me,
  onOpenTask,
  onOpenNote,
  onOpenMeeting,
  onOpenChat,
}: {
  client: Client;
  tasks: Todo[];
  notes: Note[];
  meetings: Meeting[];
  messages: ChatMessage[];
  users: User[];
  me: string;
  onOpenTask: (id: string) => void;
  onOpenNote: (id: string) => void;
  onOpenMeeting: (id: string) => void;
  onOpenChat?: () => void;
}) {
  const [justMe, setJustMe] = useState(false);
  const [more, setMore] = useState(false);
  const events = useMemo(() => {
    const out: Event[] = [];
    for (const x of tasks) {
      if (x.clientId !== client.id) continue;
      const hist = x.history ?? [];
      if (!hist.some((e) => e.kind === 'created')) out.push({ key: 'tc' + x.id, by: x.createdBy ?? '', at: x.createdAt, verb: t('added a task'), what: x.title, run: () => onOpenTask(x.id) });
      for (const e of hist) {
        const verb = e.kind === 'created' ? t('added a task') : e.kind === 'comment' ? t('commented on') : e.kind === 'assigned' ? t('assigned') : e.kind === 'status' ? t('moved') : e.kind === 'due' ? t('changed the due date of') : e.kind === 'review' ? t('reviewed') : t('edited');
        out.push({ key: 'th' + e.id, by: e.by, at: e.at, verb: e.kind === 'status' ? verb.replace(/\.$/, '') : verb, what: x.title, run: () => onOpenTask(x.id) });
      }
      if (x.done && x.doneAt && !hist.some((e) => e.kind === 'status' && e.at === x.doneAt)) out.push({ key: 'td' + x.id, by: x.doneBy ?? x.userId, at: x.doneAt, verb: t('completed'), what: x.title, run: () => onOpenTask(x.id) });
    }
    for (const n of notes) if (n.clientId === client.id && n.visibility !== 'private') out.push({ key: 'n' + n.id, by: n.updatedBy || n.ownerId, at: n.updatedAt, verb: n.updatedAt === n.createdAt ? t('wrote a note') : t('updated a note'), what: n.title || t('Untitled'), run: () => onOpenNote(n.id) });
    for (const m of meetings) if (m.clientId === client.id && m.at <= new Date().toISOString()) out.push({ key: 'm' + m.id, by: '', at: m.at, verb: t('Meeting'), what: m.title, run: () => onOpenMeeting(m.id) });
    for (const m of messages) if (m.userId) out.push({ key: 'c' + m.id, by: m.userId, at: m.at, verb: t('posted in chat'), what: m.text.slice(0, 80), run: onOpenChat });
    for (const u of client.updates ?? []) out.push({ key: 'u' + u.id, by: u.by, at: u.at, verb: t('posted an update: {health}', { health: healthLabel(u.health) }), what: u.note || undefined });
    return out.filter((e) => e.at).sort((a, b) => b.at.localeCompare(a.at));
  }, [client, tasks, notes, meetings, messages, onOpenTask, onOpenNote, onOpenMeeting, onOpenChat]);
  const list = (justMe ? events.filter((e) => e.by === me) : events).slice(0, more ? 60 : 12);
  const days: { day: string; rows: Event[] }[] = [];
  for (const e of list) {
    const day = localDay(new Date(e.at));
    if (days.at(-1)?.day !== day) days.push({ day, rows: [] });
    days.at(-1)!.rows.push(e);
  }
  const name = (id: string) => (id === me ? t('You') : users.find((u) => u.id === id)?.name ?? '');
  return (
    <div className="side-card activity-card">
      <h3>
        {t('Activity')}
        <span className="segmented pa-seg" role="group" aria-label={t('Whose activity')}>
          <button type="button" className={justMe ? '' : 'on'} aria-pressed={!justMe} onClick={() => setJustMe(false)}>
            {t('Everyone')}
          </button>
          <button type="button" className={justMe ? 'on' : ''} aria-pressed={justMe} onClick={() => setJustMe(true)}>
            {t('Just me')}
          </button>
        </span>
      </h3>
      {!days.length ? (
        <EmptyState compact text={justMe ? t('Nothing from you here yet.') : t('Nothing has happened here yet.')} />
      ) : (
        <div className="pa-days" key={justMe ? 'me' : 'all'}>
          {days.map((d) => (
            <section key={d.day} className="pa-day">
              <h4 className="pa-day-h">{fmtDayWord(d.day)}</h4>
              <ul className="pa-list">
                {d.rows.map((e) => {
                  const u = users.find((x) => x.id === e.by);
                  return (
                    <li key={e.key} className="pa-row">
                      <span className="pa-face">{u ? <Avatar person={u} size={24} card={u.id} /> : <span className="pa-face-none" aria-hidden="true" />}</span>
                      <button type="button" className="pa-main" onClick={e.run} disabled={!e.run}>
                        <span className="pa-text">
                          {u && <b>{name(u.id)} </b>}
                          {e.verb}
                          {e.what && <span className="pa-what"> {e.what}</span>}
                        </span>
                        <time>{new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {!more && (justMe ? events.filter((e) => e.by === me) : events).length > list.length && (
            <button type="button" className="link-btn small pa-more" onClick={() => setMore(true)}>
              {t('Show more')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Everything assigned to me and coming due, across my projects, by Today, This week and Later, each a tap to finish. */
export function MyWork({ tasks, projects, me, onOpenTask, onToggleTask, phone }: { phone?: boolean; tasks: Todo[]; projects: Client[]; me: string; onOpenTask: (id: string) => void; onToggleTask: (id: string) => void }) {
  const today = localDay();
  const week = localDay(new Date(Date.now() + 6 * 86_400_000));
  const live = new Map(projects.filter((c) => c.status !== 'ended').map((c) => [c.id, c]));
  const mine = tasks
    .filter((x) => !x.done && x.kind !== 'brief' && !!x.clientId && live.has(x.clientId) && (x.userId === me || x.assignees?.includes(me)))
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.title.localeCompare(b.title));
  const rows = useLeaving(mine, (x) => x.id);
  const bucket = (x: Todo) => (!x.due ? 'later' : x.due <= today ? 'today' : x.due <= week ? 'week' : 'later');
  const groups = [
    { id: 'today', title: t('Today') },
    { id: 'week', title: t('This week') },
    { id: 'later', title: t('Later') },
  ].map((g) => ({ ...g, rows: rows.filter((r) => bucket(r.item) === g.id) }));
  return (
    <section className={`mywork${phone ? ' is-phone' : ''}`} aria-label={t('My work')}>
      <h2 className="mywork-h">{t('My work')}</h2>
      {!mine.length && !rows.length ? (
        <EmptyState compact text={t('Nothing assigned to you in any {project}.', { project: term.one })} />
      ) : (
        groups
          .filter((g) => g.rows.length)
          .map((g) => (
            <div key={g.id} className="mywork-group">
              <h3 className="mywork-gh">{g.title}</h3>
              <ul className="mywork-list">
                {g.rows.map(({ item: x, leaving }) => {
                  const c = live.get(x.clientId!);
                  const late = !!x.due && x.due < today;
                  return (
                    <li key={x.id} className={`mywork-row${leaving ? ' row-leaving' : ''}`}>
                      <button type="button" className="mywork-check" aria-label={t('Complete {title}', { title: x.title })} onClick={() => onToggleTask(x.id)}>
                        <Check size={14} />
                      </button>
                      <button type="button" className="mywork-main" onClick={() => onOpenTask(x.id)}>
                        <span className="mywork-title">{x.title}</span>
                        <span className="mywork-sub">
                          {c && <span className="mywork-proj" style={{ ['--c' as string]: c.color }}>{c.name}</span>}
                          {x.due && <span className={late ? 'mywork-late' : ''}>{late ? t('Late, due {day}', { day: fmtDay(x.due) }) : fmtDayWord(x.due)}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
      )}
    </section>
  );
}
