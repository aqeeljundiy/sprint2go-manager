// Other people signed in on this browser (server/signedIn.ts): someone whose companies sit under different sign-in
// emails switches between them from the company menu or their picture, without signing out.
import { lsKey } from './settings';
import { clearOffline } from './components/mail/offline';

export interface OtherSignIn {
  id: string;
  name: string;
  email: string;
  color?: string;
  photo?: string;
  companies: { id: string; name: string; color: string; logo?: string }[];
}

/** Everyone else signed in here, with their companies. */
export async function loadSignedIn(): Promise<OtherSignIn[]> {
  const r = await fetch('/api/signed-in').catch(() => null);
  if (!r?.ok) return [];
  return ((await r.json().catch(() => ({}))) as { others?: OtherSignIn[] }).others ?? [];
}

/** Opens the app as one of them, on one of their companies when given. */
export async function switchSignIn(userId: string, workspaceId?: string): Promise<string | null> {
  const r = await fetch('/api/signed-in/switch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) }).catch(() => null);
  if (!r?.ok) return ((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No connection. Try again.';
  if (workspaceId)
    try {
      localStorage.setItem(lsKey(`pm-ws:${userId}`), JSON.stringify(workspaceId));
    } catch {
      /* private window: it opens on their last company */
    }
  await clearOffline().catch(() => {}); // the mail kept for offline belongs to the person who was signed in
  location.assign('/');
  return null;
}

/** "Add another account": this sign-in waits, and the sign-in page opens for the next one. */
export async function addSignIn(): Promise<string | null> {
  const r = await fetch('/api/signed-in/add', { method: 'POST' }).catch(() => null);
  if (!r?.ok) return ((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? 'No connection. Try again.';
  await clearOffline().catch(() => {});
  location.assign('/signin');
  return null;
}

/** Signs one of the waiting accounts out of this browser (the sign-in page's list). */
export async function forgetSignIn(userId: string): Promise<void> {
  await fetch('/api/signed-in/forget', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) }).catch(() => null);
}
