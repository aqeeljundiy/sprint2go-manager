// The client portal v2 at /v2, for guests (a company's clients). Same props and actions as v1's ClientApp
// (src/clientActions.ts: the server checks every change again). Every section has its own address, so Back and shared
// links work (v1's /chat, /tasks, /drive all opened Home). One name per place, the same on a phone and a computer:
// Home, Requests, Work, Messages, Files, Meetings. Home is readable at every width (the kit's auto-fill grid).
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import type { Todo } from '../types';
import type { ClientApp } from '../components/ClientApp';
import { setBrand } from '../brandInk';
import { setTermWord } from '../terms';
import { can, requestStatus, teamLabel } from '../clientView';
import { isBrief } from '../components/TasksView';
import { kindOf } from '../stages';
import { t } from '../i18n';
import { fmtDateTime } from '../i18n/format';
import { fmtSize } from '../data/drive';
import { Frame, ICON, sidebarHtml, useV2Path } from './Shell';
import { BASE, Card, Chip, DateField, Drawer, Empty, Page, V2, esc, useKitList, when, type V2Ctx } from './ui';

type Props = ComponentProps<typeof ClientApp>;
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Where a piece of work is, in the guest's words (the team's own stage names stay inside). */
const workState = (tk: Todo): [string, 'neutral' | 'info' | 'warn' | 'success'] =>
  tk.approval?.status === 'waiting' ? [t('Needs your approval'), 'warn'] : ({ done: [t('Done'), 'success'], active: [t('In progress'), 'info'], review: [t('In progress'), 'info'], waiting: [t('Waiting on you'), 'warn'], open: [t('Planned'), 'neutral'] } as const)[kindOf(tk)] as [string, 'neutral'];

