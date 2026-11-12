// Tasks: today's work first, then plan ahead. One create button with one name ("New task"), in the title row
// (v1 had "Add task", "New task" and another "New task"). Brain dump is not in v2 yet: it asks AI.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Todo } from '../../types';
import { useStored } from '../../store';
import { msg, t } from '../../i18n';
import { kindOf, stageIdFor, stagesForTask } from '../../stages';
import { Chip, DateField, Drawer, Dropdown, Page, esc, todayKey, uid, useKitList, useV2 } from '../ui';
import { doers, inWs, isMine, nameOf, useTeam } from '../team';
import { ICON } from '../Shell';
import { fmtDate } from '../../i18n/format';

const STAGE: Record<string, [string, 'neutral' | 'info' | 'warn' | 'success']> = { open: ['Planned', 'neutral'], active: ['In progress', 'info'], review: ['In review', 'info'], waiting: ['Waiting', 'warn'], done: ['Done', 'success'] };
const dueText = (d?: string) => (!d ? '' : d < todayKey() ? t('Overdue, {day}', { day: fmtDate(d, { day: 'numeric', month: 'short' }) }) : d === todayKey() ? t('Today') : fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' }));

export function Tasks() {
  const { me, ws, users } = useTeam();
  const { toast } = useV2();
  const [todos, setTodos] = useStored('todos');
  const [clients] = useStored('clients');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(() => new URLSearchParams(location.search).has('new'));
  const projects = useMemo(() => clients.filter((c) => c.workspaceId === ws.id), [clients, ws.id]);
  const rows = useMemo(() => todos.filter(inWs(ws)).filter((tk) => tk.kind !== 'brief' && (isMine(me)(tk) || tk.createdBy === me.id)), [todos, ws, me]);
  const projectName = (id?: string) => projects.find((c) => c.id === id)?.name ?? '';
  // Same rules as v1's setTaskStatus for the common case: the task's own done stage, a history line, and Undo
  // that puts back exactly what was there. A repeating task (makes its next copy) or one someone reviews
  // (goes to the supervisor first) is finished in the full task view, where those rules live.
  const needsFullView = (tk: Todo) => !!tk.repeat || (!!tk.supervisorId && tk.supervisorId !== me.id);
  const finish = useCallback(
    (tk: Todo, done = true) => {
      if (done && needsFullView(tk)) { location.href = `/tasks/${tk.id}`; return; }
      const list = stagesForTask(tk);
      const before = { status: tk.status, done: tk.done, doneAt: tk.doneAt, doneBy: tk.doneBy, history: tk.history };
      const status = stageIdFor(tk, done ? 'done' : 'open', list);
      const at = new Date().toISOString();
      const line = done ? msg('marked it done') : msg('reopened it');
      setTodos((all) => all.map((x) => (x.id === tk.id ? { ...x, status, done, doneAt: done ? at : undefined, doneBy: done ? me.id : undefined, history: [...(x.history ?? []), { id: uid(), at, by: me.id, kind: 'status' as const, ...line }] } : x)));
      const undo = () => setTodos((all) => all.map((x) => (x.id === tk.id ? { ...x, ...before } : x)));
      toast(done ? t('Done: {title}', { title: tk.title }) : t('Opened again'), { action: { label: t('Undo'), onClick: undo } });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setTodos, me.id, toast],
  );
  const { el } = useKitList<Todo>(
    () => ({
      id: 'tk',
      rowId: (r) => r.id,
      searchLabel: t('Search tasks'),
      search: (r) => [r.title, r.notes, projectName(r.clientId)].join(' '),
      views: [
        { value: 'today', label: t('Today'), test: (r) => !r.done && !!r.due && r.due <= todayKey(), count: true, order: 1 },
        { value: 'upcoming', label: t('Upcoming'), test: (r) => !r.done && !!r.due && r.due > todayKey(), order: 1 },
        { value: 'open', label: t('All open'), test: (r) => !r.done },
        { value: 'done', label: t('Done'), test: (r) => r.done },
      ],
      filters: [{ key: 'project', label: t('Project'), any: t('Any project'), options: () => projects.map((c) => [c.id, c.name] as [string, string]), test: (r, v) => r.clientId === v }],
      sort: { key: 'due', dir: 1 },
      columns: [
        { key: 'title', label: t('Task'), primary: true, truncate: true, value: (r) => r.title, cell: (r) => `<button type="button" class="s2a-open" data-open>${esc(r.title)}</button>${r.clientId ? `<span class="s2a-sub">${esc(projectName(r.clientId))}</span>` : ''}` },
        { key: 'due', label: t('Due'), sort: 'date', value: (r) => r.due ?? '9999', cell: (r) => esc(dueText(r.due)) },
        { key: 'who', label: t('Doing it'), hidePhone: true, value: (r) => doers(r).map((id) => nameOf(users, id)).join(', '), cell: (r) => esc(doers(r).map((id) => nameOf(users, id).split(' ')[0]).join(', ')) },
        { key: 'stage', label: t('Stage'), value: (r) => kindOf(r), cell: (r) => { const [l, tone] = STAGE[kindOf(r)] ?? STAGE.open; return `<ak-chip tone="${tone}">${esc(t(l))}</ak-chip>`; } },
      ],
      actions: [{ key: 'done', label: t('Mark done'), icon: ICON.done, show: (r) => !r.done, run: (r) => finish(r) }],
      bulk: [{ key: 'done', label: t('Mark done'), run: (list) => { const simple = list.filter((r) => !needsFullView(r)); simple.forEach((r) => finish(r)); if (simple.length < list.length) toast(t('{n} repeat or need review: finish them in the full task view', { n: list.length - simple.length })); } }],
      onOpen: (r) => setOpen(r.id),
      summary: (list) => t('{n} tasks', { n: list.length }),
      empty: { none: t('No tasks yet. New task adds one.'), views: { today: t('Nothing due today. Upcoming shows what comes next.') } },
    }),
    rows,
  );
  const task = rows.find((r) => r.id === open);
  return (
    <Page title={t('Tasks')} sub={t('Your tasks in {company}, due first.', { company: ws.name })} actions={<button type="button" className="ak-btn ak-btn--primary" onClick={() => setCreating(true)}>{t('New task')}</button>}>
      {el}
      <Drawer open={!!task} onClose={() => setOpen(null)} heading={task?.title ?? t('Task')}>
        {task && (
          <div className="s2a-form">
            <dl className="s2a-facts">
              <dt>{t('Due')}</dt><dd>{dueText(task.due) || t('No date')}</dd>
              <dt>{t('Project')}</dt><dd>{projectName(task.clientId) || t('None')}</dd>
              <dt>{t('Doing it')}</dt><dd>{doers(task).map((id) => nameOf(users, id)).join(', ') || t('Nobody yet')}</dd>
              <dt>{t('Stage')}</dt><dd><Chip tone={(STAGE[kindOf(task)] ?? STAGE.open)[1]}>{t((STAGE[kindOf(task)] ?? STAGE.open)[0])}</Chip></dd>
            </dl>
            {task.notes && <p className="s2a-read">{task.notes}</p>}
            {!!task.checklist?.length && (
              <ul className="s2a-rows">
                {task.checklist.map((c) => (
                  <li key={c.id} className="s2a-row"><span>{c.done ? '✓' : '○'}</span><span className="s2a-row__main">{c.text}</span></li>
                ))}
              </ul>
            )}
            <div className="ak-actions">
              {task.done ? <button type="button" className="ak-btn" onClick={() => finish(task, false)}>{t('Open again')}</button> : <button type="button" className="ak-btn ak-btn--primary" onClick={() => (finish(task), setOpen(null))}>{t('Mark done')}</button>}
              <a className="ak-btn ak-btn--ghost" href={`/tasks/${task.id}`}>{t('Edit in the full task view')}</a>
            </div>
          </div>
        )}
      </Drawer>
      <NewTask open={creating} onClose={() => setCreating(false)} projects={projects.map((c) => ({ value: c.id, label: c.name }))} onCreate={(x) => {
        const tk: Todo = { id: uid(), title: x.title, due: x.due || undefined, clientId: x.project || undefined, done: false, status: 'todo', priority: 'normal', source: 'manual', userId: me.id, assignees: [me.id], createdBy: me.id, workspaceId: ws.id, createdAt: new Date().toISOString() };
        setTodos((list) => [tk, ...list]);
        toast(t('Task added: {title}', { title: x.title }));
      }} />
    </Page>
  );
}

function NewTask({ open, onClose, projects, onCreate }: { open: boolean; onClose: () => void; projects: { value: string; label: string }[]; onCreate: (x: { title: string; due: string; project: string }) => void }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [project, setProject] = useState('');
  useEffect(() => {
    if (open) (setTitle(''), setDue(''), setProject(''));
  }, [open]);
  const opts = useMemo(() => [{ value: '', label: t('No project') }, ...projects], [projects]);
  return (
    <Drawer open={open} onClose={onClose} heading={t('New task')}>
      <form className="s2a-form" onSubmit={(e) => (e.preventDefault(), title.trim() && (onCreate({ title: title.trim(), due, project }), onClose()))}>
        <div className="ak-field"><label htmlFor="nt-title">{t('What needs doing')}</label><input id="nt-title" className="ak-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></div>
        <div className="ak-field"><label>{t('Due')}</label><DateField label={t('Due')} value={due} onChange={setDue} clearable /></div>
        <div className="ak-field"><label>{t('Project')}</label><Dropdown label={t('Project')} value={project} options={opts} onChange={setProject} block /></div>
        <div className="ak-actions"><button className="ak-btn ak-btn--primary" disabled={!title.trim()}>{t('Save task')}</button></div>
      </form>
    </Drawer>
  );
}
