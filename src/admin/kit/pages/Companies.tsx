// Customers › Companies: find a company, see who pays, who is at risk, whose trial ends. "Unlimited" is one view here
// (the old Whitelist page), named as customers see it in the app. Deletion requests are a view too.
import { Fragment, useCallback, useState } from 'react';
import { day, planLabel, post, rel, rp, rpShort, STATE_LABEL, type CompanyRow, type State } from '../../api';
import { useAct, useAdmin, useApi } from '../../ui';
import { Card, Chip, Drawer, Dropdown, Failed, Menu, Page, Tabs, esc, useKitList, type Tone } from '../parts';
import { GRACE_DAYS, isNewCompany } from '../rules';
import { TICKET_WORD } from './Tickets';
import { t, tn } from '../../../i18n';

const STATE_TONE: Record<State, Tone> = { free: 'neutral', trial: 'info', paused: 'neutral', comp: 'info', paying: 'success', suspended: 'danger', unlimited: 'info' };
/** Health with the grace period: a company in its first days is "Not started yet", never "At risk". */
const healthWord = (c: CompanyRow) => (isNewCompany(c) ? t('Not started yet') : c.health.label === 'risk' ? t('At risk') : c.health.label === 'watch' ? t('Watch') : t('Healthy'));
const healthTone = (c: CompanyRow): Tone => (isNewCompany(c) ? 'neutral' : c.health.label === 'risk' ? 'danger' : c.health.label === 'watch' ? 'warn' : 'success');
const atRisk = (c: CompanyRow) => !c.internal && !isNewCompany(c) && c.health.label === 'risk' && (c.state === 'paying' || c.state === 'trial');
const trialEnding = (c: CompanyRow) => c.state === 'trial' && !!c.plan?.trialEnds && new Date(c.plan.trialEnds).getTime() - Date.now() < 7 * 86_400_000;
const TIERS = [{ value: 'free', label: 'Free' }, { value: 'small', label: 'Small' }, { value: 'studio', label: 'Studio' }, { value: 'agency', label: 'Agency' }, { value: 'business', label: 'Business' }];

