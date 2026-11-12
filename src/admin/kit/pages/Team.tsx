// Team: who runs sprint2go and what each may do, and what operators did (the audit log). Without the old settings
// grab bag: support settings moved to Tickets, invoice details and the unpaid rule to Money.
import { Fragment, useEffect, useRef, useState } from 'react';
import { dateTime, post, rel, ROLE_HINT, ROLE_LABEL, type OpRole } from '../../api';
import { useAct, useAdmin, useApi } from '../../ui';
import { Card, Chip, Dropdown, Failed, Page, Tabs, esc, useKitList } from '../parts';
import { t } from '../../../i18n';

interface Op { email: string; role: OpRole; addedBy: string | null; addedAt: string; totpOn: boolean; disabled: boolean; alerts: boolean; name: string | null; userId: string | null; lastSeen: string | null }
interface AuditEntry { id: number; at: string; operator: string; action: string; target: string | null; targetName: string | null; detail: string | null }
const ROLES: OpRole[] = ['owner', 'admin', 'support', 'finance', 'readonly'];

export function Team({ tab }: { tab?: string }) {
  const { me } = useAdmin();
  const owner = me.role === 'owner';
  const [view, setView] = useState(tab === 'audit' ? 'audit' : tab === 'agents' && owner ? 'agents' : 'operators');
  return (
    <Page title={t('Team')} sub={t('The people who run sprint2go, and what each of them did.')}>
      <Tabs id="team-tabs" value={view} onChange={(v) => (history.replaceState(null, '', `/admin/v2/team/${v}`), setView(v))} items={[{ id: 'operators', label: t('Operators') }, { id: 'audit', label: t('Audit log') }, ...(owner ? [{ id: 'agents', label: t('Agent access') }] : [])]} />
      {view === 'audit' ? <Audit /> : view === 'agents' ? <Agents /> : <Operators />}
    </Page>
  );
}

