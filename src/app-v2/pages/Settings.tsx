// Settings: 31 sections regrouped (the review). Email in one group instead of seven sections in two; one list, the
// same order on a phone and a computer; Teams lives under People; Developer last. Each section's form is still v1's
// (/settings/<id>), opened from here: the forms are rebuilt on the kit one group at a time (docs/admin-kit-v2-app-queue.md).
import { useMemo, useState } from 'react';
import { t } from '../../i18n';
import { SETTINGS_INDEX } from '../../settingsIndex';
import { term } from '../../terms';
import { Card, Page, BASE } from '../ui';
import { useTeam } from '../team';

type Row = { id: string; name: string; hint: string; href?: string; admin?: boolean };
type Group = { id: string; title: string; rows: Row[] };

const GROUPS = (): Group[] => [
  {
    id: 'you',
    title: t('You'),
    rows: [
      { id: 'account', name: t('Account'), hint: t('Name, photo, password, two-step sign-in, language') },
      { id: 'appearance', name: t('Appearance'), hint: t('Light or dark, density') },
      { id: 'notifications', name: t('Notifications'), hint: t('Push, email, quiet hours, sounds') },
      { id: 'myapps', name: t('Your apps'), hint: t('Hide apps, their order') },
      { id: 'shortcuts', name: t('Shortcuts'), hint: t('Keyboard shortcuts') },
    ],
  },
  {
    id: 'email',
    title: t('Email'),
    rows: [
      { id: 'mail', name: t('Mail & signature'), hint: t('Signature, writing, out of office') },
      { id: 'mailapps', name: t('Phone mail apps'), hint: t('IMAP and app passwords') },
      { id: 'mailaccess', name: t('Mailbox access'), hint: t('Delegation, forwarding, POP') },
      { id: 'mailstorage', name: t('Mail storage'), hint: t('Mailbox size') },
      { id: 'domains', name: t('Domains'), hint: t('Add a domain, verify DNS, aliases'), admin: true },
      { id: 'email', name: t('Email delivery'), hint: t('Sending, SPF, DKIM'), admin: true },
      { id: 'mailgroups', name: t('Groups & shared inboxes'), hint: t('Groups and shared inboxes'), admin: true },
      { id: 'mailrules', name: t('Mail retention & rules'), hint: t('Retention and mail rules'), admin: true },
      { id: 'import', name: t('Import'), hint: t('Mail from Google or Microsoft'), admin: true },
    ],
  },
  {
    id: 'company',
    title: t('Company'),
    rows: [
      { id: 'workspace', name: t('General & email'), hint: t('Company name, logo, members, mailboxes, public holidays') },
      { id: 'people', name: t('People and teams'), hint: t('Everyone in the company, and the teams'), href: `${BASE}/people?show=teams` },
      { id: 'permissions', name: t('Permissions'), hint: t('Roles, admins, who sees billing'), admin: true },
      { id: 'stages', name: t('Task stages'), hint: t('Stages and review') },
      { id: 'clients', name: t('{Who} access', { who: term.who }), hint: t('What guests can see and do') },
      { id: 'agency', name: t('Client portal & brand'), hint: t('The guests’ portal, brand colour, logo') },
      { id: 'apps', name: t('Apps & chat'), hint: t('Company apps and chat') },
      { id: 'meetings', name: t('Meetings'), hint: t('Recording, meeting notes, the notetaker') },
      { id: 'ai', name: t('AI'), hint: t('AI keys, costs, models'), admin: true },
      { id: 'ai-apps', name: t('Connect AI apps'), hint: t('Claude, ChatGPT and other AI apps') },
    ],
  },
  {
    id: 'plan',
    title: t('Plan and data'),
    rows: [
      { id: 'billing', name: t('Plan & billing'), hint: t('Plan, invoices, payment method'), admin: true },
      { id: 'storage', name: t('Storage'), hint: t('Storage used, buy more'), admin: true },
      { id: 'security', name: t('Security & data'), hint: t('Sign-in rules, sessions, export') },
      { id: 'help', name: t('Help & support'), hint: t('Contact support, guides') },
      { id: 'developer', name: t('Developer'), hint: t('Demo company, onboarding') },
    ],
  },
];

export function Settings() {
  const { ws, me } = useTeam();
  const [q, setQ] = useState('');
  const admin = ['owner', 'admin'].includes(ws.members.find((m) => m.userId === me.id)?.role ?? '');
  const groups = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (r: Row) => !words.length || words.every((w) => [r.name, r.hint, ...(SETTINGS_INDEX[r.id]?.options.map((o) => t(o)) ?? [])].join(' ').toLowerCase().includes(w));
    return GROUPS()
      .map((g) => ({ ...g, rows: g.rows.filter((r) => (admin || !r.admin) && hit(r)) }))
      .filter((g) => g.rows.length);
  }, [q, admin]);
  return (
    <Page title={t('Settings')} sub={t('Your own setup and {company}’s, in four groups.', { company: ws.name })}>
      <div className="ak-toolbar">
        <input className="ak-input" type="search" aria-label={t('Search settings')} placeholder={t('Search settings, for example signature')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {groups.length ? (
        <div className="ak-columns">
          {groups.map((g) => (
            <Card key={g.id} title={g.title} flush>
              <ul className="s2a-rows s2a-pad">
                {g.rows.map((r) => (
                  <li key={r.id}>
                    <a className="s2a-row s2a-link" href={r.href ?? `/settings/${r.id}`}>
                      <span className="s2a-row__main"><span className="s2a-row__title">{r.name}</span><span className="s2a-row__sub">{r.hint}</span></span>
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : (
        <p className="s2a-note">{t('No setting matches “{q}”.', { q })}</p>
      )}
      <p className="s2a-note">{admin ? t('Each section opens its form in the full Settings.') : t('Some company sections are for admins only.')}</p>
    </Page>
  );
}
