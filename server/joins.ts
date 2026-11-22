// Asking someone who already uses sprint2go to join another company. An admin can't put an existing person into
// their company by themselves: the person gets a request ("Rimba Studio asked you to join as a member") and says
// yes or no in their own app. Until they accept they're not a member and see nothing of that company.
// Someone new (no sign-in yet) still gets the usual invite link, where they pick a password.
import { randomBytes } from 'node:crypto';
import * as db from './db.ts';

db.db.exec(`
  CREATE TABLE IF NOT EXISTS company_joins (
    token TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
    mailbox TEXT, shared TEXT NOT NULL DEFAULT '[]', invited_by TEXT NOT NULL, created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL, answered_at TEXT, answer TEXT
  );
  CREATE INDEX IF NOT EXISTS company_joins_user ON company_joins (user_id);
`);

const DAYS = 30;
export type Role = 'owner' | 'admin' | 'member';
/** A mailbox to make for them when they accept (an address at the company's domain), or none. */
export type Mailbox = { email: string; name: string } | null;
export interface Join {
  token: string;
  workspaceId: string;
  userId: string;
  role: Role;
  mailbox: Mailbox;
  shared: string[];
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
}
type Row = { token: string; workspace_id: string; user_id: string; role: string; mailbox: string | null; shared: string; invited_by: string; created_at: string; expires_at: string };
const of = (r: Row): Join => ({
  token: r.token,
  workspaceId: r.workspace_id,
  userId: r.user_id,
  role: r.role === 'owner' || r.role === 'admin' ? r.role : 'member',
  mailbox: r.mailbox ? JSON.parse(r.mailbox) : null,
  shared: JSON.parse(r.shared || '[]'),
  invitedBy: r.invited_by,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
});
const OPEN = 'answered_at IS NULL AND expires_at > ?';
const now = () => new Date().toISOString();

/** Asks them (again): one open request per person and company, the newest wins. */
export function ask(j: Omit<Join, 'token' | 'createdAt' | 'expiresAt'>): Join {
  db.db.prepare(`DELETE FROM company_joins WHERE workspace_id = ? AND user_id = ? AND answered_at IS NULL`).run(j.workspaceId, j.userId);
  const token = randomBytes(18).toString('base64url');
  const at = now();
  const until = new Date(Date.now() + DAYS * 86_400_000).toISOString();
  db.db.prepare('INSERT INTO company_joins (token, workspace_id, user_id, role, mailbox, shared, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(token, j.workspaceId, j.userId, j.role, j.mailbox ? JSON.stringify(j.mailbox) : null, JSON.stringify(j.shared), j.invitedBy, at, until);
  return { ...j, token, createdAt: at, expiresAt: until };
}
/** Open requests to this person. */
export const forUser = (userId: string) => (db.db.prepare(`SELECT * FROM company_joins WHERE user_id = ? AND ${OPEN} ORDER BY created_at`).all(userId, now()) as Row[]).map(of);
/** Open requests a company sent (its admins see who hasn't answered yet). */
export const forCompany = (workspaceId: string) => (db.db.prepare(`SELECT * FROM company_joins WHERE workspace_id = ? AND ${OPEN} ORDER BY created_at`).all(workspaceId, now()) as Row[]).map(of);
/** One open request, by its token. */
export const open = (token: string) => {
  const r = db.db.prepare(`SELECT * FROM company_joins WHERE token = ? AND ${OPEN}`).get(token, now()) as Row | undefined;
  return r ? of(r) : null;
};
/** Marks the answer (accepted, declined or cancelled by the company). */
export const answer = (token: string, a: 'accepted' | 'declined' | 'cancelled') => db.db.prepare('UPDATE company_joins SET answered_at = ?, answer = ? WHERE token = ? AND answered_at IS NULL').run(now(), a, token).changes > 0;
/** Everything about a person goes when their account does. */
export const forget = (userId: string) => db.db.prepare('DELETE FROM company_joins WHERE user_id = ?').run(userId);
