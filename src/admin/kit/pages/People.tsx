// Customers › People: find a person, see where they belong and whether they ever signed in; fix their access.
// Signing in as them sits in More, behind a ticket number and a confirm (the why review: it was the strongest button).
import { useState } from 'react';
import { dateTime, post, rel, ROLE_LABEL, type OpRole, type PersonRow } from '../../api';
import { device } from '../../pages/People';
import { useAct, useAdmin, useApi } from '../../ui';
import { Card, Chip, Failed, Menu, Page, esc, useKitList } from '../parts';
import { TICKET_WORD } from './Tickets';
import { t, tn } from '../../../i18n';

const seen = (p: { hasLogin: boolean; lastSeen: string | null }) => (p.lastSeen ? rel(p.lastSeen) : t('never signed in'));

export function People() {
  const { go } = useAdmin();
  const { data, error, reload } = useApi<{ people: PersonRow[] }>('people');
  const { el } = useKitList<PersonRow>(
    () => ({
      id: 'pp',
      rowId: (p) => p.id,
      searchLabel: t('Search name, email or company'),
      search: (p) => [p.name, p.email, p.companies.map((c) => c.name).join(' ')].join(' '),
      views: [
        { value: 'team', label: t('Team members'), test: (p) => p.companies.length > 0 },
        { value: 'guests', label: t('Guests'), test: (p) => p.guestOf.length > 0 && p.companies.length === 0 },
        { value: 'throwaway', label: t('Throwaway sign-ups'), test: (p) => p.disposable, count: true },
        { value: 'all', label: t('All') },
      ],
      filters: [{ key: 'signin', label: t('Signed in'), any: t('Anyone'), options: () => [['never', t('Never signed in')], ['week', t('In the last 7 days')], ['suspended', t('Suspended')]], test: (p, v) => (v === 'never' ? !p.lastSeen : v === 'week' ? !!p.lastSeen && Date.now() - new Date(p.lastSeen).getTime() < 7 * 86_400_000 : !!p.suspended) }],
      sort: { key: 'name', dir: 1 },
      columns: [
        { key: 'name', label: t('Person'), primary: true, truncate: true, sort: 'text', value: (p) => p.name.toLowerCase(), cell: (p) => `<a class="s2k-link" href="/admin/v2/people/${esc(p.id)}">${esc(p.name)}</a>${p.operator ? ` <ak-chip tone="info" plain>${esc(t('Operator'))}</ak-chip>` : ''}${p.suspended ? ` <ak-chip tone="danger" plain>${esc(t('Suspended'))}</ak-chip>` : ''}<br><span class="ak-muted">${esc(p.email)}</span>` },
        { key: 'co', label: t('Companies'), hidePhone: true, sort: 'text', value: (p) => p.companies[0]?.name ?? '', cell: (p) => (p.companies.length ? p.companies.map((c) => `${esc(c.name)}${c.role === 'owner' ? ` <span class="ak-muted">(${esc(t('company owner'))})</span>` : ''}`).join(', ') : p.guestOf.length ? `<span class="ak-muted">${esc(t('guest'))}</span>` : `<span class="ak-muted">${esc(t('none'))}</span>`) },
        { key: 'seen', label: t('Last here'), align: 'end', sort: 'date', value: (p) => p.lastSeen ?? '', cell: (p) => (p.lastSeen ? esc(seen(p)) : `<span class="ak-muted">${esc(seen(p))}</span>`) },
      ],
      onOpen: (p) => go(`/admin/v2/people/${p.id}`),
      summary: (rows) => tn(rows.length, '{n} person', '{n} people'),
    }),
    data?.people ?? null,
  );
  return (
    <Page title={t('People')} sub={data ? t('{n} people, {never} never signed in', { n: data.people.length, never: data.people.filter((p) => !p.lastSeen).length }) : undefined}>
      {error && <Failed error={error} retry={reload} />}
      {el}
    </Page>
  );
}

interface Person {
  id: string; name: string; email: string; deleted: boolean; suspended: { at: string; by: string; reason: string } | null; hasLogin: boolean; twoStep: boolean;
  trial: { trials: { workspaceId: string; company: string; at: string; how: string }[]; granted: { by: string; at: string } | null };
  lastSeen: string | null; operator: string | null; disposable: boolean; guestOf: string | null;
  companies: { id: string; name: string; role: string }[];
  sessions: { id: string; createdAt: string; lastAt: string; ua: string | null; ip: string | null; actingAs: string | null }[];
  tickets: { id: string; number: number; subject: string; status: 'new' | 'open' | 'waiting' | 'resolved' | 'closed'; updatedAt: string }[];
  audit: { id: number; at: string; operator: string; action: string; detail: string | null }[];
}

