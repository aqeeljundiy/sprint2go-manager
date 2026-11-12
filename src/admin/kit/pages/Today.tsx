// Today: what needs an operator now, most urgent first. Numbers on top only where someone acts on them (each opens
// the rows behind it); revenue lives on Money. Low groups fold under "Worth a look" (the why review, Today).
import { useState, type ReactNode } from 'react';
import { dateTime, day, post, rel, rp, rpShort, type CompanyRow } from '../../api';
import { useAct, useAdmin, useApi } from '../../ui';
import { Card, Chip, Failed, Page, type Tone } from '../parts';
import { isNewCompany, GRACE_DAYS } from '../rules';
import { t, tn } from '../../../i18n';

interface Tk { id: string; number: number; subject: string; company: string | null; requester: string; priority: string; dueAt?: string; createdAt?: string; updatedAt?: string }
interface TodayData {
  kpis: { openTickets: number; medianFirstReplyMin: number | null };
  queue: {
    breaching: Tk[];
    unassigned: Tk[];
    mine: Tk[];
    overdue: { id: string; number: string; workspaceId: string; company: string | null; total: number; dueAt: string }[];
    trialsEnding: { id: string; name: string; trialEnds: string; after: number }[];
    atRisk: { id: string; name: string; score: number; mrr: number; lastActive: string | null }[];
    signups: { email: string; name: string; code: string; until: string; disposable: boolean }[];
    codes: { key: string; code: string; until: string }[];
    deletions: { id: string; workspaceId: string; company: string | null; runAt: string; requestedBy: string }[];
    flagged: { id: string; name: string; email: string }[];
    warnings: { kind: string; text: string; level: 'high' | 'normal'; to?: string }[];
  };
}

const v2 = (to: string) => to.replace(/^\/admin(?!\/v2)/, '/admin/v2');

function Group({ title, n, tone, children }: { title: string; n: number; tone?: Tone; children: ReactNode }) {
  if (!n) return null;
  return (
    <Card title={<>{title} <Chip tone={tone ?? 'neutral'} plain>{n}</Chip></>} flush>
      <ul className="s2k-rows">{children}</ul>
    </Card>
  );
}
function Row({ title, sub, href, children }: { title: ReactNode; sub?: ReactNode; href?: string; children?: ReactNode }) {
  return (
    <li>
      <span className="s2k-rows__main">
        {href ? <a className="s2k-link" href={href}>{title}</a> : <b>{title}</b>}
        {sub && <small>{sub}</small>}
      </span>
      {children}
    </li>
  );
}

