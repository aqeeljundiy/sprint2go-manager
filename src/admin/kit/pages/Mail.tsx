// System › Mail: can we send and receive, what is stuck, and whose sending is paused.
import { post, rel } from '../../api';
import { useAct, useAdmin, useApi } from '../../ui';
import { Card, Chip, Failed, Page, esc, useKitList } from '../parts';
import { t, tn } from '../../../i18n';

interface Check { ok: boolean; found: string; want: string }
interface Msg { id: string; company: string; route: string; fromAddr: string; toAddr: string; attempts: number; error: string | null; createdAt: string; nextAt?: string; failed?: boolean }
interface MailData {
  host: string; limits: { hour: number; day: number };
  health: Record<'ptr' | 'a' | 'port25' | 'inbound', Check>;
  dkim: { domain: string; host: string; state: 'ok' | 'missing' | 'different' | 'local' }[];
  blocklists: { list: string; listed: boolean | 'unknown' }[];
  queued: Msg[]; failed: Msg[];
  paused: { workspaceId: string; company: string; accountId: string; email: string; at: string; reason: string }[];
  month: { in: number; out: number; failed: number; spam: number; boosted: number };
}
const CHECK = (): Record<string, string> => ({ ptr: t('Reverse address (PTR)'), a: t('Mail server address (A record)'), port25: t('Outgoing port 25'), inbound: t('Receiving mail') });

export function Mail() {
  const { may } = useAdmin();
  const act = useAct();
  const { data, error, reload } = useApi<MailData>('mail');
  const rows = data ? [...data.failed.map((m) => ({ ...m, failed: true })), ...data.queued] : null;
  const { el } = useKitList<Msg>(
    () => ({
      id: 'ml',
      rowId: (m) => m.id,
      searchLabel: t('Search company or address'),
      search: (m) => [m.company, m.fromAddr, m.toAddr, m.error].join(' '),
      views: [{ value: 'failed', label: t('Failed'), test: (m) => !!m.failed, count: true }, { value: 'queued', label: t('Waiting to send'), test: (m) => !m.failed, count: true }],
      sort: { key: 'at', dir: 1 },
      columns: [
        { key: 'to', label: t('Message'), primary: true, truncate: true, cell: (m) => `<b>${esc(m.toAddr)}</b><br><span class="ak-muted">${esc(t('from {from}', { from: m.fromAddr }))} · ${esc(m.company)}</span>` },
        { key: 'why', label: t('Why'), hidePhone: true, truncate: true, cell: (m) => (m.error ? esc(m.error) : `<span class="ak-muted">${esc(m.nextAt ? t('next try {when}', { when: rel(m.nextAt) }) : '')}</span>`) },
        { key: 'at', label: t('Since'), align: 'end', sort: 'date', value: (m) => m.createdAt, cell: (m) => esc(rel(m.createdAt)) },
      ],
      bulk: may('platform') ? [{ key: 'retry', label: t('Try again'), run: (r) => void act(() => post('mail/retry', { ids: r.map((m) => m.id) }), tn(r.length, '{n} sent again', '{n} sent again')).then(reload) }, { key: 'drop', label: t('Drop…'), run: (r) => void window.AdminKit.confirm({ title: tn(r.length, 'Drop {n} message?', 'Drop {n} messages?'), body: t('They are not sent. The sender is not told.'), confirmLabel: t('Drop'), tone: 'danger' }).then((ok) => ok && void act(() => post('mail/retry', { ids: r.map((m) => m.id), drop: true }), t('Dropped')).then(reload)) }] : [],
      summary: (r) => tn(r.length, '{n} message', '{n} messages'),
      empty: { views: { failed: `<b>${esc(t('Nothing failed.'))}</b>`, queued: `<b>${esc(t('Nothing waiting.'))}</b>` } },
    }),
    rows,
  );
  if (error) return <Page title={t('Mail')}><Failed error={error} retry={reload} /></Page>;
  return (
    <Page title={t('Mail')} sub={t('Can we send and receive?')}>
      <ak-stats>
        <ak-stat label={t('Sent this month')} value={String(data?.month.out ?? '')} count-in="off" />
        <ak-stat label={t('Received')} value={String(data?.month.in ?? '')} hint={data ? t('{n} spam', { n: data.month.spam }) : ''} count-in="off" />
        <ak-stat label={t('Failed')} value={String(data?.month.failed ?? '')} tone={data?.month.failed ? 'danger' : undefined} count-in="off" />
        <ak-stat label={t('Sending paused')} value={String(data?.paused.length ?? '')} tone={data?.paused.length ? 'warn' : undefined} count-in="off" />
      </ak-stats>
      <div className="ak-columns">
        <Card title={t('Checks')} flush>
          {!data ? <ak-placeholder lines="4" /> : (
            <ul className="s2k-rows">
              {Object.entries(data.health).map(([k, c]) => <li key={k}><span className="s2k-rows__main"><b>{CHECK()[k] ?? k}</b><small>{c.ok ? c.found : t('found {found}, wanted {want}', { found: c.found || t('nothing'), want: c.want })}</small></span><Chip tone={c.ok ? 'success' : 'danger'}>{c.ok ? t('OK') : t('Not OK')}</Chip></li>)}
              {data.dkim.map((k) => <li key={k.domain}><span className="s2k-rows__main"><b>{t('Signature (DKIM) for {domain}', { domain: k.domain })}</b><small>{k.host}</small></span><Chip tone={k.state === 'ok' ? 'success' : k.state === 'local' ? 'neutral' : 'danger'}>{k.state === 'ok' ? t('OK') : k.state === 'local' ? t('Local only') : k.state === 'missing' ? t('Missing') : t('Different')}</Chip></li>)}
              {data.blocklists.filter((b) => b.listed === true).map((b) => <li key={b.list}><span className="s2k-rows__main"><b>{t('Listed on {list}', { list: b.list })}</b></span><Chip tone="danger">{t('Blocked')}</Chip></li>)}
            </ul>
          )}
        </Card>
        <Card title={t('Sending paused')} flush>
          {!data ? <ak-placeholder lines="2" /> : data.paused.length === 0 ? <div className="ak-card__body ak-muted">{t('No mailbox is paused.')}</div> : <ul className="s2k-rows">{data.paused.map((p) => <li key={p.accountId}><span className="s2k-rows__main"><b>{p.email}</b><small>{p.company} · {p.reason} · {rel(p.at)}</small></span>{may('customers') && <button className="ak-btn" type="button" onClick={() => void act(() => post('mailbox/unpause', { workspaceId: p.workspaceId, accountId: p.accountId }), t('Sending resumed')).then(reload)}>{t('Resume sending')}</button>}</li>)}</ul>}
        </Card>
      </div>
      {el}
    </Page>
  );
}