export function PersonPage({ id }: { id: string }) {
  const { may, signInAs } = useAdmin();
  const { data, error, reload } = useApi<{ person: Person }>(`person?id=${encodeURIComponent(id)}`);
  const act = useAct();
  const [shown, setShown] = useState<string | null>(null);
  if (error) return <Page title={t('Person')}><Failed error={error} retry={reload} /></Page>;
  if (!data) return <Page title={t('Person')}><section className="ak-card"><ak-placeholder kind="list" rows="5" /></section></Page>;
  const u = data.person;
  const first = u.name.split(' ')[0];
  const AK = window.AdminKit;
  return (
    <Page
      title={u.name}
      sub={<>{u.email} {u.operator && <Chip tone="info">{t('Operator')}: {ROLE_LABEL[u.operator as OpRole]}</Chip>} {u.disposable && <Chip tone="warn">{t('Throwaway email')}</Chip>} {u.twoStep && <Chip tone="success">{t('Two-step on')}</Chip>} {u.suspended && <Chip tone="danger">{t('Suspended')}</Chip>}</>}
      actions={
        !u.deleted && (
          <>
            <Menu
              label={t('More')}
              items={[
                may('support') && (u.hasLogin ? { label: t('Give a password reset code'), run: () => void post<{ code: string }>('person/reset-code', { userId: u.id }).then((r) => setShown(t('Reset code for {name}: {code}', { name: first, code: r.code })), (e: Error) => AK.toast.error(e.message)) } : { label: t('Make an invite link'), run: () => void post<{ link: string }>('person/invite', { userId: u.id }).then((r) => setShown(r.link), (e: Error) => AK.toast.error(e.message)) }),
                may('support') && u.twoStep && { label: t('Reset two-step sign-in…'), run: () => void AK.prompt({ title: t('Reset {name}’s two-step sign-in?', { name: first }), label: t('Why (kept in the log)') }).then((reason) => reason && void act(() => post('person/2fa-reset', { userId: u.id, reason }), t('Two-step sign-in reset')).then(reload)) },
                may('customers') && !u.operator && (u.suspended ? { label: t('Lift the suspension'), run: () => void act(() => post('person/suspend', { userId: u.id, on: false }), t('Suspension lifted')).then(reload) } : { label: t('Suspend…'), danger: true, run: () => void AK.prompt({ title: t('Suspend {name}?', { name: first }), label: t('Why (they see it)') }).then((reason) => reason && void act(() => post('person/suspend', { userId: u.id, reason }), t('Suspended')).then(reload)) }),
                may('impersonate') && !u.suspended && 'divider',
                may('impersonate') && !u.suspended && { label: t('Sign in as {name}…', { name: first }), danger: true, run: () => signInAs(u.id) },
              ]}
            />
          </>
        )
      }
    >
      {shown && <div className="ak-banner" data-tone="info"><div><strong>{t('Give this to {name}', { name: first })}</strong><code className="s2k-mono">{shown}</code></div><button className="ak-btn" type="button" onClick={() => void navigator.clipboard?.writeText(shown).then(() => AK.toast(t('Copied')))}>{t('Copy')}</button></div>}
      {u.suspended && <div className="ak-banner" data-tone="danger"><div><strong>{t('Suspended {when} by {who}', { when: rel(u.suspended.at), who: u.suspended.by })}</strong>{u.suspended.reason}</div></div>}
      <div className="ak-columns">
        <Card title={t('Companies')} flush>
          {u.companies.length === 0 ? <div className="ak-card__body ak-muted">{u.guestOf ? t('A guest of {company}.', { company: u.guestOf }) : t('In no company.')}</div> : <ul className="s2k-rows">{u.companies.map((c) => <li key={c.id}><span className="s2k-rows__main"><a className="s2k-link" href={`/admin/v2/companies/${c.id}`}>{c.name}</a><small>{c.role === 'owner' ? t('Company owner') : c.role}</small></span></li>)}</ul>}
        </Card>
        <Card title={t('Free trials')}>
          <div className="ak-stack">
            {u.trial.trials.length === 0 ? <p className="ak-muted">{t('No trial used yet.')}</p> : u.trial.trials.map((x) => <p key={x.workspaceId}>{t('{company}, {when}', { company: x.company, when: rel(x.at) })}</p>)}
            {u.trial.granted ? <p className="ak-muted">{t('{name} allowed one more {ago}.', { name: u.trial.granted.by, ago: rel(u.trial.granted.at) })}</p> : u.trial.trials.length > 0 && may('customers') && <div className="s2k-row"><button className="ak-btn" type="button" onClick={() => void act(() => post('person/trial-grant', { userId: u.id }), t('Their next company gets a trial')).then(reload)}>{t('Allow another trial')}</button></div>}
          </div>
        </Card>
        <Card title={t('Signed in on')} flush>
          {u.sessions.length === 0 ? <div className="ak-card__body ak-muted">{u.hasLogin ? t('Signed out everywhere.') : t('Never signed in.')}</div> : <ul className="s2k-rows">{u.sessions.map((s) => <li key={s.id}><span className="s2k-rows__main"><b>{s.actingAs ? t('Operator {name}', { name: s.actingAs }) : device(s.ua)}</b><small>{s.ip ?? t('unknown address')} · {t('last {ago}', { ago: rel(s.lastAt) })}</small></span>{may('support') && <button className="ak-btn" type="button" onClick={() => void act(() => post('person/end-session', { userId: u.id, sessionId: s.id }), t('Signed out there')).then(reload)}>{t('Sign out')}</button>}</li>)}</ul>}
        </Card>
        <Card title={t('Tickets')} flush>
          {u.tickets.length === 0 ? <div className="ak-card__body ak-muted">{t('No tickets.')}</div> : <ul className="s2k-rows">{u.tickets.map((x) => <li key={x.id}><span className="s2k-rows__main"><a className="s2k-link" href={`/admin/v2/tickets/${x.id}`}>#{x.number} {x.subject}</a><small>{TICKET_WORD[x.status]} · {rel(x.updatedAt)}</small></span></li>)}</ul>}
        </Card>
        {u.audit.length > 0 && (
          <Card title={t('What operators did')} flush>
            <ul className="s2k-rows">{u.audit.map((a) => <li key={a.id}><span className="s2k-rows__main"><span>{a.detail ?? a.action}</span><small>{a.operator} · {dateTime(a.at)}</small></span></li>)}</ul>
          </Card>
        )}
      </div>
    </Page>
  );
}
