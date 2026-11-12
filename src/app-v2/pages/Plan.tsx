// Calendar: what's on, as an agenda list (the schedule view people use most). The month and week grids with
// drag to plan stay in the full Calendar for now (the review kept them as they are).
import { useMemo, useState } from 'react';
import type { CalEvent } from '../../types';
import { useStored } from '../../store';
import { t } from '../../i18n';
import { fmtDate, fmtTime } from '../../i18n/format';
import { Drawer, Page, esc, todayKey, useKitList } from '../ui';
import { inWs, useTeam } from '../team';

const dayKey = (iso: string) => iso.slice(0, 10);
const plus = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function Calendar() {
  const { me, ws } = useTeam();
  const [events] = useStored('events');
  const [calendars] = useStored('calendars');
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => events.filter(inWs(ws)).filter((e) => !e.userId || e.userId === me.id), [events, ws, me.id]);
  const calName = (e: CalEvent) => calendars.find((c) => c.id === e.calendarId)?.name ?? '';
  const time = (e: CalEvent) => (e.allDay ? t('All day') : t('{from} to {to}', { from: fmtTime(e.start), to: fmtTime(e.end) }));
  const { el } = useKitList<CalEvent>(
    () => ({
      id: 'cal',
      rowId: (r) => r.id,
      searchLabel: t('Search events'),
      search: (r) => [r.title, r.location, r.notes].join(' '),
      views: [
        { value: 'today', label: t('Today'), test: (r) => dayKey(r.start) === todayKey(), count: true, order: 1 },
        { value: 'week', label: t('Next 7 days'), test: (r) => dayKey(r.start) >= todayKey() && dayKey(r.start) <= plus(7), order: 1 },
        { value: 'later', label: t('Later'), test: (r) => dayKey(r.start) > plus(7), order: 1 },
        { value: 'past', label: t('Past'), test: (r) => dayKey(r.start) < todayKey() },
      ],
      filters: [{ key: 'cal', label: t('Calendar'), any: t('Every calendar'), options: () => calendars.map((c) => [c.id, c.name] as [string, string]), test: (r, v) => r.calendarId === v }],
      sort: { key: 'start', dir: 1 },
      columns: [
        { key: 'title', label: t('Event'), primary: true, truncate: true, value: (r) => r.title, cell: (r) => `<button type="button" class="s2a-open" data-open>${esc(r.title)}</button>${r.location ? `<span class="s2a-sub">${esc(r.location)}</span>` : ''}` },
        { key: 'start', label: t('Day'), sort: 'date', value: (r) => r.start, cell: (r) => esc(fmtDate(r.start, { weekday: 'short', day: 'numeric', month: 'short' })) },
        { key: 'time', label: t('Time'), value: (r) => r.start, cell: (r) => esc(time(r)) },
        { key: 'cal', label: t('Calendar'), hidePhone: true, value: calName, cell: (r) => esc(calName(r)) },
      ],
      onOpen: (r) => setOpen(r.id),
      summary: (list) => t('{n} events', { n: list.length }),
      empty: { none: t('Nothing on your calendar yet.'), views: { today: t('Nothing today. Next 7 days shows the week ahead.') } },
    }),
    rows,
  );
  const e = rows.find((r) => r.id === open);
  return (
    <Page title={t('Calendar')} sub={t('What is on, soonest first.')} actions={<><a className="ak-btn" href="/calendar/month">{t('Month view')}</a><a className="ak-btn ak-btn--primary" href="/calendar?new=1">{t('New event')}</a></>}>
      {el}
      <Drawer open={!!e} onClose={() => setOpen(null)} heading={e?.title ?? t('Event')}>
        {e && (
          <div className="s2a-form">
            <dl className="s2a-facts">
              <dt>{t('Day')}</dt><dd>{fmtDate(e.start, { weekday: 'long', day: 'numeric', month: 'long' })}</dd>
              <dt>{t('Time')}</dt><dd>{time(e)}</dd>
              {e.location && <><dt>{t('Where')}</dt><dd>{e.location}</dd></>}
              {!!e.guests?.length && <><dt>{t('Guests')}</dt><dd>{e.guests.map((g) => g.name || g.email).join(', ')}</dd></>}
            </dl>
            {e.notes && <p className="s2a-read">{e.notes}</p>}
            <div className="ak-actions">{e.meetUrl && <a className="ak-btn ak-btn--primary" href={e.meetUrl} target="_blank" rel="noreferrer">{t('Join the call')}</a>}<a className="ak-btn" href={`/calendar/day`}>{t('Edit in the full Calendar')}</a></div>
          </div>
        )}
      </Drawer>
    </Page>
  );
}
