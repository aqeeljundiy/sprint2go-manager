// Several people signed in on one browser (like Slack's "add workspace"): someone with companies under different
// sign-in emails switches between them without signing out. The active sign-in is the `s2g` cookie as always; the
// others wait in `s2g_more` (HttpOnly, the same lifetime), as their own session tokens. Every token is checked on every
// use, so an expired or ended session simply drops out of the list.
import * as db from './db.ts';

export const MORE_COOKIE = 's2g_more';
/** How many other sign-ins one browser keeps besides the active one. */
export const MAX_MORE = 5;

/** The waiting tokens from the cookie, only those that still sign someone in, one per person, never the active one's person. */
export function waiting(raw: string | undefined, activeToken: string | undefined): string[] {
  const active = db.sessionInfo(activeToken)?.userId ?? null;
  const seen = new Set<string>(active ? [active] : []);
  const out: string[] = [];
  for (const tk of String(raw ?? '').split('.').filter(Boolean)) {
    const s = db.sessionInfo(tk);
    if (!s || s.operator || seen.has(s.userId)) continue;
    seen.add(s.userId);
    out.push(tk);
  }
  return out.slice(0, MAX_MORE);
}

/** The cookie value for a list of waiting tokens (base64url tokens never contain a dot). */
export const pack = (tokens: string[]) => tokens.slice(0, MAX_MORE).join('.');

/** Who a token signs in as. */
export const userOf = (token: string) => db.sessionInfo(token)?.userId ?? null;

/** The active token goes into the waiting list (first), so a new sign-in can take its place. */
export function park(activeToken: string | undefined, more: string[]): string[] {
  const s = db.sessionInfo(activeToken);
  if (!s || s.operator || !activeToken) return more;
  return [activeToken, ...more.filter((tk) => userOf(tk) !== s.userId)].slice(0, MAX_MORE);
}

/** Switch to one of the waiting people: their token becomes active, the active one waits. Null when they aren't here. */
export function switchTo(userId: string, activeToken: string | undefined, more: string[]): { active: string; more: string[] } | null {
  const target = more.find((tk) => userOf(tk) === userId);
  if (!target) return null;
  const rest = more.filter((tk) => tk !== target);
  return { active: target, more: park(activeToken, rest) };
}
