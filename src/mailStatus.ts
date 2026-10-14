// What an email account's state means to the person: can mail arrive, can mail go out.
// `Account.connected` alone was a flag saved by the last DNS check that only looked at the sending records,
// so a mailbox that was already receiving still read "Not connected".
import type { Account, Workspace } from './types';
import { t } from './i18n';

export type MailState = { ok: boolean; label: string; hint?: string };

/** `hasMail`: mail has already arrived in this account, which proves receiving works whatever the records say. */
export function mailState(a: Account, ws: Workspace, hasMail = false): MailState {
  // Gmail, Outlook and the rest: signed in or not.
  if (a.provider && a.provider !== 'sprint2go') return a.connected ? { ok: true, label: t('Connected') } : { ok: false, label: t('Sign in needed'), hint: t('Its owner signs in to bring the mail here.') };
  // The server's own readiness check (mailer.refreshReadiness) knows best; the DNS check and arrived mail fill in.
  const ready = ws.mailReady?.mailboxes?.[a.id];
  const checks = ws.mailChecks?.checks ?? [];
  const passed = (key: string) => checks.find((c) => c.key === key)?.ok;
  const receiving = !!ready?.receive || hasMail || passed('mx') === true || ws.mailRouting?.lastCheck?.ok === true;
  const sending = ready ? ready.send : a.connected || (passed('spf') === true && passed('dkim') === true);
  if (receiving && sending) return { ok: true, label: t('Working') };
  if (receiving) return { ok: false, label: t('Receiving only'), hint: ready?.sendWhy ?? t('Mail arrives. Add the SPF and DKIM records so mail you send isn’t marked as spam.') };
  if (sending) return { ok: false, label: t('No mail arriving yet'), hint: t('Point the domain’s mail here (MX or routing) to start receiving.') };
  return { ok: false, label: t('Not set up'), hint: t('Add the domain’s records in Settings, General & email.') };
}