function Operators() {
  const { may, me } = useAdmin();
  const act = useAct();
  const { data, error, reload } = useApi<{ operators: Op[]; me: string; role: OpRole }>('team');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OpRole>('support');
  const can = may('team');
  const options = ROLES.filter((r) => r !== 'owner' || data?.role === 'owner').map((r) => ({ value: r, label: ROLE_LABEL[r] }));
  if (error) return <Failed error={error} retry={reload} />;
  return (
    <div className="s2k-split">
      <Card title={t('Operators')} flush>
        {!data ? <ak-placeholder kind="list" rows="3" /> : (
          <ul className="s2k-rows">
            {data.operators.map((o) => (
              <li key={o.email}>
                <span className="s2k-rows__main">
                  <b>{o.name ?? o.email}{o.email === me.email ? ` (${t('you')})` : ''}</b>
                  <small>{o.email} · {o.totpOn ? t('two-step on') : t('two-step not set up')} · {o.lastSeen ? t('last here {ago}', { ago: rel(o.lastSeen) }) : t('never signed in')}</small>
                </span>
                {can && o.email !== me.email ? <Dropdown label={t('Role')} value={o.role} options={options} onChange={(r) => void act(() => post('team/save', { email: o.email, role: r }), t('Role changed')).then(reload)} /> : <Chip tone="info">{ROLE_LABEL[o.role]}</Chip>}
                <label className="s2k-row"><span className="ak-muted">{t('Alerts')}</span><input type="checkbox" className="ak-switch" role="switch" checked={o.alerts} disabled={!can && o.email !== me.email} onChange={() => void act(() => post('team/alerts', { email: o.email, on: !o.alerts }), o.alerts ? t('Alerts off') : t('Alerts on')).then(reload)} /></label>
                {can && o.email !== me.email && <button className="ak-btn ak-btn--ghost" type="button" onClick={() => void window.AdminKit.confirm({ title: t('Remove {name} from the team?', { name: o.name ?? o.email }), body: t('They lose the console straight away. Their account in the app stays.'), confirmLabel: t('Remove'), tone: 'danger' }).then((ok) => ok && void act(() => post('team/remove', { email: o.email }), t('Removed')).then(reload))}>{t('Remove')}</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="ak-stack">
        {can && (
          <Card title={t('Add an operator')}>
            <form className="s2k-form" onSubmit={(e) => (e.preventDefault(), void act(() => post('team/save', { email, role }), t('{email} added', { email })).then((ok) => ok && (setEmail(''), reload())))}>
              <div className="ak-field"><label htmlFor="tm-email">{t('Their sprint2go email')}</label><input id="tm-email" className="ak-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="ak-field"><label>{t('Role')}</label><Dropdown block label={t('Role')} value={role} options={options} onChange={(r) => setRole(r as OpRole)} /></div>
              <div className="s2k-row"><button className="ak-btn ak-btn--primary" disabled={!email.includes('@')}>{t('Add to the team')}</button></div>
            </form>
          </Card>
        )}
        <Card title={t('What each role may do')}>
          <dl className="s2k-kv">{ROLES.map((r) => <Fragment key={r}><dt>{ROLE_LABEL[r]}</dt><dd>{ROLE_HINT[r]}</dd></Fragment>)}</dl>
        </Card>
      </div>
    </div>
  );
}

function Audit() {
  const { data, error, reload } = useApi<{ entries: AuditEntry[] }>('audit?limit=1000');
  const { el } = useKitList<AuditEntry>(
    () => ({
      id: 'au',
      rowId: (a) => String(a.id),
      searchLabel: t('Search operator, action or company'),
      search: (a) => [a.operator, a.action, a.targetName, a.detail].join(' '),
      filters: [{ key: 'who', label: t('Operator'), any: t('Anyone'), options: (rows) => [...new Set(rows.map((a) => a.operator))].map((o) => [o, o] as [string, string]), test: (a, v) => a.operator === v }],
      sort: { key: 'at', dir: -1 },
      columns: [
        { key: 'what', label: t('What'), primary: true, truncate: true, cell: (a) => `<b>${esc(a.detail ?? a.action)}</b><br><span class="ak-muted">${esc(a.action)}${a.targetName ? ' · ' + esc(a.targetName) : ''}</span>` },
        { key: 'who', label: t('Who'), hidePhone: true, sort: 'text', value: (a) => a.operator, cell: (a) => esc(a.operator) },
        { key: 'at', label: t('When'), align: 'end', sort: 'date', value: (a) => a.at, cell: (a) => `<span title="${esc(dateTime(a.at))}">${esc(rel(a.at))}</span>` },
      ],
      summary: (rows) => t('{n} entries', { n: rows.length }),
    }),
    data?.entries ?? null,
  );
  return (
    <>
      {error && <Failed error={error} retry={reload} />}
      {el}
    </>
  );
}

// Agent access: tokens for AI agents (any model, any MCP app) that read or work in the console through /admin/mcp.
// The page part is the kit's (public/admin-v2/kit/admin-kit-agents.js); the tools are in server/opmcp/tools.mjs.
// Only owners see this tab, and the server answers 401/403 to anyone else.
function Agents() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let gone = false;
    const start = () => {
      const kit = window.AdminKit as unknown as { agentAccess?: (el: HTMLElement, o: { api: string; mcpUrl: string; site: string }) => void };
      if (gone) return;
      if (kit?.agentAccess) kit.agentAccess(el, { api: '/api/admin/agent-tokens', mcpUrl: location.origin + '/admin/mcp', site: 'sprint2go operators' });
      else setTimeout(start, 50);
    };
    if (!document.querySelector('script[data-ak-agents]')) {
      const sc = document.createElement('script');
      sc.src = '/admin-v2/kit/admin-kit-agents.js';
      sc.defer = true;
      sc.dataset.akAgents = '';
      document.head.appendChild(sc);
    }
    start();
    return () => { gone = true; el.replaceChildren(); };
  }, []);
  return <div ref={host}><ak-placeholder kind="list" rows="3" /></div>;
}
