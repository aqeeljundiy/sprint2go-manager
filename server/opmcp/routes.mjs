// The two routes, called from server/index.ts:
//   /admin/mcp                 the MCP endpoint (Streamable HTTP); a token from Team › Agent access; signed out = 401.
//   /api/admin/agent-tokens    list, make, change and revoke tokens; only an owner operator past two-step; signed out = 401.
import { access } from './access.mjs';
import * as platform from '../platform.ts';

export const MCP_PATH = '/admin/mcp';
export const mcpRoute = (req, res) => access.node(req, res);

const send = (res, status, body) => (res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }), res.end(JSON.stringify(body)));

/** `who`: { email, token } of the signed-in person, or null when signed out. */
export async function tokensRoute(req, res, who) {
  if (!who?.email) return send(res, 401, { error: 'Signed out' });
  const op = platform.operator(who.email);
  if (!op) return send(res, 403, { error: 'Operators only.' });
  if (!op.totpOn || !platform.sessionVerified(who.token)) return send(res, 401, { error: 'Enter your 2FA code.', verify: true });
  if (op.role !== 'owner') return send(res, 403, { error: 'Only an owner can make or revoke agent tokens.' });
  const chunks = [];
  if (req.method !== 'GET') for await (const c of req) chunks.push(c);
  const r = await access.tokensApi(new Request('http://local/api/admin/agent-tokens', { method: req.method, headers: { 'content-type': 'application/json' }, body: req.method === 'GET' ? undefined : Buffer.concat(chunks) }), op.email);
  res.writeHead(r.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(await r.text());
}
