// Support › Tickets: find the next ticket to answer, take it, close the done ones. Opens on the open tickets with the
// reply that is due first at the top (the why review: sorted by "updated", the urgent one sat at the bottom).
import { useCallback, useEffect, useRef, useState } from 'react';
import { dateTime, post, rel, PRIORITY_LABEL, STATE_LABEL, type Priority, type TicketRow, type TicketStatus } from '../../api';
import { useAct, useAdmin, useApi } from '../../ui';
import { Card, Chip, Drawer, Dropdown, Failed, Menu, Page, Tabs, esc, useKitList, type Tone } from '../parts';
import { ICON } from '../nav';
import { useSettingsForm } from './Money';
import { t, tn } from '../../../i18n';

/** One word per state. "Not answered yet" is what the old "New" and "Open" both meant to an operator. */
export const TICKET_WORD: Record<TicketStatus, string> = {
  get new() { return t('Not answered'); },
  get open() { return t('In progress'); },
  get waiting() { return t('Waiting on them'); },
  get resolved() { return t('Resolved'); },
  get closed() { return t('Closed'); },
};
const TICKET_TONE: Record<TicketStatus, Tone> = { new: 'info', open: 'neutral', waiting: 'warn', resolved: 'success', closed: 'neutral' };
const live = (tk: TicketRow) => tk.status !== 'resolved' && tk.status !== 'closed';
/** When the next reply is due: the target if there is one, else when it was opened. Oldest first. */
const dueOf = (tk: TicketRow) => tk.dueAt ?? tk.createdAt;
const chip = (s: TicketStatus) => `<ak-chip tone="${TICKET_TONE[s]}">${esc(TICKET_WORD[s])}</ak-chip>`;

type ListData = { tickets: TicketRow[]; operators: string[]; stats: { opened: number; medianFirstReplyMin: number | null; satisfaction: number | null; rated: number } };

