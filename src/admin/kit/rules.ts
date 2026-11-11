// Display rules the console v2 uses on top of the server's data (no server change).
import type { CompanyRow } from '../api';

/** A company younger than this is "Not started yet", never "At risk": it has had no chance to use sprint2go. */
export const GRACE_DAYS = 7;
export const isNewCompany = (c: Pick<CompanyRow, 'since'>) => !!c.since && Date.now() - new Date(c.since).getTime() < GRACE_DAYS * 86_400_000;