export function Today() {
  const { me, may } = useAdmin();
  const { data, error, reload } = useApi<TodayData>('today', [], 60_000);
  const companies = useApi<{ companies: CompanyRow[] }>('companies');
  const act = useAct();
  const [more, setMore] = useState(false);
  const name = (me.name || me.email).split(/[ @]/)[0];
  if (error) return <Page title={t('Today')}><Failed error={error} retry={reload} /></Page>;
  const q = data?.queue;
  // A company in its first days has had no chance to use sprint2go: not "at risk" yet (rules.ts).
  const fresh = new Set((companies.data?.companies ?? []).filter(isNewCompany).map((c) => c.id));
  const atRisk = (q?.atRisk ?? []).filter((c) => !fresh.has(c.id));
  const high = q?.warnings.filter((w) => w.level === 'high') ?? [];
  const low = q ? q.warnings.filter((w) => w.level !== 'high').length + q.codes.length + q.signups.length + q.deletions.length + q.flagged.length : 0;
  const total = q ? high.length + q.breaching.length + q.mine.length + q.unassigned.length + q.overdue.length + atRisk.length + q.trialsEnding.length : 0;
  const ticket = (tk: Tk) => `/admin/v2/tickets/${tk.id}`;
  return (
    <Page
      title={t('Today')}
      tabTitle={t('Today')}
      sub={!q ? t('Hello {name}', { name }) : total ? tn(total, 'Hello {name}. {n} thing needs you, most urgent first.', 'Hello {name}. {n} things need you, most urgent first.', { name }) : t('Hello {name}. Nothing needs you right now.', { name })}
      actions={<a className="ak-btn ak-btn--primary" href="/admin/v2/tickets">{t('Open tickets')}</a>}
    >
      <ak-stats>
        <ak-stat label={t('Tickets waiting')} value={String(data?.kpis.openTickets ?? '')} hint={data?.kpis.medianFirstReplyMin == null ? t('no replies timed yet') : t('first reply in {n} min (median)', { n: data.kpis.medianFirstReplyMin })} href="/admin/v2/tickets" count-in="off" />
        <ak-stat label={t('Past the reply target')} value={String(q?.breaching.length ?? '')} tone={q?.breaching.length ? 'danger' : undefined} hint={t('answer these first')} href="/admin/v2/tickets?state=late" count-in="off" />
        <ak-stat label={t('Trials ending this week')} value={String(q?.trialsEnding.length ?? '')} hint={t('give more days or let them choose a plan')} href="/admin/v2/companies?view=trial" count-in="off" />
        <ak-stat label={t('Invoices overdue')} value={String(q?.overdue.length ?? '')} tone={q?.overdue.length ? 'warn' : undefined} format="number" hint={q?.overdue.length ? rpShort(q.overdue.reduce((s, i) => s + i.total, 0)) : t('nothing late')} href="/admin/v2/money/invoices" count-in="off" />
      </ak-stats>

      {!q ? (
        <section className="ak-card"><ak-placeholder kind="list" rows="5" /></section>
      ) : (
        <>
          {total === 0 && (
            <div className="ak-banner" data-tone="success"><div><strong>{t('All clear')}</strong>{t('No tickets waiting, no money late, nothing broken. New sign-ups and problems show up here first.')}</div></div>
          )}
          <Group title={t('Broken right now')} n={high.length} tone="danger">
            {high.map((w) => <Row key={w.kind} title={w.text} href={w.to ? v2(w.to) : undefined} />)}
          </Group>
          <Group title={t('Past the reply target')} n={q.breaching.length} tone="danger">
            {q.breaching.map((tk) => (
              <Row key={tk.id} title={`#${tk.number} ${tk.subject}`} sub={`${tk.company ?? tk.requester} · ${t('was due {ago}', { ago: rel(tk.dueAt!) })}`} href={ticket(tk)}>
                <a className="ak-btn" href={ticket(tk)}>{t('Reply')}</a>
              </Row>
            ))}
          </Group>
          <Group title={t('Your tickets')} n={q.mine.length}>
            {q.mine.map((tk) => <Row key={tk.id} title={`#${tk.number} ${tk.subject}`} sub={`${tk.company ?? tk.requester} · ${t('updated {ago}', { ago: rel(tk.updatedAt!) })}`} href={ticket(tk)} />)}
          </Group>
          <Group title={t('Nobody on it')} n={q.unassigned.length}>
            {q.unassigned.map((tk) => (
              <Row key={tk.id} title={`#${tk.number} ${tk.subject}`} sub={`${tk.company ?? tk.requester} · ${rel(tk.createdAt!)}${tk.priority === 'urgent' ? ` · ${t('urgent')}` : ''}`} href={ticket(tk)}>
                {may('support') && <button className="ak-btn" type="button" onClick={() => void act(() => post('ticket/update', { id: tk.id, assignee: me.email }), t('#{n} is yours', { n: tk.number }))}>{t('Assign to me')}</button>}
              </Row>
            ))}
          </Group>
          <Group title={t('Invoices overdue')} n={q.overdue.length} tone="warn">
            {q.overdue.map((i) => (
              <Row key={i.id} title={t('{company} owes {amount}', { company: i.company ?? i.workspaceId, amount: rp(i.total) })} sub={`${i.number} · ${t('due {day}', { day: day(i.dueAt) })}`} href={`/admin/v2/companies/${i.workspaceId}/billing`}>
                {may('billing') && <button className="ak-btn" type="button" onClick={async () => { if (await window.AdminKit.confirm({ title: t('Email a reminder to {company}?', { company: i.company ?? i.workspaceId }), body: t('They get invoice {number} for {amount} again by email.', { number: i.number, amount: rp(i.total) }), confirmLabel: t('Send reminder') })) void act(() => post('invoice/status', { id: i.id, status: 'sent' }), t('Reminder sent')); }}>{t('Send a reminder')}</button>}
              </Row>
            ))}
          </Group>
          <Group title={t('At risk')} n={atRisk.length} tone="warn">
            {atRisk.map((c) => <Row key={c.id} title={c.name} sub={[t('Health {score}', { score: c.score }), c.lastActive ? t('last here {ago}', { ago: rel(c.lastActive) }) : t('never active'), t('{amount}/month', { amount: rpShort(c.mrr) })].join(' · ')} href={`/admin/v2/companies/${c.id}`} />)}
          </Group>
          <Group title={t('Trials ending this week')} n={q.trialsEnding.length}>
            {q.trialsEnding.map((c) => (
              <Row key={c.id} title={c.name} sub={t('ends {day} · then {amount}/month', { day: day(c.trialEnds), amount: rpShort(c.after) })} href={`/admin/v2/companies/${c.id}`}>
                {may('customers') && <button className="ak-btn" type="button" onClick={() => void act(() => post('company/extend-trial', { id: c.id, days: 14 }), t('{company}: 14 more days', { company: c.name }))}>{t('Give 14 more days')}</button>}
              </Row>
            ))}
          </Group>
          {low > 0 && (
            <Card title={<>{t('Worth a look')} <Chip plain>{low}</Chip></>} aside={<button className="ak-btn ak-btn--ghost" type="button" aria-expanded={more} onClick={() => setMore(!more)}>{more ? t('Hide') : t('Show')}</button>} flush>
              {more && (
                <ul className="s2k-rows">
                  {q.warnings.filter((w) => w.level !== 'high').map((w) => <Row key={w.kind} title={w.text} href={w.to ? v2(w.to) : undefined} />)}
                  {q.signups.map((s) => <Row key={s.email} title={`${t('Sign-up code for {name}', { name: s.name })}: ${s.code}`} sub={`${s.email}${s.disposable ? ` · ${t('throwaway address')}` : ''} · ${t('valid until {time}', { time: dateTime(s.until) })}`} />)}
                  {q.codes.map((c) => <Row key={c.key} title={`${t('Password reset code')}: ${c.code}`} sub={`${c.key.replace(/^reset:/, '')} · ${t('valid until {time}', { time: dateTime(c.until) })}`} />)}
                  {q.deletions.map((d) => <Row key={d.id} title={t('{company} is deleted {when}', { company: d.company ?? d.workspaceId, when: rel(d.runAt) })} sub={t('asked by {name}', { name: d.requestedBy })} href={`/admin/v2/companies/${d.workspaceId}`} />)}
                  {q.flagged.map((u) => <Row key={u.id} title={t('Throwaway sign-up: {name}', { name: u.name })} sub={u.email} href={`/admin/v2/people/${u.id}`} />)}
                </ul>
              )}
            </Card>
          )}
          <p className="ak-muted">{t('New companies count as "Not started yet" for their first {n} days, not "At risk".', { n: GRACE_DAYS })}</p>
        </>
      )}
    </Page>
  );
}
