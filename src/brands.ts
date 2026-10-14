// Brands inside a company: a mailbox (or any address) belongs to the brand that owns its domain.
import type { Brand, Workspace } from './types';

const domainOf = (address: string) => address.toLowerCase().split('@')[1] ?? '';

/** The brand an address sends as, if its domain belongs to one. */
export function brandOf(ws: Pick<Workspace, 'brands'> | undefined, address: string): Brand | undefined {
  const d = domainOf(address);
  return d ? ws?.brands?.find((b) => b.domains.some((x) => x.toLowerCase() === d)) : undefined;
}

/** Domains no brand has claimed yet (a domain belongs to one brand at most). */
export const freeDomains = (ws: Pick<Workspace, 'brands' | 'domains'>, except?: string) =>
  ws.domains.filter((d) => !(ws.brands ?? []).some((b) => b.id !== except && b.domains.includes(d)));
