// Talk: Mail, Chat, Meetings. Reading, sorting and team chat work here; writing an email and sending the notetaker
// still open the full app (v2 never sends an email or calls a meeting bot by itself: docs/admin-kit-v2-app-plan.md).
import { useMemo, useState } from 'react';
import type { Channel, Meeting, Thread } from '../../types';
import { useStored } from '../../store';
import { t } from '../../i18n';
import { htmlToText } from '../../sanitize';
import { Chip, Drawer, Page, esc, uid, useKitList, useV2, when } from '../ui';
import { nameOf, useTeam } from '../team';
import { ICON } from '../Shell';
import { fmtDateTime } from '../../i18n/format';

/* ---------------- Mail ---------------- */
// One way to filter: the folders as views and search (v1 had chips, category tabs and folders on one screen).
export function Mail() {
  const { me, ws } = useTeam();
  const { toast } = useV2();
  const [threads, setThreads] = useStored('threads');
  const [open, setOpen] = useState<string | null>(null);
  const boxes = useMemo(() => new Set(ws.accounts.filter((a) => a.users.includes(me.id)).map((a) => a.id)), [ws, me.id]);
  const rows = useMemo(() => threads.filter((th) => boxes.has(th.accountId) && th.messages.length), [threads, boxes]);
  const last = (th: Thread) => th.messages[th.messages.length - 1];
  const patch = (id: string, p: Partial<Thread>) => setThreads((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const archive = (th: Thread) => {
    const was = th.location;
    patch(th.id, { location: 'archive' });
    toast(t('Archived'), { action: { label: t('Undo'), onClick: () => patch(th.id, { location: was }) } });
  };
  const { el } = useKitList<Thread>(
    () => ({
      id: 'ml',
      rowId: (r) => r.id,
      searchLabel: t('Search mail'),
      search: (r) => [r.subject, ...r.messages.map((m) => `${m.from.name} ${m.from.email} ${m.body}`)].join(' '),
      views: [
        { value: 'inbox', label: t('Inbox'), test: (r) => r.location === 'inbox' && !r.snoozedUntil },
        { value: 'unread', label: t('Unread'), test: (r) => r.location === 'inbox' && r.unread, count: true },
        { value: 'mine', label: t('Assigned to me'), test: (r) => r.assignee === me.id && r.location === 'inbox' },
        { value: 'starred', label: t('Starred'), test: (r) => r.starred },
        { value: 'archive', label: t('Archive'), test: (r) => r.location === 'archive' },
      ],
      sort: { key: 'date', dir: -1 },
      columns: [
        { key: 'from', label: t('From'), value: (r) => last(r).from.name || last(r).from.email, cell: (r) => `${r.unread ? '<b>' : ''}${esc(last(r).from.name || last(r).from.email)}${r.unread ? '</b>' : ''}` },
        { key: 'subject', label: t('Subject'), primary: true, truncate: true, value: (r) => r.subject, cell: (r) => `<button type="button" class="s2a-open" data-open>${esc(r.subject || t('(no subject)'))}</button><span class="s2a-sub">${esc(last(r).body.slice(0, 120))}</span>` },
        { key: 'date', label: t('When'), sort: 'date', align: 'end', value: (r) => last(r).date, cell: (r) => esc(when(last(r).date)) },
      ],
      actions: [
        { key: 'star', label: t('Star'), icon: ICON.star, run: (r) => patch(r.id, { starred: !r.starred }) },
        { key: 'archive', label: t('Archive'), icon: ICON.archive, show: (r) => r.location === 'inbox', run: archive },
      ],
      bulk: [
        { key: 'read', label: t('Mark read'), run: (list) => list.forEach((r) => patch(r.id, { unread: false })) },
        { key: 'archive', label: t('Archive'), run: (list) => list.forEach((r) => patch(r.id, { location: 'archive' })) },
      ],
      onOpen: (r) => (setOpen(r.id), r.unread && patch(r.id, { unread: false })),
      summary: (list) => t('{n} conversations', { n: list.length }),
      empty: { none: t('No mail in your mailboxes yet.'), views: { unread: t('All read.'), inbox: t('Inbox zero.') } },
    }),
    rows,
  );
  const th = rows.find((r) => r.id === open);
  return (
    <Page title={t('Mail')} sub={t('Your mailboxes in {company}.', { company: ws.name })} actions={<a className="ak-btn ak-btn--primary" href="/mail?compose=1">{t('Write an email')}</a>}>
      {el}
      <Drawer open={!!th} onClose={() => setOpen(null)} heading={th?.subject || t('(no subject)')}>
        {th && (
          <div className="s2a-form">
            <div className="s2a-msgs">
              {th.messages.map((m) => (
                <article key={m.id} className="s2a-msg">
                  <b>{m.from.name || m.from.email}<span>{fmtDateTime(m.date)}</span></b>
                  <div className="s2a-read">{m.html ? htmlToText(m.html) : m.body}</div>
                </article>
              ))}
            </div>
            <div className="ak-actions">
              <a className="ak-btn ak-btn--primary" href={`/mail/${th.id}`}>{t('Reply')}</a>
              {th.location === 'inbox' && <button type="button" className="ak-btn" onClick={() => (archive(th), setOpen(null))}>{t('Archive')}</button>}
            </div>
            <p className="s2a-note">{t('Replies are written in the full Mail view for now.')}</p>
          </div>
        )}
      </Drawer>
    </Page>
  );
}

/* ---------------- Chat ---------------- */
export function Chat({ open: initial }: { open?: string }) {
  const { me, ws, users } = useTeam();
  const [channels] = useStored('channels');
  const [messages, setMessages] = useStored('messages');
  const [open, setOpen] = useState<string | null>(initial || null);
  const [text, setText] = useState('');
  const rows = useMemo(() => channels.filter((c) => c.workspaceId === ws.id && !c.archived && c.members.includes(me.id)), [channels, ws.id, me.id]);
  const lastOf = useMemo(() => {
    const m = new Map<string, { at: string; text: string; userId: string }>();
    for (const x of messages) if (!x.parentId && (!m.get(x.channelId) || m.get(x.channelId)!.at < x.at)) m.set(x.channelId, x);
    return m;
  }, [messages]);
  const title = (c: Channel) => (c.kind === 'dm' ? c.members.filter((id) => id !== me.id).map((id) => nameOf(users, id)).join(', ') || t('Just you') : `# ${c.name}`);
  const { el } = useKitList<Channel>(
    () => ({
      id: 'ch',
      rowId: (r) => r.id,
      searchLabel: t('Search channels and people'),
      search: (r) => title(r),
      views: [
        { value: 'all', label: t('All') },
        { value: 'channels', label: t('Channels'), test: (r) => r.kind === 'channel' },
        { value: 'dms', label: t('Direct messages'), test: (r) => r.kind === 'dm' },
      ],
      sort: { key: 'last', dir: -1 },
      columns: [
        { key: 'name', label: t('Conversation'), primary: true, truncate: true, value: (r) => title(r), cell: (r) => `<button type="button" class="s2a-open" data-open>${esc(title(r))}</button><span class="s2a-sub">${esc(lastOf.get(r.id)?.text.slice(0, 120) ?? r.topic ?? '')}</span>` },
        { key: 'last', label: t('Last message'), sort: 'date', align: 'end', value: (r) => lastOf.get(r.id)?.at ?? '', cell: (r) => esc(lastOf.get(r.id) ? when(lastOf.get(r.id)!.at) : '') },
      ],
      onOpen: (r) => setOpen(r.id),
      summary: (list) => t('{n} conversations', { n: list.length }),
      empty: { none: t('No channels yet.') },
    }),
    rows,
  );
  const ch = rows.find((r) => r.id === open);
  const thread = ch ? messages.filter((m) => m.channelId === ch.id && !m.parentId).sort((a, b) => a.at.localeCompare(b.at)).slice(-30) : [];
  const send = () => {
    if (!ch || !text.trim()) return;
    setMessages((ms) => [...ms, { id: uid(), channelId: ch.id, userId: me.id, text: text.trim(), at: new Date().toISOString() }]);
    setText('');
  };
  return (
    <Page title={t('Chat')} sub={t('Channels and direct messages in {company}.', { company: ws.name })} actions={<a className="ak-btn ak-btn--primary" href="/chat">{t('New channel')}</a>}>
      {el}
      <Drawer open={!!ch} onClose={() => setOpen(null)} heading={ch ? title(ch) : t('Chat')}>
        {ch && (
          <div className="s2a-form">
            <div className="s2a-msgs">
              {thread.length ? thread.map((m) => (
                <article key={m.id} className="s2a-msg"><b>{m.userId === 'guest' ? t('Guest') : nameOf(users, m.userId)}<span>{when(m.at)}</span></b><div className="s2a-read">{m.text}</div></article>
              )) : <p className="s2a-note">{t('No messages yet. Say hello.')}</p>}
            </div>
            <form className="s2a-form" onSubmit={(e) => (e.preventDefault(), send())}>
              <div className="ak-field"><label htmlFor="ch-text">{t('Message')}</label><textarea id="ch-text" className="ak-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></div>
              <div className="ak-actions"><button className="ak-btn ak-btn--primary" disabled={!text.trim()}>{t('Send')}</button></div>
            </form>
          </div>
        )}
      </Drawer>
    </Page>
  );
}

/* ---------------- Meetings ---------------- */
// The app is called what its page says: Meetings (v1: "Meet" opening "Meetings"). Folders were projects: one Project column.
export function Meetings() {
  const { ws } = useTeam();
  const [meetings] = useStored('meetings');
  const [clients] = useStored('clients');
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => meetings.filter((m) => m.workspaceId === ws.id), [meetings, ws.id]);
  const project = (m: Meeting) => clients.find((c) => c.id === m.clientId)?.name ?? '';
  const now = new Date().toISOString();
  const { el } = useKitList<Meeting>(
    () => ({
      id: 'mt',
      rowId: (r) => r.id,
      searchLabel: t('Search meetings and notes'),
      search: (r) => [r.title, r.summary, project(r), ...r.attendees].join(' '),
      views: [
        { value: 'past', label: t('With notes'), test: (r) => r.at <= now },
        { value: 'upcoming', label: t('Upcoming'), test: (r) => r.at > now, order: 1 },
      ],
      filters: [{ key: 'project', label: t('Project'), any: t('Any project'), options: () => clients.filter((c) => c.workspaceId === ws.id).map((c) => [c.id, c.name] as [string, string]), test: (r, v) => r.clientId === v }],
      sort: { key: 'at', dir: -1 },
      columns: [
        { key: 'title', label: t('Meeting'), primary: true, truncate: true, value: (r) => r.title, cell: (r) => `<button type="button" class="s2a-open" data-open>${esc(r.title)}</button><span class="s2a-sub">${esc(r.attendees.slice(0, 4).join(', '))}</span>` },
        { key: 'at', label: t('When'), sort: 'date', value: (r) => r.at, cell: (r) => esc(when(r.at)) },
        { key: 'project', label: t('Project'), hidePhone: true, value: project, cell: (r) => esc(project(r) || t('No project')) },
        { key: 'shared', label: t('Guests see notes'), hidePhone: true, value: (r) => (r.sharedWithClient ? 1 : 0), cell: (r) => (r.sharedWithClient ? `<ak-chip tone="info">${esc(t('Shared'))}</ak-chip>` : '') },
      ],
      onOpen: (r) => setOpen(r.id),
      summary: (list) => t('{n} meetings', { n: list.length }),
      empty: { none: t('No meetings yet.'), views: { upcoming: t('Nothing booked. Meetings on your calendar with a video link show here.') } },
    }),
    rows,
  );
  const m = rows.find((r) => r.id === open);
  return (
    <Page title={t('Meetings')} sub={t('Notes and actions from every meeting in {company}.', { company: ws.name })} actions={<a className="ak-btn ak-btn--primary" href="/meet">{t('Send the notetaker')}</a>}>
      {el}
      <Drawer open={!!m} onClose={() => setOpen(null)} heading={m?.title ?? t('Meeting')}>
        {m && (
          <div className="s2a-form">
            <dl className="s2a-facts">
              <dt>{t('When')}</dt><dd>{fmtDateTime(m.at)}, {t('{n} min', { n: m.minutes })}</dd>
              <dt>{t('Project')}</dt><dd>{project(m) || t('No project')}</dd>
              <dt>{t('Who was there')}</dt><dd>{m.attendees.join(', ')}</dd>
            </dl>
            {m.summary ? <p className="s2a-read">{m.summary}</p> : <p className="s2a-note">{t('No notes for this meeting yet.')}</p>}
            {!!m.decisions?.length && (<><h3>{t('Decided')}</h3><ul>{m.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul></>)}
            {!!m.actions.length && (
              <>
                <h3>{t('Actions')}</h3>
                <ul className="s2a-rows">{m.actions.map((a, i) => <li key={i} className="s2a-row"><span className="s2a-row__main"><span className="s2a-row__title">{a.title}</span>{a.owner && <span className="s2a-row__sub">{a.owner}</span>}</span>{a.taskId && <Chip tone="success">{t('Task made')}</Chip>}</li>)}</ul>
              </>
            )}
            <div className="ak-actions"><a className="ak-btn" href={`/meet/${m.id}`}>{t('Open the recording and transcript')}</a></div>
          </div>
        )}
      </Drawer>
    </Page>
  );
}
