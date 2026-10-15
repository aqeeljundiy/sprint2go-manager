import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { CircleCheck, Circle, Search, X } from 'lucide-react';
import type { Todo } from '../../types';
import type { TaskOps } from './taskOps';
import { Sheet } from '../ui/Sheet';
import { EmptyState } from '../ui/EmptyState';
import { t } from '../../i18n';

export interface TaskHit {
  task: Todo;
  where: string; // the matched words, when they're not in the title (a comment, a note, a checklist item)
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "…the words around the match…" from a longer text. */
function around(text: string, at: number, len: number) {
  const from = Math.max(0, at - 24);
  const to = Math.min(text.length, at + len + 40);
  return `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ').trim()}${to < text.length ? '…' : ''}`;
}

/** Tasks whose title, notes, checklist or comments hold every word typed. Open first, then done; newest first. */
export function searchTasks(tasks: Todo[], query: string): { open: TaskHit[]; done: TaskHit[] } {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return { open: [], done: [] };
  const hits: TaskHit[] = [];
  for (const task of tasks) {
    const parts = [task.title, task.notes ?? '', ...(task.checklist ?? []).map((c) => c.text), ...(task.history ?? []).filter((h) => h.kind === 'comment' && h.text).map((h) => h.text ?? '')];
    const all = norm(parts.join('\n'));
    if (!words.every((w) => all.includes(w))) continue;
    const inTitle = words.every((w) => norm(task.title).includes(w));
    let where = '';
    if (!inTitle) {
      for (const p of parts.slice(1)) {
        const at = norm(p).indexOf(words[0]);
        if (at >= 0) {
          where = around(p, at, words[0].length);
          break;
        }
      }
    }
    hits.push({ task, where });
  }
  const newest = (a: TaskHit, b: TaskHit) => (b.task.doneAt ?? b.task.createdAt).localeCompare(a.task.doneAt ?? a.task.createdAt);
  return { open: hits.filter((h) => !h.task.done).sort(newest).slice(0, 50), done: hits.filter((h) => h.task.done).sort(newest).slice(0, 50) };
}

/** The search field: a pill with a clear button. */
export function TaskSearchField({ value, onChange, inputRef, autoFocus }: { value: string; onChange: (v: string) => void; inputRef?: RefObject<HTMLInputElement | null>; autoFocus?: boolean }) {
  return (
    <label className="search tsr-field">
      <Search size={16} aria-hidden="true" />
      <input ref={inputRef} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={t('Search tasks')} aria-label={t('Search tasks')} enterKeyHint="search" autoFocus={autoFocus} />
      {value && (
        <button type="button" className="icon-btn sm so-clear" onClick={(e) => (e.preventDefault(), onChange(''))} aria-label={t('Clear search')}>
          <X size={15} />
        </button>
      )}
    </label>
  );
}

/** What the search found, as Open and Done. Tapping one opens the task. */
export function TaskSearchResults({ ops, query, onPicked }: { ops: Pick<TaskOps, 'tasks' | 'clients' | 'open'>; query: string; onPicked?: () => void }) {
  const found = useMemo(() => searchTasks(ops.tasks, query), [ops.tasks, query]);
  if (!found.open.length && !found.done.length) return <EmptyState compact icon={<Search size={22} />} title={t('No tasks match')} text={t('Try other words. Titles, notes, checklists and comments are searched.')} />;
  const group = (title: string, hits: TaskHit[]) =>
    hits.length > 0 && (
      <section className="tsr-group" aria-label={title}>
        <h2 className="tsr-head">{title}</h2>
        <div className="tsr-card">
          {hits.map(({ task, where }) => {
            const c = ops.clients.find((x) => x.id === task.clientId);
            return (
              <button key={task.id} type="button" className={`tsr-row${task.done ? ' done' : ''}`} onClick={() => (ops.open(task.id), onPicked?.())}>
                {task.done ? <CircleCheck size={20} className="tsr-ic" aria-hidden="true" /> : <Circle size={20} className="tsr-ic" aria-hidden="true" />}
                <span className="tsr-text">
                  <span className="tsr-title">{task.title}</span>
                  {(where || c) && (
                    <small className="tsr-sub">
                      {c && <span className="tsr-proj">{c.name}</span>}
                      {where && <span className="tsr-where">{where}</span>}
                    </small>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  return (
    <div className="tsr-results" key={query ? 'q' : ''}>
      {group(t('Open'), found.open)}
      {group(t('Done'), found.done)}
    </div>
  );
}

/** Computers: "/" anywhere in Tasks opens search in a centred panel. */
export function useTaskSearchKey(enabled: boolean) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector('.sheet-scrim, .modal-scrim, .drawer-scrim')) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
  return { open, setOpen };
}

export function TaskSearchSheet({ ops, onClose }: { ops: Pick<TaskOps, 'tasks' | 'clients' | 'open'>; onClose: () => void }) {
  const [q, setQ] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = setTimeout(() => field.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);
  return (
    <Sheet onClose={onClose} title={t('Search tasks')} className="tsr-sheet" size="tall">
      <TaskSearchField value={q} onChange={setQ} inputRef={field} />
      {q.trim() ? <TaskSearchResults ops={ops} query={q} onPicked={onClose} /> : <p className="tsr-hint muted">{t('Titles, notes, checklists and comments, done tasks too.')}</p>}
    </Sheet>
  );
}
