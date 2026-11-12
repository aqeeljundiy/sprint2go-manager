// People: the company's people and its teams in one place. Teams was its own app for two cards, and also lived in
// Chat, Tasks and Settings; in v2 it is a view here (the review: "Teams is not an app").
import { useCallback, useMemo, useState } from 'react';
import type { Team as TeamT, User } from '../../types';
import { useStored } from '../../store';
import { t } from '../../i18n';
import { Page, Tabs, esc, useKitList } from '../ui';
import { nameOf, useTeam } from '../team';

const ROLE: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };

export function People() {
  const { ws, members, users, me } = useTeam();
  const [teams, setTeams] = useStored('teams');
  const [view, setView] = useState<'people' | 'teams'>(() => (new URLSearchParams(location.search).get('show') === 'teams' ? 'teams' : 'people'));
  const change = useCallback((v: 'people' | 'teams') => (setView(v), history.replaceState(null, '', v === 'teams' ? '?show=teams' : location.pathname)), []);
  const wsTeams = useMemo(() => teams.filter((tm) => tm.workspaceId === ws.id), [teams, ws.id]);
  const roleOf = (u: User) => ws.members.find((m) => m.userId === u.id)?.role ?? 'member';
  const teamsOf = (u: User) => wsTeams.filter((tm) => tm.members.includes(u.id)).map((tm) => tm.name);
  const people = useKitList<User>(
    () => ({
      id: 'pp',
      rowId: (r) => r.id,
      searchLabel: t('Search people'),
      search: (r) => [r.name, r.email, r.title, ...teamsOf(r)].join(' '),
      sort: { key: 'name', dir: 1 },
      columns: [
        { key: 'name', label: t('Name'), primary: true, truncate: true, value: (r) => r.name, cell: (r) => `<span class="s2a-open">${esc(r.name)}</span><span class="s2a-sub">${esc(r.title || r.email)}</span>` },
        { key: 'role', label: t('Role'), value: (r) => roleOf(r), cell: (r) => `<ak-chip tone="neutral" plain>${esc(t(ROLE[roleOf(r)] ?? roleOf(r)))}</ak-chip>` },
        { key: 'teams', label: t('Teams'), hidePhone: true, value: (r) => teamsOf(r).join(', '), cell: (r) => esc(teamsOf(r).join(', ')) },
        { key: 'email', label: t('Email'), hidePhone: true, truncate: true, value: (r) => r.email, cell: (r) => `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` },
      ],
      summary: (list) => t('{n} people', { n: list.length }),
    }),
    members,
  );
  const join = (tm: TeamT) => setTeams((list) => list.map((x) => (x.id === tm.id ? (tm.join === 'open' ? { ...x, members: [...x.members, me.id] } : { ...x, requests: [...(x.requests ?? []), { userId: me.id, at: new Date().toISOString() }] }) : x)));
  const teamList = useKitList<TeamT>(
    () => ({
      id: 'tm',
      rowId: (r) => r.id,
      searchLabel: t('Search teams'),
      search: (r) => [r.name, r.about].join(' '),
      sort: { key: 'name', dir: 1 },
      columns: [
        { key: 'name', label: t('Team'), primary: true, truncate: true, value: (r) => r.name, cell: (r) => `<span class="s2a-open">${esc(r.name)}</span>${r.about ? `<span class="s2a-sub">${esc(r.about)}</span>` : ''}` },
        { key: 'lead', label: t('Lead'), value: (r) => nameOf(users, r.leadId), cell: (r) => esc(nameOf(users, r.leadId)) },
        { key: 'n', label: t('People'), align: 'end', sort: 'number', value: (r) => r.members.length, cell: (r) => String(r.members.length) },
        { key: 'you', label: t('You'), value: (r) => (r.members.includes(me.id) ? 1 : 0), cell: (r) => (r.members.includes(me.id) ? `<ak-chip tone="success">${esc(t('Member'))}</ak-chip>` : r.requests?.some((q) => q.userId === me.id) ? `<ak-chip tone="warn">${esc(t('Asked to join'))}</ak-chip>` : '') },
      ],
      actions: [{ key: 'join', label: t('Join'), icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>', show: (r) => !r.members.includes(me.id) && !r.requests?.some((q) => q.userId === me.id), run: join }],
      summary: (list) => t('{n} teams', { n: list.length }),
      empty: { none: t('No teams yet. An admin makes them in Settings, People and teams.') },
    }),
    wsTeams,
  );
  return (
    <Page title={t('People')} sub={t('Everyone in {company}, and the teams they work in.', { company: ws.name })} actions={<a className="ak-btn ak-btn--primary" href="/settings/workspace">{t('Invite people')}</a>}>
      <Tabs id="people-view" value={view} onChange={change} items={[{ id: 'people', label: t('People'), count: members.length }, { id: 'teams', label: t('Teams'), count: wsTeams.length }]} />
      <div hidden={view !== 'people'}>{people.el}</div>
      <div hidden={view !== 'teams'}>{teamList.el}</div>
    </Page>
  );
}