export function PortalV2(p: Props) {
  const { ws, client, person, access, actions } = p;
  setTermWord(ws.terms?.word);
  const { path, go } = useV2Path();
  useEffect(() => {
    setBrand(ws.color);
  }, [ws.color]);
  const v = actions.view();
  const ctx: V2Ctx = useMemo(() => ({ go, where: `${client.name} · ${ws.name}`, toast: (text, o) => window.AdminKit?.toast(text, o) }), [go, client.name, ws.name]);
  useEffect(() => {
    window.AdminKit?.command.add([{ group: t('Account'), label: t('Sign out'), run: () => p.onSignOut?.() }]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const brand = `${ws.logo ? `<img src="${escape(ws.logo)}" alt="">` : `<span class="s2a-logo" aria-hidden="true">${escape(ws.name.slice(0, 1).toUpperCase())}</span>`}<span><span class="s2a-brand__name">${escape(client.name)}</span><br><span class="s2a-brand__tag">${escape(t('with {company}', { company: ws.name }))}</span></span>`;
  const sidebar = (cur: string) =>
    sidebarHtml({
      base: BASE,
      brand,
      current: cur,
      top: [
        { id: '', label: t('Home'), icon: ICON.home, tab: t('Home') },
        { id: 'work', label: t('Work'), icon: ICON.work, tab: t('Work') },
        { id: 'messages', label: t('Messages'), icon: ICON.chat, tab: t('Messages') },
        { id: 'requests', label: t('Requests'), icon: ICON.requests, tab: t('Requests') },
        { id: 'files', label: t('Files'), icon: ICON.files },
        { id: 'meetings', label: t('Meetings'), icon: ICON.meetings },
      ],
      groups: [],
      foot: [],
    });
  const section = path.slice(BASE.length).replace(/^\/+/, '').split('/')[0];
  const page = section === 'work' ? <Work {...p} /> : section === 'requests' ? <Requests {...p} /> : section === 'messages' ? <Messages {...p} /> : section === 'files' ? <Files {...p} /> : section === 'meetings' ? <Meetings {...p} /> : <Home {...p} />;
  void person; void access; void v;
  return (
    <V2.Provider value={ctx}>
      <Frame path={path} base={BASE} sidebar={sidebar}>
        <div className="s2a-route" key={path}>{page}</div>
      </Frame>
    </V2.Provider>
  );
}

/* ---------------- Home ---------------- */
function Home(p: Props) {
  const { person, actions, quotes = [], client } = p;
  const v = actions.view();
  const work = v.tasks.filter((tk) => tk.source !== 'request' && !isBrief(tk));
  const approvals = work.filter((tk) => tk.approval?.status === 'waiting');
  const requests = v.tasks.filter((tk) => tk.source === 'request');
  const waiting = requests.filter((tk) => requestStatus(tk).cls === 'waiting');
  const toAnswer = quotes.filter((q) => q.clientId === client.id && q.status === 'sent');
  const going = work.filter((tk) => !tk.done && tk.approval?.status !== 'waiting').slice(0, 5);
  const meeting = meets(v).sort((a, b) => b.at.localeCompare(a.at))[0];
  const files = [...v.files].filter((f) => f.kind !== 'folder').sort((a, b) => b.modified.localeCompare(a.modified)).slice(0, 4);
  const news = [...p.notices].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, 4);
  const first = person.name.split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 11 ? t('Good morning, {name}.', { name: first }) : hour < 15 ? t('Good afternoon, {name}.', { name: first }) : t('Good evening, {name}.', { name: first });
  const needs = approvals.length + waiting.length + toAnswer.length;
  return (
    <Page title={t('Home')} sub={greet} actions={can(person, 'request') ? <a className="ak-btn ak-btn--primary" href={`${BASE}/requests?new=1`}>{t('New request')}</a> : undefined}>
      <div className="s2a-cards">
        <Card title={t('Needs you')} aside={needs ? <Chip tone="warn">{String(needs)}</Chip> : undefined}>
          {needs ? (
            <ul className="s2a-rows">
              {toAnswer.map((q) => <li key={q.id}><a className="s2a-row s2a-link" href={`${BASE}/work`}><span className="s2a-row__main"><span className="s2a-row__title">{t('Answer the quote “{title}”', { title: q.title })}</span></span></a></li>)}
              {approvals.map((tk) => <li key={tk.id}><a className="s2a-row s2a-link" href={`${BASE}/work?open=${tk.id}`}><span className="s2a-row__main"><span className="s2a-row__title">{t('Approve “{title}”', { title: tk.title })}</span>{tk.due && <span className="s2a-row__sub">{when(tk.due)}</span>}</span></a></li>)}
              {waiting.map((tk) => <li key={tk.id}><a className="s2a-row s2a-link" href={`${BASE}/requests?open=${tk.id}`}><span className="s2a-row__main"><span className="s2a-row__title">{t('Your request “{title}” is waiting on you', { title: tk.title })}</span></span></a></li>)}
            </ul>
          ) : (
            <Empty title={t('Nothing waiting on you')} />
          )}
        </Card>
        <Card title={t('Your requests')} aside={<a className="ak-btn ak-btn--ghost" href={`${BASE}/requests`}>{t('All requests')}</a>}>
          {requests.length ? (
            <ul className="s2a-rows">{requests.slice(0, 4).map((tk) => <li key={tk.id} className="s2a-row"><span className="s2a-row__main"><span className="s2a-row__title">{tk.title}</span></span><Chip tone="neutral">{t(requestStatus(tk).label)}</Chip></li>)}</ul>
          ) : (
            <Empty title={t('No requests yet')} text={t('Ask the team for something new with New request.')} />
          )}
        </Card>
        <Card title={t('Work in progress')} aside={<a className="ak-btn ak-btn--ghost" href={`${BASE}/work`}>{t('All work')}</a>}>
          {going.length ? (
            <ul className="s2a-rows">{going.map((tk) => <li key={tk.id} className="s2a-row"><span className="s2a-row__main"><span className="s2a-row__title">{tk.title}</span>{tk.due && <span className="s2a-row__sub">{t('Due {day}', { day: when(tk.due) })}</span>}</span><Chip tone={workState(tk)[1]}>{workState(tk)[0]}</Chip></li>)}</ul>
          ) : (
            <Empty title={t('Nothing in progress right now')} />
          )}
        </Card>
        <Card title={t('Latest meeting')} aside={<a className="ak-btn ak-btn--ghost" href={`${BASE}/meetings`}>{t('Meetings')}</a>}>
          {meeting ? (
            <div className="s2a-form"><div><strong>{meeting.title}</strong><p className="s2a-note">{fmtDateTime(meeting.at)}</p></div>{meeting.summary && <p className="s2a-read">{meeting.summary.slice(0, 280)}{meeting.summary.length > 280 ? '…' : ''}</p>}</div>
          ) : (
            <Empty title={t('No meeting notes shared yet')} />
          )}
        </Card>
        <Card title={t('Recent files')} aside={<a className="ak-btn ak-btn--ghost" href={`${BASE}/files`}>{t('Files')}</a>}>
          {files.length ? (
            <ul className="s2a-rows">{files.map((f) => <li key={f.id} className="s2a-row"><span className="s2a-row__main"><span className="s2a-row__title">{f.name}</span><span className="s2a-row__sub">{when(f.modified)}, {fmtSize(f.size)}</span></span></li>)}</ul>
          ) : (
            <Empty title={t('No files shared yet')} />
          )}
        </Card>
        <Card title={t('From the team')} aside={<a className="ak-btn ak-btn--ghost" href={`${BASE}/messages`}>{t('Messages')}</a>}>
          {news.length ? (
            <ul className="s2a-rows">{news.map((n) => <li key={n.id} className="s2a-row"><span className="s2a-row__main"><span className="s2a-row__title">{n.text}</span>{n.at && <span className="s2a-row__sub">{when(n.at)}</span>}</span></li>)}</ul>
          ) : (
            <Empty title={t('No news from the team yet')} />
          )}
        </Card>
      </div>
    </Page>
  );
}

/** Meetings with the notes a guest may read (meetingsFor says whether the notes are shared). */
const meets = (v: ReturnType<Props['actions']['view']>) => v.meetings.map((x) => ({ ...x.meeting, summary: x.notes ? x.meeting.summary : '', actions: x.notes ? x.meeting.actions : [] }));

const openParam = () => new URLSearchParams(location.search).get('open');

/* ---------------- Work (approvals first) ---------------- */
function Work(p: Props) {
  const { person, actions } = p;
  const { toast } = ctxToast();
  const v = actions.view();
  const rows = useMemo(() => v.tasks.filter((tk) => tk.source !== 'request' && !isBrief(tk)), [v.tasks]);
  const [open, setOpen] = useState<string | null>(openParam);
  const [note, setNote] = useState('');
  const { el } = useKitList<Todo>(
    () => ({
      id: 'wk',
      rowId: (r) => r.id,
      searchLabel: t('Search work'),
      search: (r) => r.title,
      views: [
        { value: 'approve', label: t('Needs your approval'), test: (r) => r.approval?.status === 'waiting', count: true, order: 1 },
        { value: 'going', label: t('In progress'), test: (r) => !r.done && r.approval?.status !== 'waiting' },
        { value: 'done', label: t('Done'), test: (r) => r.done },
      ],
      sort: { key: 'due', dir: 1 },
      columns: [
        { key: 'title', label: t('Work'), primary: true, truncate: true, value: (r) => r.title, cell: (r) => `<button type="button" class="s2a-open" data-open>${esc(r.title)}</button>` },
        { key: 'due', label: t('Due'), sort: 'date', value: (r) => r.due ?? '9999', cell: (r) => esc(r.due ? when(r.due) : '') },
        { key: 'state', label: t('Where it is'), value: (r) => workState(r)[0], cell: (r) => `<ak-chip tone="${workState(r)[1]}">${esc(workState(r)[0])}</ak-chip>` },
      ],
      onOpen: (r) => setOpen(r.id),
      summary: (list) => t('{n} pieces of work', { n: list.length }),
      empty: { none: t('The team has not shared any work yet.'), views: { approve: t('Nothing to approve. The team asks here when something is ready.') } },
    }),
    rows,
  );
  const tk = rows.find((r) => r.id === open);
  const decide = (status: 'approved' | 'changes') => {
    if (!tk) return;
    actions.decide(tk.id, status, note.trim());
    toast(status === 'approved' ? t('Approved: {title}', { title: tk.title }) : t('Changes asked on {title}', { title: tk.title }));
    setNote('');
    setOpen(null);
  };
  return (
    <Page title={t('Work')} sub={t('What the team is doing for {client}, and what needs your yes.', { client: p.client.name })}>
      {el}
      <Drawer open={!!tk} onClose={() => setOpen(null)} heading={tk?.title ?? t('Work')}>
        {tk && (
          <div className="s2a-form">
            <dl className="s2a-facts">
              <dt>{t('Where it is')}</dt><dd><Chip tone={workState(tk)[1]}>{workState(tk)[0]}</Chip></dd>
              {tk.due && <><dt>{t('Due')}</dt><dd>{when(tk.due)}</dd></>}
            </dl>
            <History tk={tk} p={p} />
            {tk.approval?.status === 'waiting' && can(person, 'approve') && (
              <form className="s2a-form" onSubmit={(e) => (e.preventDefault(), decide('approved'))}>
                <div className="ak-field"><label htmlFor="wk-note">{t('A note for the team (needed when you ask for changes)')}</label><textarea id="wk-note" className="ak-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></div>
                <div className="ak-actions">
                  <button type="button" className="ak-btn" disabled={!note.trim()} onClick={() => decide('changes')}>{t('Ask for changes')}</button>
                  <button className="ak-btn ak-btn--primary">{t('Approve')}</button>
                </div>
              </form>
            )}
            {can(person, 'comment') && <Comment onSend={(text) => (actions.comment(tk.id, text), toast(t('Comment sent')))} />}
          </div>
        )}
      </Drawer>
    </Page>
  );
}

const ctxToast = () => ({ toast: (text: string) => window.AdminKit?.toast(text) });

function History({ tk, p }: { tk: Todo; p: Props }) {
  const items = (tk.history ?? []).filter((h) => h.kind === 'comment' && h.toClient !== false).slice(-10);
  if (!items.length) return null;
  const who = (by: string) => (by.includes('@') ? (p.actions.view().people.find((x) => x.email.toLowerCase() === by.toLowerCase())?.name ?? by) : teamLabel(p.team.find((u) => u.id === by), p.access, p.ws.name));
  return (
    <div className="s2a-msgs">
      {items.map((h) => <article key={h.id} className="s2a-msg"><b>{who(h.by)}<span>{when(h.at)}</span></b><div className="s2a-read">{h.text}</div></article>)}
    </div>
  );
}

function Comment({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <form className="s2a-form" onSubmit={(e) => (e.preventDefault(), text.trim() && (onSend(text.trim()), setText('')))}>
      <div className="ak-field"><label htmlFor="cm-text">{t('Comment')}</label><textarea id="cm-text" className="ak-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} /></div>
      <div className="ak-actions"><button className="ak-btn" disabled={!text.trim()}>{t('Send comment')}</button></div>
    </form>
  );
}

/* ---------------- Requests ---------------- */
function Requests(p: Props) {
  const { person, actions } = p;
  const { toast } = ctxToast();
  const v = actions.view();
  const rows = useMemo(() => v.tasks.filter((tk) => tk.source === 'request'), [v.tasks]);
  const [open, setOpen] = useState<string | null>(openParam);
  const [creating, setCreating] = useState(() => new URLSearchParams(location.search).has('new'));
  const { el } = useKitList<Todo>(
    () => ({
      id: 'rq',
      rowId: (r) => r.id,
      searchLabel: t('Search requests'),
      search: (r) => r.title,
      views: [
        { value: 'open', label: t('Open'), test: (r) => !r.done, count: true },
        { value: 'waiting', label: t('Waiting on you'), test: (r) => requestStatus(r).cls === 'waiting' },
        { value: 'done', label: t('Done'), test: (r) => r.done },
      ],
      sort: { key: 'at', dir: -1 },
      columns: [
        { key: 'title', label: t('Request'), primary: true, truncate: true, value: (r) => r.title, cell: (r) => `<button type="button" class="s2a-open" data-open>${esc(r.title)}</button>` },
        { key: 'at', label: t('Sent'), sort: 'date', value: (r) => r.createdAt, cell: (r) => esc(when(r.createdAt)) },
        { key: 'state', label: t('Where it is'), value: (r) => requestStatus(r).label, cell: (r) => `<ak-chip tone="${requestStatus(r).cls === 'waiting' ? 'warn' : requestStatus(r).cls === 'done' ? 'success' : 'neutral'}">${esc(t(requestStatus(r).label))}</ak-chip>` },
      ],
      onOpen: (r) => setOpen(r.id),
      summary: (list) => t('{n} requests', { n: list.length }),
      empty: { none: t('No requests yet. New request asks the team for something.') },
    }),
    rows,
  );
  const tk = rows.find((r) => r.id === open);
  return (
    <Page title={t('Requests')} sub={t('What you asked the team for, newest first.')} actions={can(person, 'request') ? <button type="button" className="ak-btn ak-btn--primary" onClick={() => setCreating(true)}>{t('New request')}</button> : undefined}>
      {el}
      <Drawer open={!!tk} onClose={() => setOpen(null)} heading={tk?.title ?? t('Request')}>
        {tk && (
          <div className="s2a-form">
            <dl className="s2a-facts"><dt>{t('Where it is')}</dt><dd>{t(requestStatus(tk).label)}</dd><dt>{t('Sent')}</dt><dd>{fmtDateTime(tk.createdAt)}</dd></dl>
            <History tk={tk} p={p} />
            {can(person, 'comment') && <Comment onSend={(text) => (actions.comment(tk.id, text), toast(t('Comment sent')))} />}
          </div>
        )}
      </Drawer>
      <NewRequest open={creating} onClose={() => setCreating(false)} onSend={(r) => void actions.request({ ...r, files: [] }).then(() => toast(t('Request sent to the team')))} />
    </Page>
  );
}

function NewRequest({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (r: { title: string; details: string; due?: string }) => void }) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [due, setDue] = useState('');
  useEffect(() => {
    if (open) (setTitle(''), setDetails(''), setDue(''));
  }, [open]);
  return (
    <Drawer open={open} onClose={onClose} heading={t('New request')}>
      <form className="s2a-form" onSubmit={(e) => (e.preventDefault(), title.trim() && (onSend({ title: title.trim(), details, due: due || undefined }), onClose()))}>
        <div className="ak-field"><label htmlFor="rq-title">{t('What do you need?')}</label><input id="rq-title" className="ak-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></div>
        <div className="ak-field"><label htmlFor="rq-details">{t('Details')}</label><textarea id="rq-details" className="ak-input" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} /></div>
        <div className="ak-field"><label>{t('Needed by')}</label><DateField label={t('Needed by')} value={due} onChange={setDue} clearable /></div>
        <div className="ak-actions"><button className="ak-btn ak-btn--primary" disabled={!title.trim()}>{t('Send request')}</button></div>
      </form>
    </Drawer>
  );
}

