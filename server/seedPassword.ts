import { randomBytes } from 'node:crypto';

/**
 * The password the demo people get on a first run. There is no shared starter password any more: this repository is
 * public, so any password written in it is known to everyone.
 *
 * - SEED_PASSWORD set: used, unless it is a password this repository once published or shorter than 12 characters.
 * - Not set, on a laptop: a random one is made and printed once in the server log.
 * - Not set, on a production server (a public demo with S2G_DEMO=1): the server refuses to start.
 */

/** Starter passwords this repository published in the past. Never accepted, and swept off live sign-ins at start. */
export const PUBLISHED_SEED_PASSWORDS = ['sprint2go-local-demo'];

export function seedPassword(env: Record<string, string | undefined>): { password: string; generated: boolean } {
  const set = env.SEED_PASSWORD?.trim();
  if (set) {
    if (PUBLISHED_SEED_PASSWORDS.includes(set)) throw new Error('SEED_PASSWORD is a password this public repository once published. Choose your own (at least 12 characters).');
    if (set.length < 12) throw new Error('SEED_PASSWORD is too short. Use at least 12 characters.');
    return { password: set, generated: false };
  }
  if (env.NODE_ENV === 'production') throw new Error('Set SEED_PASSWORD (at least 12 characters, your own) before the first start of a demo server.');
  return { password: randomBytes(12).toString('base64url'), generated: true };
}

/**
 * Sign-ins that still use a published starter password get a new random one (nobody knows it; the person uses
 * "Forgot password" to choose their own). No account, person or data is removed. Returns the user ids changed.
 */
export async function sweepPublishedPasswords(
  logins: { user_id: string; email: string; pw_hash: string }[],
  check: (pw: string, hash: string) => Promise<boolean>,
  replace: (userId: string, email: string, pw: string) => Promise<void>,
): Promise<string[]> {
  const changed: string[] = [];
  for (const l of logins) {
    let hit = false;
    for (const pw of PUBLISHED_SEED_PASSWORDS) if (await check(pw, l.pw_hash).catch(() => false)) hit = true;
    if (!hit) continue;
    await replace(l.user_id, l.email, randomBytes(24).toString('base64url'));
    changed.push(l.user_id);
  }
  return changed;
}