export function Tickets() {
  const { me, go, may } = useAdmin();
  const { data, error, reload } = useApi<ListData>('tickets', [], 30_000);
  const act = useAct();
  const [creating, setCreating] = useState(false);
  const { el } = useKitList<TicketRow>(
    () => ({
      id: 'tk',
      rowId: (tk) => tk.id,
      searchLabel: t('Search number, subject, company or email'),
      search: (tk) => [tk.number, tk.subject, tk.company, tk.requester.email, tk.requester.name, tk.tags.join(' ')].join(' '),
      views: [
        { value: 'open', label: t('All open'), test: live, count: true },
        { value: 'mine', label: t('Mine'), test: (tk) => tk.assignee === me.email && live(tk), count: true },
        { value: 'nobody', label: t('Nobody on it'), test: (tk) => !tk.assignee && live(tk), count: true },
        { value: 'all', label: t('All'), test: () => true },
      ],
      filters: [
        { key: 'state', label: t('State'), any: t('Any state'), options: () => [['late', t('Past the reply target')], ['new', TICKET_WORD.new], ['open', TICKET_WORD.open], ['waiting', TICKET_WORD.waiting], ['resolved', TICKET_WORD.resolved], ['closed', TICKET_WORD.closed]], test: (tk, v) => (v === 'late' ? tk.breaching : tk.status === v) },
        { key: 'kind', label: t('Kind'), any: t('Any kind'), options: () => [['abuse', t('Abuse reports')], ['crash', t('Crash reports')], ['urgent', t('Urgent')]], test: (tk, v) => (v === 'abuse' ? tk.tags.includes('abuse') : v === 'crash' ? tk.channel === 'crash' : tk.priority === 'urgent') },
      ],
      sort: { key: 'due', dir: 1 },
      columns: [
        { key: 'subject', label: t('Ticket'), primary: true, truncate: true, value: (tk) => tk.number, sort: 'number', cell: (tk) => `<a class="s2k-link" href="/admin/v2/tickets/${esc(tk.id)}">#${tk.number} ${esc(tk.subject)}</a><br><span class="ak-muted">${esc(tk.requester.name ?? tk.requester.email)}</span>` },
        { key: 'company', label: t('Company'), hidePhone: true, value: (tk) => tk.company ?? '', cell: (tk) => (tk.company ? esc(tk.company) : `<span class="ak-muted">${esc(t('no company'))}</span>`) },
        { key: 'status', label: t('State'), value: (tk) => ['new', 'open', 'waiting', 'resolved', 'closed'].indexOf(tk.status), sort: 'number', cell: (tk) => chip(tk.status) + (tk.priority === 'urgent' || tk.priority === 'high' ? ` <ak-chip tone="danger" plain>${esc(PRIORITY_LABEL[tk.priority])}</ak-chip>` : '') },
        { key: 'assignee', label: t('On it'), hidePhone: true, value: (tk) => tk.assignee ?? '', cell: (tk) => (tk.assignee ? esc(tk.assignee === me.email ? t('You') : tk.assignee.split('@')[0]) : `<span class="ak-muted">${esc(t('nobody'))}</span>`) },
        { key: 'due', label: t('Reply due'), align: 'end', sort: 'date', value: (tk) => dueOf(tk), cell: (tk) => (!live(tk) ? `<span class="ak-muted">${esc(rel(tk.updatedAt))}</span>` : tk.breaching ? `<ak-chip tone="danger">${esc(t('was due {ago}', { ago: rel(dueOf(tk)) }))}</ak-chip>` : esc(tk.dueAt ? rel(tk.dueAt) : t('opened {ago}', { ago: rel(tk.createdAt) }))) },
      ],
      actions: may('support') ? [{ key: 'take', label: t('Assign to me'), icon: ICON.team, show: (tk) => live(tk) && tk.assignee !== me.email, run: (tk) => void act(() => post('ticket/update', { id: tk.id, assignee: me.email }), t('#{n} is yours', { n: tk.number })) }] : [],
      bulk: may('support')
        ? [
            { key: 'mine', label: t('Assign to me'), run: (rows) => void act(() => post('ticket/update', { ids: rows.map((x) => x.id), assignee: me.email }), tn(rows.length, '{n} assigned to you', '{n} assigned to you')) },
            { key: 'resolve', label: t('Resolve'), run: (rows) => void act(() => post('ticket/update', { ids: rows.map((x) => x.id), status: 'resolved' }), tn(rows.length, '{n} resolved', '{n} resolved')) },
          ]
        : [],
      onOpen: (tk) => go(`/admin/v2/tickets/${tk.id}`),
      summary: (rows) => tn(rows.length, '{n} ticket', '{n} tickets'),
      empty: { none: `<b>${esc(t('No tickets yet.'))}</b>`, views: { open: `<b>${esc(t('Nothing waiting.'))}</b><br>${esc(t('Every ticket is answered.'))}` } },
    }),
    data?.tickets ?? null,
  );
  const late = data?.tickets.filter((tk) => tk.breaching).length ?? 0;
  return (
    <Page
      title={t('Tickets')}
      sub={data ? (late ? tn(late, '{n} ticket is past the reply target. Due first is on top.', '{n} tickets are past the reply target. Due first is on top.') : t('Reply due first is on top.')) : undefined}
      actions={<><a className="ak-btn" href="/admin/v2/tickets/settings">{t('Support settings')}</a>{may('support') && <button className="ak-btn ak-btn--primary" type="button" onClick={() => setCreating(true)}>{t('Log a ticket')}</button>}</>}
    >
      {error && <Failed error={error} retry={reload} />}
      <ak-stats>
        <ak-stat label={t('Past the reply target')} value={String(data ? late : '')} tone={late ? 'danger' : undefined} href="/admin/v2/tickets?state=late" count-in="off" />
        <ak-stat label={t('Nobody on it')} value={String(data?.tickets.filter((tk) => !tk.assignee && live(tk)).length ?? '')} href="/admin/v2/tickets?view=nobody" count-in="off" />
        {data?.stats.medianFirstReplyMin != null && <ak-stat label={t('First reply, median')} value={String(data.stats.medianFirstReplyMin)} hint={t('minutes, last 30 days')} count-in="off" />}
        {data?.stats.satisfaction != null && <ak-stat label={t('Happy with the answer')} value={String(data.stats.satisfaction / 100)} format="percent" hint={tn(data.stats.rated, 'of {n} rating', 'of {n} ratings')} count-in="off" />}
      </ak-stats>
      {el}
      <NewTicket open={creating} onClose={() => setCreating(false)} onDone={(id) => (setCreating(false), go(`/admin/v2/tickets/${id}`))} />
    </Page>
  );
}