export function Companies() {
  const { go, may } = useAdmin();
  const { data, error, reload } = useApi<{ companies: CompanyRow[] }>('companies');
  const [creating, setCreating] = useState(false);
  const { el } = useKitList<CompanyRow>(
    () => ({
      id: 'co',
      rowId: (c) => c.id,
      searchLabel: t('Search company, owner or domain'),
      search: (c) => [c.name, c.owner?.name, c.owner?.email, c.domains.join(' '), c.industry].join(' '),
      views: [
        { value: 'customers', label: t('Customers'), test: (c) => !c.internal },
        { value: 'paying', label: t('Paying'), test: (c) => !c.internal && c.state === 'paying', count: true },
        { value: 'trial', label: t('Trial ending'), test: (c) => !c.internal && trialEnding(c), count: true, order: 1 },
        { value: 'risk', label: t('At risk'), test: atRisk, count: true },
        { value: 'unlimited', label: t('Unlimited'), test: (c) => c.state === 'unlimited' || !!c.plan?.unlimited },
      ],
      filters: [
        { key: 'state', label: t('State'), any: t('Any state'), options: () => (Object.keys(STATE_LABEL) as State[]).map((s) => [s, STATE_LABEL[s]]), test: (c, v) => c.state === v },
        { key: 'more', label: t('Also'), any: t('Everything'), options: () => [['ours', t('Ours and tests')], ['new', t('Not started yet')], ['suspended', t('Suspended')]], test: (c, v) => (v === 'ours' ? c.internal : v === 'new' ? isNewCompany(c) : !!c.suspended) },
      ],
      sort: { key: 'name', dir: 1 },
      columns: [
        { key: 'name', label: t('Company'), primary: true, truncate: true, sort: 'text', value: (c) => c.name.toLowerCase(), cell: (c) => `<a class="s2k-link" href="/admin/v2/companies/${esc(c.id)}">${esc(c.name)}</a><br><span class="ak-muted">${esc(c.owner?.email ?? t('no owner'))}</span>` },
        { key: 'plan', label: t('Plan'), hidePhone: true, value: (c) => planLabel(c.plan), sort: 'text', cell: (c) => `<ak-chip tone="${STATE_TONE[c.state]}">${esc(STATE_LABEL[c.state])}</ak-chip><br><span class="ak-muted">${esc(planLabel(c.plan))}${c.state === 'trial' && c.plan?.trialEnds ? ' · ' + esc(t('ends {day}', { day: day(c.plan.trialEnds) })) : ''}</span>` },
        { key: 'mrr', label: t('Per month'), align: 'end', sort: 'number', value: (c) => c.mrr || c.after || 0, cell: (c) => (c.mrr ? esc(rp(c.mrr)) : c.after ? `<span class="ak-muted">${esc(t('{amount} later', { amount: rpShort(c.after) }))}</span>` : `<span class="ak-muted">${esc(t('none'))}</span>`) },
        { key: 'health', label: t('Health'), sort: 'number', value: (c) => (isNewCompany(c) ? 101 : c.health.score), cell: (c) => `<ak-chip tone="${healthTone(c)}">${esc(healthWord(c))}${isNewCompany(c) ? '' : ' ' + c.health.score}</ak-chip>` },
        { key: 'people', label: t('People'), hidePhone: true, align: 'end', sort: 'number', value: (c) => c.people, cell: (c) => String(c.people) },
        { key: 'last', label: t('Last here'), hidePhone: true, sort: 'date', value: (c) => c.lastActive ?? '', cell: (c) => (c.lastActive ? esc(rel(c.lastActive)) : `<span class="ak-muted">${esc(t('never'))}</span>`) },
      ],
      onOpen: (c) => go(`/admin/v2/companies/${c.id}`),
      summary: (rows) => `${tn(rows.length, '{n} company', '{n} companies')} · ${rp(rows.reduce((s, c) => s + (c.mrr || 0), 0))} ${t('per month')}`,
      empty: { views: { risk: `<b>${esc(t('Nobody at risk.'))}</b><br>${esc(t('New companies count as "Not started yet" for their first {n} days.', { n: GRACE_DAYS }))}`, unlimited: `<b>${esc(t('No Unlimited companies.'))}</b><br>${esc(t('Open a company and choose "Make Unlimited" under More.'))}` } },
    }),
    data?.companies ?? null,
  );
  const real = data?.companies.filter((c) => !c.internal) ?? [];
  return (
    <Page title={t('Companies')} sub={data ? t('{n} customers, {paying} paying', { n: real.length, paying: real.filter((c) => c.state === 'paying').length }) : undefined} actions={may('customers') && <button className="ak-btn ak-btn--primary" type="button" onClick={() => setCreating(true)}>{t('New company')}</button>}>
      {error && <Failed error={error} retry={reload} />}
      <ak-stats>
        <ak-stat label={t('Paying')} value={String(data ? real.filter((c) => c.state === 'paying').length : '')} href="/admin/v2/companies?view=paying" count-in="off" />
        <ak-stat label={t('Trial ending this week')} value={String(data ? real.filter(trialEnding).length : '')} href="/admin/v2/companies?view=trial" count-in="off" />
        <ak-stat label={t('At risk')} value={String(data ? real.filter(atRisk).length : '')} tone={real.some(atRisk) ? 'warn' : undefined} href="/admin/v2/companies?view=risk" hint={t('after their first {n} days', { n: GRACE_DAYS })} count-in="off" />
        <ak-stat label={t('Booked per month')} value={String(data ? real.reduce((s, c) => s + (c.mrr || 0), 0) : '')} format="currency:IDR" count-in="off" />
      </ak-stats>
      {el}
      <NewCompany open={creating} onClose={() => setCreating(false)} onDone={(id) => (setCreating(false), go(`/admin/v2/companies/${id}`))} />
    </Page>
  );
}