/* ---------------- Messages ---------------- */
function Messages(p: Props) {
  const { actions, messages } = p;
  const v = actions.view();
  const [open, setOpen] = useState<string | null>(openParam() ?? (v.channels.length === 1 ? v.channels[0].id : null));
  const [text, setText] = useState('');
  const ch = v.channels.find((c) => c.id === open);
  const list = ch ? messages.filter((m) => m.channelId === ch.id && !m.parentId).sort((a, b) => a.at.localeCompare(b.at)).slice(-40) : [];
  const who = (m: (typeof messages)[number]) => (m.userId === 'guest' ? (v.people.find((x) => x.email === (m as { guestEmail?: string }).guestEmail)?.name ?? t('Guest')) : teamLabel(p.team.find((u) => u.id === m.userId), p.access, p.ws.name));
  return (
    <Page title={t('Messages')} sub={t('Talk with the team at {company}.', { company: p.ws.name })}>
      <div className="s2a-split">
        <Card title={t('Conversations')} flush>
          {v.channels.length ? (
            <ul className="s2a-rows s2a-pad">
              {v.channels.map((c) => (
                <li key={c.id}><button type="button" className="s2a-row s2a-link" aria-current={c.id === open ? 'true' : undefined} onClick={() => setOpen(c.id)}><span className="s2a-row__main"><span className="s2a-row__title">{c.kind === 'dm' ? t('Direct message') : `# ${c.name}`}</span>{c.topic && <span className="s2a-row__sub">{c.topic}</span>}</span></button></li>
              ))}
            </ul>
          ) : (
            <div className="ak-card__body"><Empty title={t('No conversations shared yet')} /></div>
          )}
        </Card>
        {ch ? (
          <Card title={ch.kind === 'dm' ? t('Direct message') : `# ${ch.name}`}>
            <div className="s2a-form">
              <div className="s2a-msgs">{list.length ? list.map((m) => <article key={m.id} className="s2a-msg"><b>{who(m)}<span>{when(m.at)}</span></b><div className="s2a-read">{m.text}</div></article>) : <p className="s2a-note">{t('No messages yet. Say hello.')}</p>}</div>
              <form className="s2a-form" onSubmit={(e) => (e.preventDefault(), text.trim() && (actions.send(ch.id, { text }), setText('')))}>
                <div className="ak-field"><label htmlFor="pm-text">{t('Message')}</label><textarea id="pm-text" className="ak-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></div>
                <div className="ak-actions"><button className="ak-btn ak-btn--primary" disabled={!text.trim()}>{t('Send')}</button></div>
              </form>
            </div>
          </Card>
        ) : (
          v.channels.length > 0 && <Card><Empty title={t('Pick a conversation')} /></Card>
        )}
      </div>
    </Page>
  );
}

