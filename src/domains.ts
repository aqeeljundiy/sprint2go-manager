// A company's domains, the Google Workspace way: several per company, one of them primary. Mailboxes, shared inboxes,
// groups and addresses can live on any of them; each can have its own look (lookOf).
import type { DomainLook, Workspace } from './types';

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

type Legacy = { brands?: { name?: string; color?: string; logo?: string; domains?: string[] }[] };
/**
 * How mail from each domain looks, keyed by lowercase domain. Data saved before the server folded brands into domains
 * (server/domains.ts, migrateBrands) still reads: a brand's look fills in its domains that have none.
 */
export function domainLooks(ws: Pick<Workspace, 'domainLooks'> | undefined): Record<string, DomainLook> {
  const out: Record<string, DomainLook> = {};
  for (const [d, l] of Object.entries(ws?.domainLooks ?? {})) if (l) out[lower(d)] = l;
  for (const b of (ws as Legacy | undefined)?.brands ?? [])
    for (const d of b.domains ?? []) if (!out[lower(d)]) out[lower(d)] = { name: b.name, color: b.color, logo: b.logo };
  return out;
}
/** The look of the domain an address is on, when that domain has one. */
export function lookOf(ws: Pick<Workspace, 'domainLooks'> | undefined, address: string): DomainLook | undefined {
  const d = lower(address.split('@')[1] ?? '');
  const l = d ? domainLooks(ws)[d] : undefined;
  return l && (l.name || l.color || l.logo) ? l : undefined;
}

/** What someone typed, as a bare hostname: no scheme, @, www. or path. */
export const cleanDomain = (raw: string) => lower(raw).replace(/^https?:\/\//, '').replace(/^@/, '').replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
export const validDomain = (d: string) => /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d);
