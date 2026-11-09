// The v2 console's helpers: the same calls and labels as v1 (../api), with time written the v2 way.
import { fmtDate } from '../../i18n/format';
import { rel as relV1 } from '../api';

export * from '../api';

/** Relative when recent ("3 min ago", "in 2 days"), the date after about a week ("8 Oct"), never raw ISO. */
export function rel(iso: string) {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  if (Math.abs(ms - Date.now()) < 7 * 86_400_000) return relV1(iso);
  const sameYear = new Date(ms).getFullYear() === new Date().getFullYear();
  return fmtDate(iso, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}
/** The exact moment, for a hover title. */
export const exact = (iso?: string | null) => (iso ? fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '');
