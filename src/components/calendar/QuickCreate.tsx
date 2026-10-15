import { useEffect, useRef, useState, type RefObject } from 'react';
import { CalendarDays, Users, X } from 'lucide-react';
import type { CalEvent, CalendarDef, Person, User } from '../../types';
import { fmtTimeRange } from '../../calendarUtils';
import { Sheet } from '../ui/Sheet';
import { ActionSheet } from '../ui/ActionSheet';
import { Select } from '../ui/Select';
import { calLabel } from '../../data/calendar';
import { GuestPicker } from './GuestPicker';
import { draftEvent, draftOf, type Draft } from './EventForm';
import { t, tx } from '../../i18n';
import { fmtDate } from '../../i18n/format';

/**
 * New event on a phone, from a tap on an empty slot (Google Calendar's quick create): the block drawn on the grid,
 * with handles for its time, and this short sheet over the lower part of the screen: X and Save, the title, when, and
 * the guests. Swiping the sheet up or tapping the time opens the full editor with what was typed. The grid above stays
 * live: tap another slot to move the block, drag its handles to change the time.
 */
export function QuickCreate({
  quick,
  calendars,
  team,
  contacts,
  me,
  titleRef,
  onSave,
  onMore,
  onClose,
}: {
  quick: { start: Date; end: Date };
  calendars: CalendarDef[];
  team: User[];
  contacts: Person[];
  me: string;
  titleRef: RefObject<HTMLInputElement | null>;
  onSave: (e: Omit<CalEvent, 'id'>, kind: 'event' | 'task') => void;
  /** The full editor, with what's here so far. */
  onMore: (seed: Partial<Draft>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [guests, setGuests] = useState<Person[]>([]);
  const [kind, setKind] = useState<'event' | 'task'>('event');
  const [calendarId, setCalendarId] = useState(calendars[0].id);
  const draft: Draft = { ...draftOf(quick.start, quick.end, calendarId), kind, title, guests: kind === 'task' ? [] : guests };
  const valid = !!title.trim();
  const save = () => valid && onSave(draftEvent(draft), kind);
  const more = () => onMore({ kind, title, calendarId, guests: draft.guests });
  const [asking, setAsking] = useState(false);
  const close = () => (title.trim() ? setAsking(true) : onClose());

  // Swiping the sheet up from its handle or head opens the full editor.
  const box = useRef<HTMLDivElement>(null);
  const moreRef = useRef(more);
  moreRef.current = more;
  useEffect(() => {
    const sheet = box.current?.closest('.sheet') as HTMLElement | null;
    if (!sheet) return;
    let y0 = 0;
    let on = false;
    const start = (e: TouchEvent) => {
      on = !!(e.target as Element).closest('.sheet-grab, .sheet-head, .qc-when');
      y0 = e.touches[0].clientY;
    };
    const move = (e: TouchEvent) => on && y0 - e.touches[0].clientY > 36 && ((on = false), moreRef.current());
    sheet.addEventListener('touchstart', start, { passive: true });
    sheet.addEventListener('touchmove', move, { passive: true });
    return () => {
      sheet.removeEventListener('touchstart', start);
      sheet.removeEventListener('touchmove', move);
    };
  }, []);

  return (
    <>
      <Sheet
        onClose={close}
        label={t('New event')}
        className="quick-sheet"
        head={
          <>
            <button type="button" className="icon-btn qc-x" onClick={close} aria-label={t('Close')}>
              <X size={22} />
            </button>
            <span className="spacer" />
            <button type="button" className="primary-btn qc-save" onClick={save} disabled={!valid}>
              {t('Save')}
            </button>
          </>
        }
      >
        <div ref={box} className="quick-body">
          <div className="segmented qc-kind" role="group" aria-label={t('Event or task')}>
            {(['event', 'task'] as const).map((k) => (
              <button key={k} type="button" className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k === 'event' ? t('Event') : t('Task')}
              </button>
            ))}
          </div>
          <input
            ref={titleRef}
            className="qc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && (e.preventDefault(), save())}
            placeholder={t('Add title')}
            aria-label={tx('event', 'Title')}
            enterKeyHint="done"
          />
          <button type="button" className="qc-when" onClick={more} aria-label={t('{when}. More options', { when: `${fmtDate(quick.start, { weekday: 'short', day: 'numeric', month: 'short' })}, ${fmtTimeRange(quick.start, quick.end)}` })}>
            {fmtDate(quick.start, { weekday: 'short', day: 'numeric', month: 'short' })} · {fmtTimeRange(quick.start, quick.end)}
          </button>
          {kind === 'event' && (
            <div className="er-row top qc-guests">
              <span className="er-icon">
                <Users size={20} />
              </span>
              <div className="er-body">
                <GuestPicker value={guests} onChange={setGuests} team={team} contacts={contacts} me={me} rows />
              </div>
            </div>
          )}
          {calendars.length > 1 && (
            <div className="er-row qc-cal">
              <span className="er-icon">
                <CalendarDays size={20} />
              </span>
              <div className="er-body">
                <Select value={calendarId} onChange={setCalendarId} options={calendars.map((c) => ({ value: c.id, label: calLabel(c), icon: <i className="qc-dot" style={{ background: c.color }} /> }))} label={t('Calendar')} title={t('Calendar')} className="er-sel" />
              </div>
            </div>
          )}
          <div className="qc-foot">
            <button type="button" className="link-btn qc-more" onClick={more}>
              {t('More options')}
            </button>
          </div>
        </div>
      </Sheet>
      <ActionSheet
        open={asking}
        onClose={() => setAsking(false)}
        title={t('Discard this event?')}
        className="ev-discard"
        actions={[
          { label: t('Discard'), danger: true, run: onClose },
          { label: t('Keep editing'), group: 'keep', run: () => setAsking(false) },
        ]}
      />
    </>
  );
}
