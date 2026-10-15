import { Clock, X } from 'lucide-react';
import type { Todo } from '../../types';
import { TimePicker } from '../ui/DatePicker';
import { t } from '../../i18n';

/** The due date's optional time of day: "Add time" until there is one, then the time and a way to take it off. */
export function DueTime({ task, onPatch }: { task: Todo; onPatch: (id: string, p: Partial<Todo>) => void }) {
  if (!task.due) return null;
  if (!task.dueTime)
    return (
      <button type="button" className="link-btn due-time-add" onClick={() => onPatch(task.id, { dueTime: '09:00' })}>
        <Clock size={14} aria-hidden="true" /> {t('Add time')}
      </button>
    );
  return (
    <span className="due-time">
      <TimePicker value={task.dueTime} onChange={(v) => onPatch(task.id, { dueTime: v })} label={t('Due time')} className="sel-flat" />
      <button type="button" className="icon-btn sm due-time-x" aria-label={t('Remove time')} onClick={() => onPatch(task.id, { dueTime: undefined })}>
        <X size={14} />
      </button>
    </span>
  );
}