function NewCompany({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [owner, setOwner] = useState('');
  const [tier, setTier] = useState('studio');
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => onClose(), [onClose]);
  return (
    <Drawer open={open} onClose={close} heading={t('New company')}>
      <form
        className="s2k-form"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          post<{ id: string; link: string | null }>('company/create', { name, ownerEmail: email, ownerName: owner, tier, trialDays: 14, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
            .then((r) => (window.AdminKit.toast.success(t('{name} created', { name }), r.link ? { description: t('Invite link copied') } : undefined), r.link && navigator.clipboard?.writeText(r.link), onDone(r.id)))
            .catch((e: Error) => window.AdminKit.toast.error(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <div className="ak-field"><label htmlFor="nc-name">{t('Company name')}</label><input id="nc-name" className="ak-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="ak-field"><label htmlFor="nc-owner">{t('Owner name')}</label><input id="nc-owner" className="ak-input" value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
        <div className="ak-field"><label htmlFor="nc-email">{t('Owner email')}</label><input id="nc-email" className="ak-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="ak-field"><label>{t('Plan, after a 14-day trial')}</label><Dropdown block label={t('Plan')} value={tier} onChange={setTier} options={TIERS} /></div>
        <div className="s2k-row"><button className="ak-btn ak-btn--primary" disabled={busy || !name.trim() || !email.includes('@')}>{t('Create company')}</button><button className="ak-btn ak-btn--ghost" type="button" onClick={onClose}>{t('Cancel')}</button></div>
      </form>
    </Drawer>
  );
}

interface Member { id: string; name: string; email: string; role: string; lastSeen?: string | null }
interface Invoice { id: string; number: string; period: string; total: number; status: 'draft' | 'sent' | 'paid' | 'void'; dueAt: string; paidAt: string | null }
type Full = CompanyRow & {
  members: Member[];
  accounts: { id: string; email: string; kind: string; provider: string; users: number; sendPaused: { at: string; reason: string } | null }[];
  usage: { job: string; provider: string; model: string; uses: number; rp: number }[];
  appsUsed: { coll: string; n: number }[];
  mail: { received: number; spam: number; sent: number; boosted: number; failed: number; queued: number };
  invoices: Invoice[];
  tickets: { id: string; number: number; subject: string; status: 'new' | 'open' | 'waiting' | 'resolved' | 'closed'; updatedAt: string; requester: string }[];
  notes: { id: string; by: string; text: string; pinned: boolean; at: string }[];
  timeline: { at: string; kind: 'event' | 'operator'; type: string; text: string | null; by: string | null }[];
  deletion: { runAt: string; requestedBy: string } | null;
};
const INVOICE_TONE: Record<Invoice['status'], Tone> = { draft: 'neutral', sent: 'warn', paid: 'success', void: 'neutral' };

export function CompanyPage({ id, tab }: { id: string; tab?: string }) {
  const { go, may, signInAs } = useAdmin();
  const { data, error, reload } = useApi<{ company: Full }>(`company?id=${encodeURIComponent(id)}`);
  const act = useAct();
  const [tabNow, setTabTo] = useState(tab || 'overview');
  const view = tabNow;
  if (error) return <Page title={t('Company')}><Failed error={error} retry={reload} /></Page>;
  if (!data) return <Page title={t('Company')}><section className="ak-card"><ak-placeholder kind="list" rows="6" /></section></Page>;
  const c = data.company;
  const owner = c.members.find((m) => m.role === 'owner');
  const p = c.plan;
  const unlimited = c.state === 'unlimited' || !!p?.unlimited;
  const ask = async (title: string, body: string, label: string, run: () => Promise<unknown>, done: string, danger = true) => {
    if (await window.AdminKit.confirm({ title, body, confirmLabel: label, tone: danger ? 'danger' : undefined })) void act(run, done).then(reload);
  };
  const reason = (title: string) => window.AdminKit.prompt({ title, label: t('Reason (they see it)') });
  return (
    <Page
      title={c.name}
      sub={<><Chip tone={STATE_TONE[c.state]}>{STATE_LABEL[c.state]}</Chip> <Chip tone={healthTone(c)}>{healthWord(c)}</Chip> {[planLabel(p), tn(c.people, '{n} person', '{n} people'), c.since ? t('since {date}', { date: day(c.since) }) : ''].filter(Boolean).join(' · ')}</>}
      actions={
        <>
          <Menu
            label={t('More')}
            items={[
              may('customers') && (unlimited ? { label: t('Take off Unlimited'), run: () => void ask(t('Take {name} off Unlimited?', { name: c.name }), t('They go back to their plan before, with its limits and bills.'), t('Take off Unlimited'), () => post('whitelist/remove', { workspaceId: c.id }), t('Back on their plan')) } : { label: t('Make Unlimited…'), run: () => void reason(t('Why is {name} Unlimited?', { name: c.name })).then((note) => note !== null && void act(() => post('whitelist/add', { workspaceId: c.id, note, aiUnit: 'usd', aiLimit: 25, sesLimit: 5000 }), t('{name} is Unlimited now', { name: c.name })).then(reload)) }),
              may('customers') && (c.suspended ? { label: t('Lift the suspension'), run: () => void act(() => post('company/suspend', { id, on: false }), t('Suspension lifted')).then(reload) } : { label: t('Suspend…'), run: () => void reason(t('Suspend {name}?', { name: c.name })).then((r) => r && void ask(t('Suspend {name}?', { name: c.name }), t('Everyone there keeps read access and sees the reason; nothing can be changed until you lift it.'), t('Suspend'), () => post('company/suspend', { id, reason: r, why: 'other' }), t('Suspended'))) }),
              may('customers') && { label: c.internal ? t('Count as a customer') : t('Mark as ours or a test'), run: () => void act(() => post('company/internal', { id, on: !c.internal }), c.internal ? t('Counted again') : t('Left out of the numbers')).then(reload) },
              may('customers') && { label: t('Export its data'), run: () => location.assign(`/api/admin/company/export?id=${encodeURIComponent(id)}`) },
              may('impersonate') && owner && 'divider',
              may('impersonate') && owner && { label: t('Sign in as the owner…'), danger: true, run: () => signInAs(owner.id) },
              may('danger') && 'divider',
              may('danger') && (c.deletion ? { label: t('Cancel the scheduled deletion'), run: () => void act(() => post('company/delete-request', { id, cancel: true }), t('Deletion cancelled')).then(reload) } : { label: t('Delete in 30 days…'), danger: true, run: () => void reason(t('Who asked for the deletion?')).then((who) => who && void ask(t('Delete {name} in 30 days?', { name: c.name }), t('Everything in it is deleted in 30 days. Until then it can be cancelled here.'), t('Schedule deletion'), () => post('company/delete-request', { id, requestedBy: who }), t('Deletion scheduled'))) }),
            ]}
          />
          {may('billing') && <button className="ak-btn ak-btn--primary" type="button" onClick={() => go(`/admin/v2/companies/${id}/billing`)}>{t('Change plan')}</button>}
        </>
      }
    >
      {c.suspended && <div className="ak-banner" data-tone="danger"><div><strong>{t('Suspended {when} by {who}', { when: rel(c.suspended.at), who: c.suspended.by })}</strong>{c.suspended.reason}</div></div>}
      {c.deletion && <div className="ak-banner" data-tone="warn"><div><strong>{t('Deleted {when} ({date})', { when: rel(c.deletion.runAt), date: day(c.deletion.runAt) })}</strong>{t('Asked by {who}.', { who: c.deletion.requestedBy })}</div></div>}
      <Tabs
        id="co-tabs"
        value={view}
        onChange={(v) => (history.replaceState(null, '', `/admin/v2/companies/${id}/${v}`), setTabTo(v))}
        items={[
          { id: 'overview', label: t('Overview') },
          { id: 'people', label: t('People'), count: c.people },
          { id: 'billing', label: t('Billing'), count: c.overdue },
          { id: 'tickets', label: t('Tickets'), count: c.openTickets },
          { id: 'mailboxes', label: t('Mailboxes'), count: c.accounts.length },
          { id: 'notes', label: t('Notes'), count: c.notes.length },
        ]}
      />
      {view === 'overview' && (
        <div className="s2k-split">
          <div className="ak-stack">
            <ak-stats>
              <ak-stat label={t('Pays per month')} value={String(c.mrr || 0)} format="currency:IDR" hint={c.after && !c.mrr ? t('{amount} after the trial', { amount: rpShort(c.after) }) : planLabel(p)} count-in="off" />
              <ak-stat label={t('Open tickets')} value={String(c.openTickets)} href={`/admin/v2/companies/${id}/tickets`} count-in="off" />
              <ak-stat label={t('Invoices late')} value={String(c.overdue)} tone={c.overdue ? 'warn' : undefined} href={`/admin/v2/companies/${id}/billing`} count-in="off" />
            </ak-stats>
            {c.notes[0] && <Card title={t('Latest note')} aside={<a className="ak-btn ak-btn--ghost" href={`/admin/v2/companies/${id}/notes`}>{t('All notes')}</a>}><p className="s2k-pre">{c.notes[0].text}</p><small className="ak-muted">{c.notes[0].by} · {rel(c.notes[0].at)}</small></Card>}
            {c.timeline.length > 0 && <Card title={t('What happened')} flush>
              <ul className="s2k-rows">{c.timeline.slice(0, 12).map((e, i) => <li key={i}><span className="s2k-rows__main"><span>{e.text ?? e.type}</span><small>{rel(e.at)}{e.by ? ` · ${e.by}` : ''}</small></span></li>)}</ul>
            </Card>}
          </div>
          <Card title={t('At a glance')}>
            <dl className="s2k-kv">
              <dt>{t('Owner')}</dt><dd>{owner ? <a className="s2k-link" href={`/admin/v2/people/${owner.id}`}>{owner.name}</a> : t('none')}</dd>
              <dt>{t('Last here')}</dt><dd>{c.lastActive ? rel(c.lastActive) : t('never')}</dd>
              <dt>{t('Health')}</dt><dd>{healthWord(c)}{isNewCompany(c) ? '' : ` (${c.health.score})`}</dd>
              {c.health.parts.map((h) => <Fragment key={h.key}><dt>{h.label}</dt><dd>{h.score} / {h.max}</dd></Fragment>)}
              <dt>{t('AI this month')}</dt><dd>{rp(c.aiRp)}</dd>
              <dt>{t('Mail sent')}</dt><dd>{c.mail.sent}{c.mail.failed ? ` · ${t('{n} failed', { n: c.mail.failed })}` : ''}</dd>
            </dl>
          </Card>
        </div>
      )}
      {view === 'people' && (
        <Card flush>
          <ul className="s2k-rows">
            {c.members.map((m) => (
              <li key={m.id}>
                <span className="s2k-rows__main"><a className="s2k-link" href={`/admin/v2/people/${m.id}`}>{m.name}</a><small>{m.email}</small></span>
                {may('customers') && m.role !== 'owner' ? <Dropdown label={t('Role')} value={m.role} onChange={(v) => void act(() => post('person/role', { id: c.id, userId: m.id, role: v }), t('Role changed')).then(reload)} options={[{ value: 'admin', label: t('Admin') }, { value: 'member', label: t('Member') }]} /> : <Chip plain>{m.role === 'owner' ? t('Owner') : m.role}</Chip>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {view === 'billing' && <Billing c={c} reload={reload} />}
      {view === 'tickets' && (
        <Card flush>
          {c.tickets.length === 0 ? <div className="ak-card__body ak-muted">{t('No tickets from this company.')}</div> : <ul className="s2k-rows">{c.tickets.map((x) => <li key={x.id}><span className="s2k-rows__main"><a className="s2k-link" href={`/admin/v2/tickets/${x.id}`}>#{x.number} {x.subject}</a><small>{TICKET_WORD[x.status]} · {rel(x.updatedAt)}</small></span></li>)}</ul>}
        </Card>
      )}
      {view === 'mailboxes' && (
        <Card flush>
          {c.accounts.length === 0 ? <div className="ak-card__body ak-muted">{t('No mailboxes.')}</div> : <ul className="s2k-rows">{c.accounts.map((a) => <li key={a.id}><span className="s2k-rows__main"><b>{a.email}</b><small>{a.provider} · {tn(a.users, '{n} person', '{n} people')}{a.sendPaused ? ` · ${t('sending paused: {reason}', { reason: a.sendPaused.reason })}` : ''}</small></span>{a.sendPaused && may('customers') && <button className="ak-btn" type="button" onClick={() => void act(() => post('mailbox/unpause', { workspaceId: c.id, accountId: a.id }), t('Sending resumed')).then(reload)}>{t('Resume sending')}</button>}</li>)}</ul>}
        </Card>
      )}
      {view === 'notes' && <Notes c={c} reload={reload} />}
    </Page>
  );
}

function Billing({ c, reload }: { c: Full; reload: () => void }) {
  const { may } = useAdmin();
  const act = useAct();
  const p = c.plan;
  const can = may('billing');
  const plan = (patch: Record<string, unknown>, done = t('Saved')) => void act(() => post('company/plan', { id: c.id, ...patch }), done).then(reload);
  const [code, setCode] = useState('');
  return (
    <div className="ak-columns">
      <Card title={t('Plan')}>
        <div className="s2k-form">
          <div className="ak-field"><label>{t('Plan')}</label><Dropdown block label={t('Plan')} disabled={!can} value={p?.tier ?? 'free'} onChange={(v) => plan({ tier: v }, t('Plan changed'))} options={TIERS} /></div>
          <div className="ak-field"><label>AI</label><Dropdown block label="AI" disabled={!can} value={p?.track ?? 'own'} onChange={(v) => plan({ track: v })} options={[{ value: 'ai', label: t('AI included') }, { value: 'own', label: t('Own AI keys') }]} /></div>
          <div className="ak-field"><label>{t('Billed')}</label><Dropdown block label={t('Billed')} disabled={!can} value={p?.cycle ?? 'monthly'} onChange={(v) => plan({ cycle: v })} options={[{ value: 'monthly', label: t('Monthly') }, { value: 'yearly', label: t('Yearly (10 months)') }]} /></div>
          {c.state === 'trial' && p?.trialEnds && <div className="s2k-row"><span>{t('Trial ends {day}', { day: day(p.trialEnds) })}</span>{may('customers') && <button className="ak-btn" type="button" onClick={() => void act(() => post('company/extend-trial', { id: c.id, days: 14 }), t('14 more days given')).then(reload)}>{t('Give 14 more days')}</button>}</div>}
          <label className="s2k-row"><span>{t('Paused (no charge, read access)')}</span><input type="checkbox" className="ak-switch" role="switch" disabled={!can} checked={!!p?.paused} onChange={(e) => plan({ paused: e.target.checked }, e.target.checked ? t('Paused') : t('Resumed'))} /></label>
          <p className="ak-muted">{t('Every change here saves at once.')}</p>
        </div>
      </Card>
      <Card title={t('Discount')}>
        <div className="s2k-form">
          {p?.discount ? <div className="s2k-row"><Chip tone="info">{p.discount.code}</Chip><span>{p.discount.kind === 'percent' ? `${p.discount.value}%` : rp(p.discount.value)}</span>{can && <button className="ak-btn ak-btn--ghost" type="button" onClick={() => plan({ discount: null }, t('Discount removed'))}>{t('Remove')}</button>}</div> : <p className="ak-muted">{t('No discount.')}</p>}
          <div className="ak-field"><label htmlFor="co-code">{t('Apply a code')}</label><input id="co-code" className="ak-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
          <div className="s2k-row"><button className="ak-btn" type="button" disabled={!code.trim() || !can} onClick={() => void act(() => post('coupon', { apply: code, workspaceId: c.id }), t('Code applied')).then((ok) => ok && (setCode(''), reload()))}>{t('Apply code')}</button></div>
        </div>
      </Card>
      <Card title={t('Invoices')} aside={can && p && p.tier !== 'free' && <button className="ak-btn" type="button" onClick={() => void act(() => post('invoice/create', { workspaceId: c.id }), t('Draft invoice made')).then(reload)}>{t('Make an invoice')}</button>} flush>
        {c.invoices.length === 0 ? <div className="ak-card__body ak-muted">{t('No invoices yet.')}</div> : <ul className="s2k-rows">{c.invoices.map((i) => <li key={i.id}><span className="s2k-rows__main"><a className="s2k-link" href={`/api/admin/invoice.html?id=${encodeURIComponent(i.id)}`} target="_blank" rel="noreferrer">{i.number}</a><small>{rp(i.total)} · {t('due {day}', { day: day(i.dueAt) })}</small></span><Chip tone={INVOICE_TONE[i.status]}>{i.status === 'sent' ? t('Waiting for payment') : i.status === 'paid' ? t('Paid') : i.status === 'draft' ? t('Draft') : t('Void')}</Chip>{can && i.status === 'sent' && <button className="ak-btn" type="button" onClick={() => void act(() => post('invoice/status', { id: i.id, status: 'paid' }), t('Marked paid')).then(reload)}>{t('Mark paid')}</button>}</li>)}</ul>}
      </Card>
    </div>
  );
}

function Notes({ c, reload }: { c: Full; reload: () => void }) {
  const act = useAct();
  const [text, setText] = useState('');
  return (
    <div className="ak-columns">
      <Card title={t('Add a note for the team')}>
        <div className="ak-stack">
          <textarea className="ak-input" rows={4} aria-label={t('Note')} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="s2k-row"><button className="ak-btn ak-btn--primary" type="button" disabled={!text.trim()} onClick={() => void act(() => post('note', { workspaceId: c.id, text }), t('Note added')).then((ok) => ok && (setText(''), reload()))}>{t('Add note')}</button></div>
        </div>
      </Card>
      <Card title={t('Notes')} flush>
        {c.notes.length === 0 ? <div className="ak-card__body ak-muted">{t('No notes yet.')}</div> : <ul className="s2k-rows">{c.notes.map((n) => <li key={n.id}><span className="s2k-rows__main"><p className="s2k-pre">{n.text}</p><small>{n.by} · {rel(n.at)}</small></span><button className="ak-btn ak-btn--ghost" type="button" onClick={() => void act(() => post('note', { delete: n.id }), t('Note deleted')).then(reload)}>{t('Delete')}</button></li>)}</ul>}
      </Card>
    </div>
  );
}