function NewTicket({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => onClose(), [onClose]);
  return (
    <Drawer open={open} onClose={close} heading={t('Log a ticket')}>
      <form
        className="s2k-form"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          post<{ id: string }>('ticket/create', { email, subject, body, priority })
            .then((r) => onDone(r.id))
            .catch((e: Error) => window.AdminKit.toast.error(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <p className="ak-muted">{t('For a call, a WhatsApp message or a conversation: the ticket is linked to the person and company by email, and it is yours.')}</p>
        <div className="ak-field"><label htmlFor="nt-email">{t('Their email')}</label><input id="nt-email" className="ak-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="ak-field"><label htmlFor="nt-subject">{t('Subject')}</label><input id="nt-subject" className="ak-input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div className="ak-field"><label htmlFor="nt-body">{t('What they asked')}</label><textarea id="nt-body" className="ak-input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <div className="ak-field"><label>{t('Priority')}</label><Dropdown label={t('Priority')} value={priority} onChange={(v) => setPriority(v as Priority)} options={(['low', 'normal', 'high', 'urgent'] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} /></div>
        <div className="s2k-row"><button className="ak-btn ak-btn--primary" disabled={busy || !email.includes('@') || !subject.trim()}>{t('Create')}</button><button className="ak-btn ak-btn--ghost" type="button" onClick={onClose}>{t('Cancel')}</button></div>
      </form>
    </Drawer>
  );
}

interface TicketData {
  ticket: TicketRow & { mergedInto: string | null };
  messages: { id: string; at: string; kind: 'customer' | 'operator' | 'system'; author: string; authorName: string | null; body: string; internal: boolean; attachments: { name: string; url: string; size?: string; blocked?: string }[] }[];
  company: { id: string; name: string; state: keyof typeof STATE_LABEL; mrr: number; people: number; health: { score: number; label: string }; lastActive: string | null } | null;
  person: { id: string; name: string; email: string; lastSeen: string | null; companies: { id: string; name: string }[] } | null;
  others: { id: string; number: number; subject: string; status: TicketStatus; updatedAt: string }[];
  macros: { id: string; title: string; body: string }[];
  operators: string[];
}

export function TicketPage({ id }: { id: string }) {
  const { me, go, may, signInAs } = useAdmin();
  const { data, error, reload } = useApi<TicketData>(`ticket?id=${encodeURIComponent(id)}`, [], 20_000);
  const act = useAct();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [count]);
  if (error) return <Page title={t('Ticket')}><Failed error={error} retry={reload} /></Page>;
  if (!data) return <Page title={t('Ticket')}><section className="ak-card"><ak-placeholder kind="list" rows="5" /></section></Page>;
  const tk = data.ticket;
  const update = (patch: Record<string, unknown>, done: string) => void act(() => post('ticket/update', { id: tk.id, ...patch }), done).then(reload);
  const send = async (status?: TicketStatus) => {
    if (!text.trim()) return;
    setBusy(true);
    const internal = mode === 'note';
    const ok = await act(() => post('ticket/reply', { id: tk.id, body: text, internal, status }), internal ? t('Note added') : status === 'resolved' ? t('Sent and resolved') : t('Sent'));
    setBusy(false);
    if (ok) (setText(''), reload());
  };
  const first = (data.person?.name ?? tk.requester.name ?? '').split(' ')[0];
  return (
    <Page
      title={`#${tk.number} ${tk.subject}`}
      tabTitle={t('Ticket #{n}', { n: tk.number })}
      sub={<>{tk.company ?? tk.requester.email} · {t('opened {ago}', { ago: rel(tk.createdAt) })} · <Chip tone={TICKET_TONE[tk.status]}>{TICKET_WORD[tk.status]}</Chip>{tk.breaching && <> <Chip tone="danger">{t('Past the reply target')}</Chip></>}</>}
      actions={
        <>
          <Menu
            label={t('More')}
            items={[
              { label: t('Copy link'), run: () => void navigator.clipboard?.writeText(location.href).then(() => window.AdminKit.toast(t('Link copied'))) },
              may('support') && {
                label: t('Merge into another ticket…'),
                run: () =>
                  void window.AdminKit.prompt({ title: t('Merge #{n} into which ticket?', { n: tk.number }), label: t('Ticket number'), confirmLabel: t('Merge') }).then((n) => n && void act(() => post<{ id: string }>('ticket/merge', { id: tk.id, into: n.trim() }).then((r) => go(`/admin/v2/tickets/${r.id}`)), t('Merged'))),
              },
              may('support') && tk.status !== 'closed' && { label: t('Close without reply'), run: () => update({ status: 'closed' }, t('Closed')) },
              may('impersonate') && data.person && 'divider',
              may('impersonate') && data.person && { label: t('Sign in as {name}…', { name: first || data.person.name }), danger: true, run: () => signInAs(data.person!.id, tk.number) },
            ]}
          />
          {may('support') && live(tk) && tk.assignee !== me.email && <button className="ak-btn" type="button" onClick={() => update({ assignee: me.email }, t('Given to you'))}>{t('Assign to me')}</button>}
          {may('support') && live(tk) && <button className="ak-btn ak-btn--primary" type="button" onClick={() => update({ status: 'resolved' }, t('Resolved'))}>{t('Resolve')}</button>}
        </>
      }
    >
      <div className="s2k-split">
        <div className="ak-stack">
          <Card flush>
            <ul className="s2k-rows s2k-msgs">
              {data.messages.map((m) => (
                <li key={m.id} data-kind={m.kind} data-internal={m.internal ? '' : undefined}>
                  <div className="s2k-rows__main">
                    <span className="s2k-row">
                      <b>{m.kind === 'operator' ? (m.author === me.email ? t('You') : (m.authorName ?? m.author)) : (m.authorName ?? m.author)}</b>
                      {m.internal && <Chip tone="warn">{t('Internal note')}</Chip>}
                      <span className="ak-muted" title={dateTime(m.at)}>{rel(m.at)}</span>
                    </span>
                    <p className="s2k-pre">{m.body}</p>
                    {m.attachments.map((a, j) => (a.blocked ? <small key={j}>{a.name} · {a.blocked}</small> : <a key={a.url} className="s2k-link" href={a.url} target="_blank" rel="noreferrer">{a.name}{a.size ? ` (${a.size})` : ''}</a>))}
                  </div>
                </li>
              ))}
            </ul>
            <div ref={end} />
          </Card>
          {may('support') && (
            <Card title={mode === 'note' ? t('Internal note') : t('Reply to {name}', { name: first || tk.requester.email })} aside={<Tabs id="tk-mode" value={mode} onChange={setMode} items={[{ id: 'reply', label: t('Reply') }, { id: 'note', label: t('Internal note') }]} />}>
              <div className="ak-stack">
                <textarea className="ak-input" aria-label={t('Message')} rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === 'note' ? t('Only operators see this') : t('Write your reply')} />
                <div className="s2k-row">
                  <button className="ak-btn ak-btn--primary" type="button" disabled={busy || !text.trim()} onClick={() => void send(mode === 'note' ? undefined : 'waiting')}>{mode === 'note' ? t('Add note') : t('Send')}</button>
                  {mode === 'reply' && <button className="ak-btn" type="button" disabled={busy || !text.trim()} onClick={() => void send('resolved')}>{t('Send and resolve')}</button>}
                  {data.macros.length > 0 && (
                    <Menu label={t('Saved replies')} items={data.macros.map((m) => ({ label: m.title, run: () => setText((x) => (x ? `${x}\n\n` : '') + m.body.replace(/\{name\}/g, first).replace(/\{me\}/g, me.name.split(' ')[0])) }))} />
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
        <div className="ak-stack">
          <Card title={t('Ticket')}>
            <div className="ak-stack">
              <div className="ak-field"><label>{t('State')}</label><Dropdown block label={t('State')} disabled={!may('support')} value={tk.status} onChange={(v) => update({ status: v }, t('Now {state}', { state: TICKET_WORD[v as TicketStatus].toLowerCase() }))} options={(['new', 'open', 'waiting', 'resolved', 'closed'] as TicketStatus[]).map((s) => ({ value: s, label: TICKET_WORD[s] }))} /></div>
              <div className="ak-field"><label>{t('Priority')}</label><Dropdown block label={t('Priority')} disabled={!may('support')} value={tk.priority} onChange={(v) => update({ priority: v }, t('Priority changed'))} options={(['low', 'normal', 'high', 'urgent'] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} /></div>
              <div className="ak-field"><label>{t('On it')}</label><Dropdown block label={t('On it')} disabled={!may('support')} value={tk.assignee ?? ''} onChange={(v) => update({ assignee: v || null }, v ? t('Given to {who}', { who: v === me.email ? t('you') : v }) : t('Nobody on it now'))} options={[{ value: '', label: t('Nobody') }, ...data.operators.map((o) => ({ value: o, label: o === me.email ? t('You') : o }))]} /></div>
              {tk.tags.length > 0 && <div className="s2k-row">{tk.tags.map((x) => <Chip key={x} plain>{x}</Chip>)}</div>}
            </div>
          </Card>
          {(data.person || data.company) && (
            <Card title={t('Who')}>
              <dl className="s2k-kv">
                {data.person && (<><dt>{t('Person')}</dt><dd><a className="s2k-link" href={`/admin/v2/people/${data.person.id}`}>{data.person.name}</a><br /><span className="ak-muted">{data.person.email}</span></dd><dt>{t('Last here')}</dt><dd>{data.person.lastSeen ? rel(data.person.lastSeen) : t('never signed in')}</dd></>)}
                {data.company && (<><dt>{t('Company')}</dt><dd><a className="s2k-link" href={`/admin/v2/companies/${data.company.id}`}>{data.company.name}</a></dd><dt>{t('Plan')}</dt><dd>{STATE_LABEL[data.company.state]}</dd><dt>{t('Health')}</dt><dd>{data.company.health.score}</dd></>)}
              </dl>
            </Card>
          )}
          {data.others.length > 0 && (
            <Card title={t('Their other tickets')} flush>
              <ul className="s2k-rows">{data.others.map((o) => <li key={o.id}><span className="s2k-rows__main"><a className="s2k-link" href={`/admin/v2/tickets/${o.id}`}>#{o.number} {o.subject}</a><small>{TICKET_WORD[o.status]} · {rel(o.updatedAt)}</small></span></li>)}</ul>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}

/** Support settings, next to the tickets they shape: reply targets and saved replies (were in Team & settings). */
export function TicketSettings() {
  const { may } = useAdmin();
  const act = useAct();
  const { s, setS, changed, save, undo } = useSettingsForm();
  const macros = useApi<{ macros: { id: string; title: string; body: string; by: string; at: string }[] }>('macros');
  const [edit, setEdit] = useState<{ id?: string; title: string; body: string } | null>(null);
  const can = may('support');
  const hours = (k: 'urgent' | 'paid' | 'other', label: string) => s && (
    <div className="ak-field"><label htmlFor={`sla-${k}`}>{label}</label><input id={`sla-${k}`} className="ak-input" inputMode="numeric" disabled={!may('team')} value={String(s.slaHours[k])} onChange={(e) => setS({ ...s, slaHours: { ...s.slaHours, [k]: Number(e.target.value.replace(/\D/g, '')) || 1 } })} /></div>
  );
  return (
    <Page title={t('Support settings')} sub={t('How fast we answer, and the replies we reuse.')} actions={<a className="ak-btn" href="/admin/v2/tickets">{t('Back to tickets')}</a>}>
      <div className="ak-columns">
        <Card title={t('First reply within (hours)')}>
          {!s ? <ak-placeholder lines="4" /> : (
            <div className="s2k-form">
              {hours('urgent', t('Urgent tickets'))}
              {hours('paid', t('Paying companies'))}
              {hours('other', t('Everyone else'))}
              <div className="ak-field"><label htmlFor="sla-name">{t('Name on our replies')}</label><input id="sla-name" className="ak-input" disabled={!may('team')} value={s.supportName} onChange={(e) => setS({ ...s, supportName: e.target.value })} /></div>
              {may('team') && <div className="s2k-row"><button className="ak-btn ak-btn--primary" type="button" disabled={!changed} onClick={save}>{t('Save')}</button>{changed && <button className="ak-btn ak-btn--ghost" type="button" onClick={undo}>{t('Undo changes')}</button>}</div>}
            </div>
          )}
        </Card>
        <Card title={t('Saved replies')} aside={can && <button className="ak-btn" type="button" onClick={() => setEdit({ title: '', body: '' })}>{t('New saved reply')}</button>} flush>
          {!macros.data ? <ak-placeholder lines="3" /> : macros.data.macros.length === 0 ? <div className="ak-card__body ak-muted">{t('None yet. Use {name} for their first name and {me} for yours.', { name: '{name}', me: '{me}' })}</div> : (
            <ul className="s2k-rows">{macros.data.macros.map((m) => <li key={m.id}><span className="s2k-rows__main"><b>{m.title}</b><small>{m.body.slice(0, 120)}</small></span>{can && <><button className="ak-btn" type="button" onClick={() => setEdit({ id: m.id, title: m.title, body: m.body })}>{t('Edit')}</button><button className="ak-btn ak-btn--ghost" type="button" onClick={() => void act(() => post('macro', { delete: m.id }), t('Deleted')).then(macros.reload)}>{t('Delete')}</button></>}</li>)}</ul>
          )}
        </Card>
      </div>
      <Drawer open={!!edit} onClose={() => setEdit(null)} heading={edit?.id ? t('Edit saved reply') : t('New saved reply')}>
        {edit && (
          <form className="s2k-form" onSubmit={(e) => (e.preventDefault(), void act(() => post('macro', edit), t('Saved')).then((ok) => ok && (setEdit(null), macros.reload())))}>
            <div className="ak-field"><label htmlFor="mc-title">{t('Title')}</label><input id="mc-title" className="ak-input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
            <div className="ak-field"><label htmlFor="mc-body">{t('Reply')}</label><textarea id="mc-body" className="ak-input" rows={8} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></div>
            <div className="s2k-row"><button className="ak-btn ak-btn--primary" disabled={!edit.title.trim() || !edit.body.trim()}>{t('Save')}</button><button className="ak-btn ak-btn--ghost" type="button" onClick={() => setEdit(null)}>{t('Cancel')}</button></div>
          </form>
        )}
      </Drawer>
    </Page>
  );
}
