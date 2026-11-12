// Projects: every client's state, open one. Listed once (v1 listed them in the sidebar and as cards); a lead says
// "Lead" only, never "Lead" and "On track" together; health shows for active work from its last status update.
import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import { useStored } from '../../store';
import { t } from '../../i18n';
import { Chip, Drawer, Page, esc, useKitList } from '../ui';
import { nameOf, useTeam } from '../team';
import { fmtDate } from '../../i18n/format';

const STATUS: Record<Client['status'], [string, 'neutral' | 'info' | 'warn' | 'success' | 'danger']> = { active: ['Active', 'success'], lead: ['Lead', 'info'], paused: ['Paused', 'warn'], ended: ['Ended', 'neutral'] };
const HEALTH = { on: ['On track', 'success'], risk: ['At risk', 'warn'], off: ['Off track', 'danger'] } as const;

export function Projects() {
  const { ws, users } = useTeam();
  const [clients] = useStored('clients');
  const [todos] = useStored('todos');
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => clients.filter((c) => c.workspaceId === ws.id), [clients, ws.id]);
  const openTasks = (c: Client) => todos.filter((tk) => tk.clientId === c.id && !tk.done).length;
  /** One state per project: its status, and for active work its health from the last update. */
  const state = (c: Client): [string, string] => {
    const h = c.status === 'active' ? c.updates?.[c.updates.length - 1]?.health : undefined;
    return h ? [HEALTH[h][0], HEALTH[h][1]] : STATUS[c.status];
  };
  const { el } = useKitList<Client>(
    () => ({
      id: 'pj',
      rowId: (r) => r.id,
      searchLabel: t('Search projects'),
      search: (r) => [r.name, r.domain, r.type].join(' '),
      views: [
        { value: 'active', label: t('Active'), test: (r) => r.status === 'active', count: true },
        { value: 'lead', label: t('Leads'), test: (r) => r.status === 'lead', count: true },
        { value: 'past', label: t('Paused and ended'), test: (r) => r.status === 'paused' || r.status === 'ended' },
        { value: 'all', label: t('All') },
      ],
      sort: { key: 'name', dir: 1 },
      columns: [
        { key: 'name', label: t('Project'), primary: true, truncate: true, value: (r) => r.name, cell: (r) => `<button type="button" class="s2a-open" data-open>${esc(r.name)}</button>${r.type ? `<span class="s2a-sub">${esc(r.type)}</span>` : ''}` },
        { key: 'state', label: t('State'), value: (r) => state(r)[0], cell: (r) => `<ak-chip tone="${state(r)[1]}">${esc(t(state(r)[0]))}</ak-chip>` },
        { key: 'tasks', label: t('Open tasks'), align: 'end', sort: 'number', value: (r) => openTasks(r), cell: (r) => String(openTasks(r)) },
        { key: 'guests', label: t('Guests'), align: 'end', sort: 'number', hidePhone: true, value: (r) => r.people?.length ?? 0, cell: (r) => String(r.people?.length ?? 0) },
        { key: 'lead', label: t('Lead'), hidePhone: true, value: (r) => nameOf(users, r.ownerId), cell: (r) => esc(nameOf(users, r.ownerId)) },
      ],
      onOpen: (r) => setOpen(r.id),
      summary: (list) => t('{n} projects', { n: list.length }),
      empty: { none: t('No projects yet. Add the first one in the full Projects view.') },
    }),
    rows,
  );
  const c = rows.find((r) => r.id === open);
  const tasks = c ? todos.filter((tk) => tk.clientId === c.id && !tk.done).slice(0, 8) : [];
  return (
    <Page title={t('Projects')} sub={t('Every project in {company} and where it stands.', { company: ws.name })} actions={<a className="ak-btn ak-btn--primary" href="/projects">{t('New project')}</a>}>
      {el}
      <Drawer open={!!c} onClose={() => setOpen(null)} heading={c?.name ?? t('Project')}>
        {c && (
          <div className="s2a-form">
            <dl className="s2a-facts">
              <dt>{t('State')}</dt><dd><Chip tone={state(c)[1] as 'success'}>{t(state(c)[0])}</Chip></dd>
              <dt>{t('Lead')}</dt><dd>{nameOf(users, c.ownerId) || t('Nobody yet')}</dd>
              {c.since && <><dt>{t('Since')}</dt><dd>{fmtDate(c.since, { day: 'numeric', month: 'short', year: 'numeric' })}</dd></>}
              <dt>{t('Guests')}</dt><dd>{c.people?.map((p) => p.name || p.email).join(', ') || t('None invited')}</dd>
            </dl>
            {c.overview?.summary && <p className="s2a-read">{c.overview.summary}</p>}
            <h3>{t('Open tasks')}</h3>
            {tasks.length ? <ul className="s2a-rows">{tasks.map((tk) => <li key={tk.id} className="s2a-row"><span className="s2a-row__main"><span className="s2a-row__title">{tk.title}</span></span></li>)}</ul> : <p className="s2a-note">{t('No open tasks')}</p>}
            <div className="ak-actions"><a className="ak-btn" href={`/projects/${c.id}`}>{t('Open the full project')}</a></div>
          </div>
        )}
      </Drawer>
    </Page>
  );
}
