// Sign-in emails (Settings, Account, Security): more addresses that sign in to this same person and get password
// codes, each confirmed by a code. One person reachable at work and personal addresses, and leaving a company (and its
// mailbox) never locks anyone out of their other companies. The server checks the code and keeps the addresses
// (server/index.ts /api/account/emails).
import { useEffect, useState } from 'react';
import { server } from '../sync';
import { t } from '../i18n';
import { usePhone } from '../mobile/media';
import { SmoothHeight } from './ui/Smooth';
import { Sheet } from './ui/Sheet';
import { GRow } from './ui/Grouped';
import { Badge } from './ui/Person';

type Step = { kind: 'idle' } | { kind: 'email' } | { kind: 'code'; email: string; devCode?: string };
type Emails = { main: string; extra: string[]; max: number };

async function call(method: string, payload?: unknown): Promise<{ ok: boolean; data: any }> {
  const r = await fetch('/api/account/emails', { method, headers: payload ? { 'content-type': 'application/json' } : undefined, body: payload ? JSON.stringify(payload) : undefined }).catch(() => null);
  const data = r ? await r.json().catch(() => ({})) : { error: t('No connection. Try again.') };
  return { ok: !!r?.ok, data };
}

function useBackupEmail(toast?: (s: string) => void) {
  const [emails, setEmails] = useState<Emails | undefined>(undefined);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (server.on) void call('GET').then((r) => r.ok && setEmails(r.data));
  }, []);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return {
    emails,
    full: !!emails && emails.extra.length >= emails.max,
    step,
    error,
    busy,
    start: () => (setError(''), setStep({ kind: 'email' })),
    cancel: () => (setError(''), setStep({ kind: 'idle' })),
    sendCode: (address: string) =>
      run(async () => {
        const r = await call('POST', { email: address });
        if (!r.ok) return setError(r.data.error ? t(r.data.error) : t('Couldn’t send the code. Try again.'));
        setStep({ kind: 'code', email: address.trim().toLowerCase(), devCode: r.data.devCode });
      }),
    confirm: (code: string) =>
      run(async () => {
        const r = await call('POST', { code });
        if (!r.ok) return setError(r.data.error ? t(r.data.error) : t('That code isn’t right.'));
        setEmails(r.data);
        setStep({ kind: 'idle' });
        toast?.(t('Email added. You can sign in with it too.'));
      }),
    remove: (email: string) =>
      run(async () => {
        const r = await call('DELETE', { email });
        if (!r.ok) return setError(r.data.error ? t(r.data.error) : t('Couldn’t remove it. Try again.'));
        setEmails(r.data);
        toast?.(t('{email} no longer signs in', { email }));
      }),
  };
}

/** The form: the address, then the code sent to it. */
function BackupForm({ b }: { b: ReturnType<typeof useBackupEmail> }) {
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  if (b.step.kind === 'idle') return null;
  const onCode = b.step.kind === 'code';
  return (
    <form
      className="backup-form"
      onSubmit={(e) => {
        e.preventDefault();
        void (onCode ? b.confirm(code) : b.sendCode(address));
      }}
    >
      {onCode ? (
        <>
          <small>{t('We sent a 6-digit code to {email}.', { email: (b.step as { email: string }).email })}</small>
          <input key="code" autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" aria-label={t('Code')} />
          {(b.step as { devCode?: string }).devCode && <small>{t('Test code: {code}', { code: (b.step as { devCode?: string }).devCode! })}</small>}
        </>
      ) : (
        <>
          <small>{t('A personal address is safest: a company you leave can close its mailbox.')}</small>
          <input key="email" autoFocus type="email" autoComplete="email" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="you@gmail.com" aria-label={t('Email address')} />
        </>
      )}
      {b.error && <small className="form-error" role="alert">{b.error}</small>}
      <div className="backup-actions">
        <button type="button" className="ghost-btn" onClick={b.cancel}>
          {t('Cancel')}
        </button>
        <button type="submit" className="primary-btn sm" disabled={b.busy || (onCode ? code.replace(/\D/g, '').length !== 6 : !address.includes('@'))}>
          {onCode ? t('Confirm') : t('Send code')}
        </button>
      </div>
    </form>
  );
}

/** Settings, Account, Security: the main sign-in email and the others, each removable, the form folding open under them. */
export function BackupEmailRow({ toast }: { toast?: (s: string) => void }) {
  const b = useBackupEmail(toast);
  const phone = usePhone();
  if (!server.on) return null;
  const extra = b.emails?.extra ?? [];
  if (phone)
    return (
      <>
        {extra.map((e) => (
          <GRow key={e} label={t('Also signs in')} value={e} accessory={<button type="button" className="link-btn" disabled={b.busy} onClick={() => void b.remove(e)}>{t('Remove')}</button>} />
        ))}
        {!b.full && <GRow label={t('Sign-in emails')} value={t('Add an email')} onClick={b.start} />}
        {b.step.kind !== 'idle' && (
          <Sheet title={t('Add a sign-in email')} onClose={b.cancel}>
            <BackupForm b={b} />
          </Sheet>
        )}
      </>
    );
  return (
    <div className="backup-email">
      <div className="set-row">
        <span>
          <strong>
            {t('Sign-in emails')} {extra.length > 0 && <Badge tone="good">{t('On')}</Badge>}
          </strong>
          <small>{b.emails ? t('You sign in with {email}. Add your other addresses so any of them opens this same account.', { email: b.emails.main }) : t('Add your other addresses so any of them opens this same account.')}</small>
        </span>
        {b.step.kind === 'idle' && b.emails && !b.full && (
          <button type="button" className="ghost-btn outline" onClick={b.start}>
            {t('Add')}
          </button>
        )}
      </div>
      <SmoothHeight>
        {extra.map((e) => (
          <div key={e} className="set-row sub">
            <span>{e}</span>
            <button type="button" className="ghost-btn outline" disabled={b.busy} onClick={() => void b.remove(e)}>
              {t('Remove')}
            </button>
          </div>
        ))}
        <BackupForm b={b} />
      </SmoothHeight>
    </div>
  );
}
