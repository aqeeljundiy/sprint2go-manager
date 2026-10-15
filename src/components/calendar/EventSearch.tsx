import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Search, X } from 'lucide-react';
import type { CalEvent } from '../../types';
import { addDays, startOfDay } from '../../calendarUtils';
import { expandEvents } from '../../repeat';
import { Popover } from '../ui/Popover';
import { placeOf } from './calTools';
import { t } from '../../i18n';
import { fmtDate, fmtTime } from '../../i18n/format';

/** Words an event can be found by: its title, place, notes, organiser and guests (names and emails). */
function haystack(e: CalEvent) {
  return [e.title, e.location, e.notes, e.organizer?.name, e.organizer?.email, ...(e.guests ?? []).flatMap((g) => [g.name, g.email])].filter(Boolean).join(' ').toLowerCase();
}

/**
 * Search across events (Google Calendar's search): a year back and a year ahead, coming ones first, then the past
 * newest first, grouped by day. A popover under the button on desktop, a sheet on phones (Popover does both).
 */
export function EventSearch({ anchor, open, onClose, events, color, onPick }: { anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; events: CalEvent[]; color: (e: CalEvent) => string; onPick: (e: CalEvent) => void }) {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setQ('');
    const id = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const groups = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!open || !words.length) return null;
    const today = startOfDay(new Date());
    const all = expandEvents(events, addDays(today, -366).getTime(), addDays(today, 366).getTime()).filter((e) => {
      const h = haystack(e);
      return words.every((w) => h.includes(w));
    });
    const now = today.getTime();
    const ahead = all.filter((e) => new Date(e.end).getTime() >= now).sort((a, b) => +new Date(a.start) - +new Date(b.start));
    const past = all.filter((e) => new Date(e.end).getTime() < now).sort((a, b) => +new Date(b.start) - +new Date(a.start));
    const out: { key: string; label: string; items: CalEvent[] }[] = [];
    for (const e of [...ahead, ...past].slice(0, 60)) {
      const d = new Date(e.start);
      const key = d.toDateString();
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(e);
      else out.push({ key, label: fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' }), items: [e] });
    }
    return out;
  }, [q, open, events]);

  return (
    <Popover anchor={anchor} open={open} onClose={onClose} width={420} title={t('Search events')} align="end">
      <div className="cal-search">
        <label className="cal-search-field">
          <Search size={16} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search by title, guest or place')} aria-label={t('Search events')} enterKeyHint="search" />
          {q && (
            <button type="button" className="icon-btn" onClick={() => (setQ(''), input.current?.focus())} aria-label={t('Clear')}>
              <X size={16} />
            </button>
          )}
        </label>
        {groups && (
          <div className="cal-search-list" role="list">
            {groups.length === 0 && <p className="cal-search-empty">{t('No events match “{q}”', { q: q.trim() })}</p>}
            {groups.map((g) => (
              <div key={g.key} className="cal-search-day">
                <div className="cal-search-date">{g.label}</div>
                {g.items.map((e) => {
                  const place = placeOf(e);
                  return (
                    <button key={e.id} type="button" role="listitem" className="cal-search-hit" onClick={() => onPick(e)}>
                      <span className="dot" style={{ background: color(e) }} />
                      <span className="cal-search-text">
                        <span className="cal-search-title">{e.title || t('(No title)')}</span>
                        <small>{[e.allDay ? t('All day') : fmtTime(new Date(e.start)), place].filter(Boolean).join(' · ')}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </Popover>
  );
}