/* ---------------- Files ---------------- */
function Files(p: Props) {
  const v = p.actions.view();
  const rows = useMemo(() => v.files.filter((f) => f.kind !== 'folder'), [v.files]);
  const { el } = useKitList<(typeof rows)[number]>(
    () => ({
      id: 'fl',
      rowId: (r) => r.id,
      searchLabel: t('Search files'),
      search: (r) => r.name,
      views: [
        { value: 'all', label: t('All files') },
        { value: 'yours', label: t('From you'), test: (r) => !!r.uploadedBy },
      ],
      sort: { key: 'modified', dir: -1 },
      columns: [
        { key: 'name', label: t('Name'), primary: true, truncate: true, value: (r) => r.name, cell: (r) => (r.url ? `<a class="s2a-open" href="${esc(r.url)}" target="_blank" rel="noreferrer">${esc(r.name)}</a>` : `<span class="s2a-open">${esc(r.name)}</span>`) },
        { key: 'modified', label: t('Changed'), sort: 'date', value: (r) => r.modified, cell: (r) => esc(when(r.modified)) },
        { key: 'size', label: t('Size'), align: 'end', sort: 'number', hidePhone: true, value: (r) => r.size, cell: (r) => esc(fmtSize(r.size)) },
      ],
      summary: (list) => t('{n} files', { n: list.length }),
      empty: { none: t('No files shared yet.') },
    }),
    rows,
  );
  return (
    <Page title={t('Files')} sub={t('Files the team shared with you, and the ones you sent.')}>
      {el}
    </Page>
  );
}

