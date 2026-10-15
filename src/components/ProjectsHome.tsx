import { ProjectBadge } from './ProjectBadge';
import { Sheet } from './ui/Sheet';
import { IconTile } from './ui/IconTile';
import { useState } from 'react';
import { Archive, ArrowRight, Check, ChevronRight, Menu, Pause, Play, Plus, Search } from 'lucide-react';
import { projectTabIcon } from './ProjectPhone';
import { useActionMenu } from './ui/ActionSheet';
import type { Client, Todo, User } from '../types';
import { PROJECT_TYPES, term } from '../terms';
import { localDay, relative } from '../utils';
import { Avatar } from './Avatar';
import { isBrief } from './TasksView';
import { kindOf } from '../stages';
import { Select } from './ui/Select';
import { SmoothHeight } from './ui/Smooth';
import { EmptyState } from './ui/EmptyState';
import { useCreateAction } from '../mobile/chrome';
import { usePhone } from '../mobile/media';
import { TasksBrowse, type BrowseGroup } from './tasks/TasksBrowse';
import { t, tn, tx } from '../i18n';
import { fmtDay } from '../i18n/format';

/**
 * The Projects app's home: every project, the ones that need something first. Each card says what's wrong (late,
 * nobody on it, waiting on a guest) or that it's on track, and opens the project's hub.
 */
