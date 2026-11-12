// Home: what needs me today. Work first, the same order on a phone and a computer; setup comes last (the review:
// "Finish setting up" sat above "Needs you" on desktop and at the bottom on phones).
import { useMemo } from 'react';
import { useStored } from '../../store';
import { t, tn } from '../../i18n';
import { fmtDate, fmtTime } from '../../i18n/format';
import { Card, Chip, Empty, Page, BASE, todayKey, when } from '../ui';
import { dueNow, inWs, isMine, useTeam } from '../team';

export function Home() {
  const { me, ws } = useTeam();
  const [todos] = useStored('todos');
  const [threads] = useStored('threads');
  const [events] = useStored('events');
  const [meetings] = useStored('meetings');
  const today = todayKey();
  const myAccounts = useMemo(() => new Set(ws.accounts.filter((a) => a.users.includes(me.id)).map((a) => a.id)), [ws, me.id]);
  const tasks = todos.filter(inWs(ws)).filter((tk) => isMine(me)(tk) && dueNow(tk)).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
  const requests = todos.filter((tk) => tk.workspaceId === ws.id && tk.source === 'request' && !tk.done && !tk.userId);
  const changes = todos.filter((tk) => tk.workspaceId === ws.id && tk.approval?.status === 'changes' && !tk.done && (isMine(me)(tk) || tk.createdBy === me.id));
  const unread = threads.filter((th) => myAccounts.has(th.accountId) && th.location === 'inbox' && th.unread && !th.snoozedUntil);
  const day = events.filter(inWs(ws)).filter((e) => (!e.userId || e.userId === me.id) && e.start.slice(0, 10) === today).sort((a, b) => a.start.localeCompare(b.start));
  const calls = meetings.filter((m) => m.workspaceId === ws.id && m.at.slice(0, 10) === today);
  const first = me.name.split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 11 ? t('Good morning, {name}.', { name: first }) : hour < 15 ? t('Good afternoon, {name}.', { name: first }) : t('Good evening, {name}.', { name: first });
  const needs = tasks.length + requests.length + changes.length;
  const setup = ws.accounts.length === 0;
  return (
    <Page title={t('Home')} sub={`${fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}. ${greet}`} actions={<a className="ak-btn ak-btn--primary" href={`${BASE}/tasks?new=1`}>{t('New task')}</a>}>
      <ak-stats>
        <ak-stat label={t('Needs you')} value={String(needs)} href={`${BASE}/tasks`} count-in="off" />
        <ak-stat label={t('Unread mail')} value={String(unread.length)} href={`${BASE}/mail`} count-in="off" />
        <ak-stat label={t('On the calendar today')} value={String(day.length + calls.length)} href={`${BASE}/calendar`} count-in="off" />
      </ak-stats>
      <div className="s2a-cards">
        <Card title={t('Needs you')} aside={<a className="ak-btn ak-btn--ghost" href={`${BASE}/tasks`}>{t('All tasks')}</a>}>
          {needs ? (
            <ul className="s2a-rows">
              {changes.map((tk) => (
                <li key={tk.id} className="s2a-row">
                  <div className="s2a-row__main"><span className="s2a-row__title">{tk.title}</span><span className="s2a-row__sub">{t('A guest asked for changes')}</span></div>
                  <Chip tone="warn">{t('Changes asked')}</Chip>
                </li>
              ))}
              {requests.map((tk) => (
                <li key={tk.id} className="s2a-row">
                  <div className="s2a-row__main"><span className="s2a-row__title">{tk.title}</span><span className="s2a-row__sub">{t('New request from {who}', { who: tk.requestedBy ?? '' })}</span></div>
                  <Chip tone="info">{t('Request')}</Chip>
                </li>
              ))}
              {tasks.map((tk) => (
                <li key={tk.id} className="s2a-row">
                  <div className="s2a-row__main"><span className="s2a-row__title">{tk.title}</span><span className="s2a-row__sub">{tk.due! < today ? t('Overdue') : t('Due today')}</span></div>
                  <Chip tone={tk.due! < today ? 'danger' : 'neutral'}>{tk.due! < today ? t('Late') : t('Today')}</Chip>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title={t('Nothing waiting on you')} text={t('Tasks due today, guest requests and asked-for changes show here.')} />
          )}
        </Card>
        <Card title={t('Today')} aside={<a className="ak-btn ak-btn--ghost" href={`${BASE}/calendar`}>{t('Calendar')}</a>}>
          {day.length + calls.length ? (
            <ul className="s2a-rows">
              {[...day.map((e) => ({ id: e.id, at: e.start, title: e.title, sub: e.allDay ? t('All day') : t('{from} to {to}', { from: fmtTime(e.start), to: fmtTime(e.end) }) })), ...calls.map((m) => ({ id: m.id, at: m.at, title: m.title, sub: t('Meeting, {n} min', { n: m.minutes }) }))]
                .sort((a, b) => a.at.localeCompare(b.at))
                .map((x) => (
                  <li key={x.id} className="s2a-row"><div className="s2a-row__main"><span className="s2a-row__title">{x.title}</span><span className="s2a-row__sub">{x.sub}</span></div></li>
                ))}
            </ul>
          ) : (
            <Empty title={t('Nothing on the calendar today')} />
          )}
        </Card>
        <Card title={t('Unread mail')} aside={<a className="ak-btn ak-btn--ghost" href={`${BASE}/mail`}>{t('Mail')}</a>}>
          {unread.length ? (
            <ul className="s2a-rows">
              {unread.slice(0, 5).map((th) => {
                const last = th.messages[th.messages.length - 1];
                return (
                  <li key={th.id} className="s2a-row"><div className="s2a-row__main"><span className="s2a-row__title">{th.subject || t('(no subject)')}</span><span className="s2a-row__sub">{last ? `${last.from.name || last.from.email}, ${when(last.date)}` : ''}</span></div></li>
                );
              })}
              {unread.length > 5 && <li className="s2a-row"><span className="s2a-note">{tn(unread.length - 5, 'and {n} more', 'and {n} more')}</span></li>}
            </ul>
          ) : (
            <Empty title={t('No unread mail')} />
          )}
        </Card>
        {setup && (
          <Card title={t('Finish setting up')}>
            <Empty title={t('Connect a mailbox')} text={t('Mail, the calendar and invites need one mailbox.')}>
              <a className="ak-btn" href="/settings/workspace">{t('Open Mailboxes')}</a>
            </Empty>
          </Card>
        )}
      </div>
    </Page>
  );
}
