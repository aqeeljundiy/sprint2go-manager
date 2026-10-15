// A company's domains, the Google Workspace way: several per company, one of them primary. Mailboxes, shared inboxes,
// groups and addresses can live on any of them; brands (src/brands.ts) are optional on top.
import type { Workspace } from './types';

const lower = (s: string) => s.trim().toLowerCase();
type Doms = Pick<Workspace, 'domains' | 'primaryDomain'>;

/** The company's main domain: the one marked primary while it's still listed, else the first. '' when it has none. */
export function primaryDomain(ws: Doms | undefined): string {
  if (!ws) return '';
  const p = ws.primaryDomain ? ws.domains.find((d) => lower(d) === lower(ws.primaryDomain!)) : undefined;
  return p || ws.domains[0] || '';
}

/** The domains with the primary first, the rest as listed. */
export function orderedDomains(ws: Doms): string[] {
  const p = primaryDomain(ws);
  return p ? [p, ...ws.domains.filter((d) => d !== p)] : [...ws.domains];
}

/** Domains people can get addresses on: every one the company has, except ones another company holds. Primary first. */
export function usableDomains(ws: Doms & Pick<Workspace, 'domainChecks'>): string[] {
  return orderedDomains(ws).filter((d) => {
    const o = ws.domainChecks?.[lower(d)]?.owner;
    return o !== 'held' && o !== 'taken';
  });
}

/** Is this one of the company's domains? */
export const isOurDomain = (ws: Pick<Workspace, 'domains'>, domain: string) => ws.domains.some((d) => lower(d) === lower(domain));

/** What someone typed, as a bare hostname: no scheme, @, www. or path. */
export const cleanDomain = (raw: string) => lower(raw).replace(/^https?:\/\//, '').replace(/^@/, '').replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
export const validDomain = (d: string) => /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d);
