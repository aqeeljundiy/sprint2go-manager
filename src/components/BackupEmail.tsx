// A backup sign-in email (Settings, Account, Security): a second address that signs in and gets password codes.
// Someone who signs in with a company address keeps their account (and their other companies) if that company
// closes the mailbox. The server checks the code and keeps the address (server/index.ts /api/account/backup-email).
import { useEffect, useState } from 'react';
import { server } from '../sync';
import { t } from '../i18n';
import { usePhone } from '../mobile/media';
import { SmoothHeight } from './ui/Smooth';
import { Sheet } from './ui/Sheet';
import { GRow } from './ui/Grouped';
import { Badge } from './ui/Person';

type Step = { kind: 'idle' } | { kind: 'email' } | { kind: 'code'; email: string; devCode?: string };

async function call(method: string, payload?: unknown): Promise<{ ok: boolean; data: any }> {
  const r = await fetch('/api/account/backup-email', { method, headers: payload ? { 'content-type': 'application/json' } : undefined, body: payload ? JSON.stringify(payload) : undefined }).catch(() => null);
  const data = r ? await r.json().catch(() => ({})) : { error: t('No connection. Try again.') };
  return { ok: !!r?.ok, data };
}

function useBackupEmail(toast?: (s: string) => void) {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (server.on) void call('GET').then((r) => setEmail(r.ok ? r.data.email : null));
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
    email,
    step,
    error,
    busy,
    start: () => (setError(''), setStep({ kind: 'email' })),
    cancel: () => (setError(''), setStep({ kind: 'idle' })),
    sendCode: (address: string) =>
      run(async () => {
        const r = await call('POST', { email: address });
        if (!r.ok) return setError(r.data.error ?? t('Couldn’t send the code. Try again.'));
        setStep({ kind: 'code', email: address.trim().toLowerCase(), devCode: r.data.devCode });
      }),
    confirm: (code: string) =>
      run(async () => {
        const r = await call('POST', { code });
        if (!r.ok) return setError(r.data.error ?? t('That code isn’t right.'));
        setEmail(r.data.email);
        setStep({ kind: 'idle' });
        toast?.(t('Backup email added. You can sign in with it too.'));
      }),
    remove: () =>
      run(async () => {
        const r = await call('DELETE');
        if (!r.ok) return setError(r.data.error ?? t('Couldn’t remove it. Try again.'));
        setEmail(null);
        toast?.(t('Backup email removed'));
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
          <small>{t('Use a personal address that isn’t run by a company you work for.')}</small>
          <input key="email" autoFocus type="email" autoComplete="email" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="you@gmail.com" aria-label={t('Backup email')} />
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

/** Desktop: a row in Security, the form folding open under it. */
export function BackupEmailRow({ toast }: { toast?: (s: string) => void }) {
  const b = useBackupEmail(toast);
  const phone = usePhone();
  if (!server.on) return null;
  if (phone)
    return (
      <>
        <GRow label={t('Backup sign-in email')} value={b.email ?? t('Add')} onClick={b.email ? undefined : b.start} accessory={b.email ? <button type="button" className="link-btn" onClick={() => void b.remove()}>{t('Remove')}</button> : undefined} />
        {b.step.kind !== 'idle' && (
          <Sheet title={t('Backup sign-in email')} onClose={b.cancel}>
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
            {t('Backup sign-in email')} {b.email && <Badge tone="good">{t('On')}</Badge>}
          </strong>
          <small>{b.email ? t('{email} signs in and gets password codes too.', { email: b.email }) : t('A second address to sign in with, so leaving a company never locks you out.')}</small>
        </span>
        {b.email ? (
          <button type="button" className="ghost-btn outline" disabled={b.busy} onClick={() => void b.remove()}>
            {t('Remove')}
          </button>
        ) : (
          b.step.kind === 'idle' && b.email !== undefined && (
            <button type="button" className="ghost-btn outline" onClick={b.start}>
              {t('Add')}
            </button>
          )
        )}
      </div>
      <SmoothHeight>
        <BackupForm b={b} />
      </SmoothHeight>
    </div>
  );
}
