import { ProjectBadge } from './ProjectBadge';
import { term } from '../terms';
import { Archive, LayoutGrid, Plus } from 'lucide-react';
import type { Client, Todo } from '../types';
import { isBrief, type TaskScope } from './TasksView';
import { localDay } from '../utils';
import { usePersisted } from '../settings';
import { Badge } from './ui/Person';
import { t, tn, tx } from '../i18n';

interface Props {
  scope: TaskScope;
  tasks: Todo[];
  clients: Client[];
  isAdmin: boolean;
  myClientIds: string[];
  onScope: (s: TaskScope) => void;
  onNew?: () => void; // opens the one New project form over the grid; missing: this person can't start projects
}

/**
 * The Projects app's sidebar: every project (filter by type), past ones, and a new one in two taps.
 * A project's page is the hub for everything about it (tasks, chat, mail, meetings, files, notes, logins, guests).
 */
export function ProjectsSidebar({ scope, tasks, clients: allClients, isAdmin, myClientIds, onScope, onNew }: Props) {
  const mineOrAll = isAdmin ? allClients : allClients.filter((c) => myClientIds.includes(c.id));
  const [typeFilter, setTypeFilter] = usePersisted<string>('s2g-project-type', '');
  const types = [...new Set(mineOrAll.filter((c) => c.status !== 'ended' && c.type).map((c) => c.type!))];
  const clients = mineOrAll.filter((c) => c.status !== 'ended' && (!typeFilter || !types.includes(typeFilter) || c.type === typeFilter));
  const past = mineOrAll.filter((c) => c.status === 'ended');
  const open = tasks.filter((x) => !x.done && !isBrief(x));
  const today = localDay();
  const is = (s: TaskScope) => s.kind === scope.kind && (!('id' in s) || ('id' in scope && scope.id === s.id));

  return (
    <>
      {onNew && (
        <button className="compose-btn" onClick={onNew} title={t('New {project}', { project: term.one })}>
          <Plus size={16} />
          <span className="sb-label">{t('New {project}', { project: term.one })}</span>
        </button>
      )}
      <nav className="nav">
        <button className={`nav-item ${scope.kind === 'projects' ? 'active' : ''}`} onClick={() => onScope({ kind: 'projects' })} title={t('All {projects}', { projects: term.many })}>
          <LayoutGrid size={17} />
          <span className="sb-label">{t('All {projects}', { projects: term.many })}</span>
        </button>
      </nav>
      <div className="nav-heading sb-label">{term.Many}</div>
      {types.length > 1 && (
        <div className="type-chips sb-label" role="group" aria-label={t('Filter {projects} by type', { projects: term.many })}>
          {['', ...types].map((ty) => (
            <button key={ty || 'all'} className={(typeFilter && types.includes(typeFilter) ? typeFilter : '') === ty ? 'on' : ''} onClick={() => setTypeFilter(ty)}>
              {ty ? t(ty) : t('All')}
            </button>
          ))}
        </div>
      )}
      <nav className="nav">
        {clients.map((c) => {
          const n = open.filter((x) => x.clientId === c.id && !!x.due && x.due < today).length; // late work only
          return (
            <button key={c.id} className={`nav-item ${is({ kind: 'client', id: c.id }) ? 'active' : ''}`} onClick={() => onScope({ kind: 'client', id: c.id })} title={c.name}>
              <ProjectBadge p={c} kind="client-dot" />
              <span className="sb-label">
                {c.name}
                {c.status === 'lead' && <Badge small>{tx('status', 'Lead')}</Badge>}
              </span>
              {n ? <span className="count warn-count" title={tn(n, '{n} late', '{n} late')}>{n}</span> : null}
            </button>
          );
        })}
        {past.length > 0 && (
          <button className={`nav-item past-toggle ${is({ kind: 'past' }) ? 'active' : ''}`} onClick={() => onScope({ kind: 'past' })} title={t('Past {projects}', { projects: term.many })}>
            <Archive size={16} />
            <span className="sb-label">{t('Past {projects}', { projects: term.many })}</span>
          </button>
        )}
      </nav>
    </>
  );
}
