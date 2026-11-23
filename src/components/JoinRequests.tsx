// Requests to join another company (server/joins.ts): someone who already uses sprint2go was invited to a company and
// says yes or no here. Shown once per visit when there are any, and again from the company menu while they wait.
import { useCallback, useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { Modal } from './WorkspaceForms';
import { WorkspaceLogo } from './WorkspaceLogo';
import { Badge, PersonCell } from './ui/Person';
import { t, tn } from '../i18n';
import { lsKey } from '../settings';

export interface JoinRequest {
  token: string;
  role: 'owner' | 'admin' | 'member';
  mailbox: string | null;
  company: { id: string; name: string; color: string; logo?: string };
  by: string;
  at: string;
}

/** Open requests to the signed-in person, fetched when the app opens and when the window comes back to the front. */
export function useJoinRequests() {
  const [list, setList] = useState<JoinRequest[]>([]);
  const load = useCallback(async () => {
    const r = await fetch('/api/joins').catch(() => null);
    if (r?.ok) setList((((await r.json().catch(() => ({}))) as { joins?: JoinRequest[] }).joins ?? []));
  }, []);
  useEffect(() => {
    void load();
    const again = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [load]);
  return { list, load, drop: (token: string) => setList((l) => l.filter((j) => j.token !== token)) };
}

const roleLine = (j: JoinRequest) =>
  j.role === 'owner' ? t('{name} asked you to join as an owner.', { name: j.by || t('Someone') }) : j.role === 'admin' ? t('{name} asked you to join as an admin.', { name: j.by || t('Someone') }) : t('{name} asked you to join as a member.', { name: j.by || t('Someone') });

/** The dialog: one request at a time, oldest first. */
export function JoinRequestDialog({ me, requests, onAnswered, onClose }: { me: string; requests: JoinRequest[]; onAnswered: (token: string) => void; onClose: () => void }) {
  const j = requests[0];
  const [busy, setBusy] = useState<'' | 'accept' | 'decline'>('');
  const [error, setError] = useState('');
  if (!j) return null;
  const answer = async (how: 'accept' | 'decline') => {
    setBusy(how);
    setError('');
    const r = await fetch(`/api/joins/${how}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: j.token }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy('');
    if (!r?.ok) return setError(typeof d.error === 'string' ? t(d.error) : t('No connection. Try again.'));
    onAnswered(j.token);
    // Joined: the app opens again on the new company, with everything that comes with it.
    if (how === 'accept') {
      try {
        localStorage.setItem(lsKey(`pm-ws:${me}`), JSON.stringify(j.company.id));
      } catch {
        /* it opens on the last company; the switcher has the new one */
      }
      location.assign('/');
    }
  };
  return (
    <Modal title={t('Join {company}?', { company: j.company.name })} onClose={onClose}>
      <div className="modal-body join-req">
        <div className="join-req-head">
          <WorkspaceLogo ws={j.company} size={44} />
          <span>
            <strong>{j.company.name}</strong>
            <small>{roleLine(j)}</small>
          </span>
        </div>
        <p className="muted">{t('You keep signing in as you do now. {company} shows up next to your other companies, and they only see what you do in it.', { company: j.company.name })}</p>
        {j.mailbox && (
          <p className="modal-note">
            <Inbox size={14} /> {t('You also get a mailbox there: {address}.', { address: j.mailbox })}
          </p>
        )}
        {error && <small className="form-error" role="alert">{error}</small>}
        {requests.length > 1 && <small className="muted">{tn(requests.length - 1, 'One more request after this one.', '{n} more requests after this one.')}</small>}
      </div>
      <footer className="modal-foot">
        <button className="ghost-btn" disabled={!!busy} onClick={() => void answer('decline')}>
          {busy === 'decline' ? t('Saying no…') : t('Decline')}
        </button>
        <button className="primary-btn" disabled={!!busy} onClick={() => void answer('accept')}>
          {busy === 'accept' ? t('Joining…') : t('Join {company}', { company: j.company.name })}
        </button>
      </footer>
    </Modal>
  );
}

/** Admins: the people this company asked to join who haven't answered yet, each with Cancel. */
export function WaitingToJoin({ workspaceId }: { workspaceId: string }) {
  const [list, setList] = useState<{ token: string; name: string; email: string; role: string }[]>([]);
  const [leaving, setLeaving] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/joins?workspace=${encodeURIComponent(workspaceId)}`).catch(() => null);
    if (r?.ok) setList((((await r.json().catch(() => ({}))) as { waiting?: typeof list }).waiting ?? []));
  }, [workspaceId]);
  useEffect(() => {
    void load();
    window.addEventListener('s2g:joins', load);
    return () => window.removeEventListener('s2g:joins', load);
  }, [load]);
  const cancel = async (token: string) => {
    setLeaving(token);
    await fetch('/api/joins/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null);
    setTimeout(() => (setList((l) => l.filter((j) => j.token !== token)), setLeaving(null)), 180);
  };
  return (
    <>
      {list.map((j) => (
        <div key={j.token} className={`acct-row join-wait${leaving === j.token ? ' row-leaving' : ''}`}>
          <PersonCell person={{ name: j.name || j.email, email: j.email, color: '#94a3b8' }} badges={<Badge tone="info">{t('Waiting to accept')}</Badge>} />
          <button className="ghost-btn outline" onClick={() => void cancel(j.token)}>
            {t('Cancel invite')}
          </button>
        </div>
      ))}
    </>
  );
}