/* ---------------- Meetings ---------------- */
function Meetings(p: Props) {
  const v = p.actions.view();
  const list = meets(v).sort((a, b) => b.at.localeCompare(a.at));
  const [open, setOpen] = useState<string | null>(openParam);
  const m = list.find((x) => x.id === open);
  return (
    <Page title={t('Meetings')} sub={t('Notes from your meetings with the team.')}>
      <Card flush>
        {list.length ? (
          <ul className="s2a-rows s2a-pad">{list.map((x) => <li key={x.id}><button type="button" className="s2a-row s2a-link" onClick={() => setOpen(x.id)}><span className="s2a-row__main"><span className="s2a-row__title">{x.title}</span><span className="s2a-row__sub">{fmtDateTime(x.at)}</span></span></button></li>)}</ul>
        ) : (
          <div className="ak-card__body"><Empty title={t('No meeting notes shared yet')} /></div>
        )}
      </Card>
      <Drawer open={!!m} onClose={() => setOpen(null)} heading={m?.title ?? t('Meeting')}>
        {m && (
          <div className="s2a-form">
            <p className="s2a-note">{fmtDateTime(m.at)}</p>
            {m.summary ? <p className="s2a-read">{m.summary}</p> : <p className="s2a-note">{t('No notes for this meeting yet.')}</p>}
            {!!m.actions.length && <><h3>{t('Actions')}</h3><ul>{m.actions.map((a, i) => <li key={i}>{a.title}</li>)}</ul></>}
          </div>
        )}
      </Drawer>
    </Page>
  );
}