export function ProjectsHome({ projects, tasks, users, onOpen, onCreate, onMenu, startAdding, onPast, onOpenPart, onPause, onEnd }: { startAdding?: boolean; projects: Client[]; tasks: Todo[]; users: User[]; onOpen: (id: string) => void; onCreate?: (name: string, type?: string, domain?: string) => void; onPast?: () => void; onMenu: () => void; onOpenPart?: (id: string, part: 'tasks' | 'chat' | 'emails' | 'files') => void; onPause?: (id: string, paused: boolean) => void; onEnd?: (id: string) => void }) {
  const [adding, setAdding] = useState(!!startAdding);
  const phone = usePhone();
  const [find, setFind] = useState(''); // desktop: "Find a project"
  // Right-click a card (long-press on touch): the same things the project's own menu does, without opening it first.
  const [hit, setHit] = useState<Client | null>(null);
  const cardMenu = useActionMenu(() =>
    !hit
      ? []
      : [
          { label: t('Open'), icon: ArrowRight, run: () => onOpen(hit.id) },
          ...(onOpenPart
            ? [
                // The same names and icons as the project's tabs (ProjectPhone's projectTabs).
                { label: t('Tasks'), icon: projectTabIcon('tasks'), group: 'parts', run: () => onOpenPart(hit.id, 'tasks') },
                { label: t('Chat'), icon: projectTabIcon('chat'), group: 'parts', run: () => onOpenPart(hit.id, 'chat') },
                { label: t('Mail'), icon: projectTabIcon('emails'), group: 'parts', run: () => onOpenPart(hit.id, 'emails') },
                { label: t('Files'), icon: projectTabIcon('files'), group: 'parts', run: () => onOpenPart(hit.id, 'files') },
              ]
            : []),
          ...(onPause ? [{ label: hit.status === 'paused' ? t('Resume') : t('Pause'), icon: hit.status === 'paused' ? Play : Pause, group: 'manage', run: () => onPause(hit.id, hit.status !== 'paused') }] : []),
          ...(onEnd ? [{ label: t('End work'), icon: Archive, danger: true, group: 'manage', run: () => onEnd(hit.id) }] : []),
        ],
  );
  useCreateAction('projects', !!onCreate && { label: t('New {project}', { project: term.one }), icon: Plus, run: () => setAdding(true) });
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [domain, setDomain] = useState('');
  const [more, setMore] = useState(false);
  // Every card shows the same things: type, owner, what needs a look, next deadline, last activity.
  const on = (id: string) => id !== 'people';
  const today = localDay();
  const live = projects.filter((c) => c.status !== 'ended');
  const pastCount = projects.length - live.length;
  const stats = (c: Client) => {
    const open = tasks.filter((x) => x.clientId === c.id && !x.done && !isBrief(x));
    const late = open.filter((x) => x.due && x.due < today).length;
    const nobody = open.filter((x) => !x.userId && !(x.assignees?.length)).length;
    const guest = open.filter((x) => kindOf(x) === 'waiting' || x.approval?.status === 'waiting').length;
    const last = tasks
      .filter((x) => x.clientId === c.id)
      .map((x) => x.history?.at(-1)?.at ?? x.createdAt)
      .sort()
      .pop();
    const next = open.filter((x) => x.due && x.due >= today).sort((a, b) => a.due!.localeCompare(b.due!))[0];
    return { late, nobody, guest, open: open.length, last, next };
  };
  // Name order, once, on every device: cards stay where you left them (Basecamp's way); late work shows on its badge.
  const rows = live.map((c) => ({ c, s: stats(c) })).sort((a, b) => a.c.name.localeCompare(b.c.name));
  const save = () => {
    if (!name.trim()) return;
    onCreate?.(name.trim(), type || undefined, domain.trim().replace(/^@/, '') || undefined);
    setName('');
    setType('');
    setDomain('');
    setMore(false);
    setAdding(false);
  };
  // Optional: mail from this domain files into the project. Folded away so the form asks for a name and a type.
  const moreOptions = (
    <div className="proj-new-more">
      <button type="button" className="link-btn small" aria-expanded={more} onClick={() => setMore((m) => !m)}>
        {t('More options')} <ChevronRight size={14} className={`rot-chev${more ? ' open' : ''}`} />
      </button>
      <div className={`fold${more ? ' open' : ''}`}>
        <div>
          <label className="proj-new-domain">
            <input value={domain} onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="example.com" aria-label={t('Email domain')} tabIndex={more ? 0 : -1} />
            <small className="muted">{t('Mail from this domain files here.')}</small>
          </label>
        </div>
      </div>
    </div>
  );
  // Phones: a bottom sheet with the name field focused (it rides above the keyboard), not a form at the top.
  const newForm = phone ? (
    adding && (
      <Sheet
        title={t('New {project}', { project: term.one })}
        onClose={() => setAdding(false)}
        className="proj-new-sheet"
        footer={
          <button type="button" className="primary-btn" disabled={!name.trim()} onClick={save}>
            {t('Add')}
          </button>
        }
      >
        <input className="pns-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder={t('{Project} name', { project: term.one })} aria-label={t('{Project} name', { project: term.one })} />
        {/* The type is picked right in the sheet (chips), so no second sheet covers the form. */}
        <div className="pns-types" role="radiogroup" aria-label={t('Type')}>
          {[{ value: '', label: t('No type') }, ...PROJECT_TYPES.map((ty) => ({ value: ty, label: t(ty) }))].map((o) => (
            <button key={o.value || 'none'} type="button" role="radio" aria-checked={type === o.value} className={`pns-type${type === o.value ? ' on' : ''}`} onClick={() => setType(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
        {moreOptions}
      </Sheet>
    )
  ) : (
    <SmoothHeight>
      {adding && (
        <div className="proj-new">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' ? save() : e.key === 'Escape' && setAdding(false))} placeholder={t('{Project} name', { project: term.one })} />
          <Select<string> value={type} onChange={setType} label={t('Type')} className="sel-flat" options={[{ value: '', label: t('No type') }, ...PROJECT_TYPES.map((ty) => ({ value: ty, label: t(ty) }))]} />
          <button className="ghost-btn sm" onClick={() => setAdding(false)}>
            {t('Cancel')}
          </button>
          <button className="primary-btn sm" disabled={!name.trim()} onClick={save}>
            {t('Add')}
          </button>
          {moreOptions}
        </div>
      )}
    </SmoothHeight>
  );

  // Phones: the projects as rows (Todoist's Browse), by status, with what needs a look at the right.
  if (phone) {
    const hint = (s: ReturnType<typeof stats>) =>
      s.late ? { hint: tn(s.late, '{n} late', '{n} late'), tone: 'danger' as const } : s.guest ? { hint: t('Waiting on {who}', { who: term.who }) } : s.nobody ? { hint: tn(s.nobody, '{n} not picked up', '{n} not picked up') } : {};
    const row = ({ c, s }: (typeof rows)[number]) => ({
      id: c.id,
      label: c.name,
      icon: c.photo ? <span className="tbr-photo"><ProjectBadge p={c} kind="client-badge" /></span> : <IconTile letter={c.name} color={c.color} />, // N4: a project is a tile with its initial everywhere
      ...hint(s),
      sub: s.next
        ? t('Next: {title}, {when}', { title: s.next.title, when: fmtDay(s.next.due!) })
        : s.last
          ? t('Updated {when}', { when: relative(s.last) })
          : t('No activity yet'),
      run: () => onOpen(c.id),
    });
    const groups: BrowseGroup[] = [
      { id: 'active', title: t('Active'), rows: rows.filter((r) => r.c.status === 'active').map(row) },
      { id: 'lead', title: t('Leads'), rows: rows.filter((r) => r.c.status === 'lead').map(row) },
      { id: 'paused', title: t('Paused'), rows: rows.filter((r) => r.c.status === 'paused').map(row) },
      ...(onPast ? [{ id: 'past', title: t('Archived'), rows: [{ id: 'past', label: t('Past {projects}', { projects: term.many }), icon: <Archive size={22} />, muted: true, run: onPast }] }] : []),
    ];
    return (
      <TasksBrowse
        groups={groups}
        top={
          <>
            {newForm}
            {rows.length === 0 && (
              <EmptyState
                icon={<Plus size={20} />}
                title={t('No {projects} yet', { projects: term.many })}
                text={t('A {project} holds everything about one piece of work: its tasks, chat, mail, meetings, files, notes, logins and the {whos} you invite.', { project: term.one, whos: term.whos })}
              />
            )}
          </>
        }
      />
    );
  }

  return (
    <section className="tasks-pane view-enter">
      <header className="tracking-head tasks-head">
        <button className="icon-btn menu-btn" onClick={onMenu} aria-label={t('Open menu')}>
          <Menu size={18} />
        </button>
        <div className="th-text">
          <h1>{term.Many}</h1>
        </div>
        {rows.length > 0 && (
          <label className="search proj-search">
            <Search size={15} />
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder={t('Find a {project}', { project: term.one })} aria-label={t('Find a {project}', { project: term.one })} />
          </label>
        )}
        {/* No "New project" here: the sidebar's button is on screen already (one primary action per screen). */}
      </header>
      <div className="tracking-scroll">
        {newForm}
        {rows.length === 0 ? (
          <EmptyState
            icon={<Plus size={20} />}
            title={t('No {projects} yet', { projects: term.many })}
            text={t('A {project} holds everything about one piece of work: its tasks, chat, mail, meetings, files, notes, logins and the {whos} you invite.', { project: term.one, whos: term.whos })}
            action={
              onCreate && (
                <button className="primary-btn sm" onClick={() => setAdding(true)}>
                  <Plus size={14} /> {t('New {project}', { project: term.one })}
                </button>
              )
            }
          />
        ) : (
          // Grouped like the phone (Active, Leads, Paused) and in name order inside each, so cards stay where you left
          // them (Basecamp's way); trouble shows on each card's line, not by reshuffling the grid.
          ([
            ['active', t('Active')],
            ['lead', t('Leads')],
            ['paused', t('Paused')],
          ] as const).map(([status, heading]) => {
            const q = find.trim().toLowerCase();
            const list = rows.filter((r) => r.c.status === status && (!q || r.c.name.toLowerCase().includes(q)));
            if (!list.length) return null;
            return (
          <section key={status} className="proj-group">
          <h2 className="proj-group-h">{heading} <span>{list.length}</span></h2>
          <div className="proj-grid">
            {list.map(({ c, s }, i) => {
              const owner = users.find((u) => u.id === c.ownerId);
              const issues = [s.late && tn(s.late, '{n} late', '{n} late'), s.nobody && tn(s.nobody, '{n} not picked up', '{n} not picked up'), s.guest && tn(s.guest, '{n} waiting on {who}', '{n} waiting on {who}', { who: term.who })].filter(Boolean) as string[];
              return (
                <button key={c.id} className="proj-card" style={{ ['--i' as string]: i }} onClick={() => onOpen(c.id)} {...cardMenu.bind} onContextMenu={(e) => (setHit(c), cardMenu.bind.onContextMenu(e))} onPointerDown={(e) => (setHit(c), cardMenu.bind.onPointerDown?.(e))}>
                  <span className="proj-top">
                    <ProjectBadge p={c} kind="client-badge" />
                    <span className="proj-name">
                      <strong>{c.name}</strong>
                      {on('type') && (
                        <small>
                          {[c.type ? t(c.type) : null, c.status === 'lead' ? tx('status', 'Lead') : c.status === 'paused' ? t('Paused') : null].filter(Boolean).join(' · ') || ' '}
                        </small>
                      )}
                    </span>
                    {on('owner') && owner && <Avatar person={owner} size={24} />}
                  </span>
                  {on('people') && (c.members?.length ?? 0) > 0 && (
                    <span className="avatar-stack proj-card-people">
                      {(c.members ?? []).slice(0, 5).map((m) => {
                        const u = users.find((x) => x.id === m.userId);
                        return u ? <Avatar key={u.id} person={u} size={20} /> : null;
                      })}
                    </span>
                  )}
                  {on('next') && s.next && (
                    <span className="proj-next small">
                      {t('Next: {title} · {due}', { title: s.next.title, due: fmtDay(s.next.due!) })}
                    </span>
                  )}
                  {on('state') && <span className={`proj-state ${issues.length ? (s.late ? 'bad' : 'warn') : 'ok'}`}>
                    {issues.length ? (
                      <span title={issues.length > 1 ? issues.join(' · ') : undefined}>
                        {issues[0]}
                        {issues.length > 1 && <span className="proj-state-more"> +{issues.length - 1}</span>}
                      </span>
                    ) : (
                      <>
                        <Check size={13} /> {s.open ? t('On track') : t('Nothing open')}
                      </>
                    )}
                  </span>}
                  <span className="proj-foot">
                    <small>{on('updated') ? (s.last ? t('Updated {when}', { when: relative(s.last) }) : t('No activity yet')) : ''}</small>
                    <ArrowRight size={14} />
                  </span>
                </button>
              );
            })}
          </div>
          </section>
            );
          })
        )}
        {onPast && pastCount > 0 && !find.trim() && (
          <button type="button" className="link-btn small proj-past-link" onClick={onPast}>
            <Archive size={14} /> {t('Past {projects}', { projects: term.many })} ({pastCount})
          </button>
        )}
        {rows.length > 0 && find.trim() && !rows.some((r) => r.c.name.toLowerCase().includes(find.trim().toLowerCase())) && <p className="muted">{t('No {projects} match “{q}”.', { projects: term.many, q: find.trim() })}</p>}
      </div>
      {cardMenu.menu}
    </section>
  );
}
