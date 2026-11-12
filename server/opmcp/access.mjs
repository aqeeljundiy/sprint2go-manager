// sprint2go operator console: agent access (MCP). Tools + token store + audit log, shared by /admin/mcp,
// /api/admin/agent-tokens, stdio.mjs and tokens-cli.mjs. (/mcp itself is the customer app's own connector, server/connector.ts.)
// Tokens are stored as hashes next to the database in the data folder (S2G_DATA, the /app/data volume: survives deploys).
import { join } from 'node:path';
import { createAgentAccess, fileTokenStore } from './ak-mcp.mjs';
import { tools } from './tools.mjs';
import * as db from '../db.ts';

const titles = new Map(tools.map((t) => [t.name, t.title]));
const TOKEN_ACTIONS = { 'mcp.token.create': 'Made an agent token', 'mcp.token.update': 'Changed what an agent token can do', 'mcp.token.revoke': 'Revoked an agent token' };
// The record a call is about (ticket, company, person), so it also shows on that company's timeline.
const targetOf = (summary) => { try { const a = JSON.parse(summary || '{}'); return a.companyId || a.id || null; } catch { return null; } };

export const access = createAgentAccess({
  site: 'sprint2go operator console',
  tools,
  store: fileTokenStore(process.env.AK_MCP_TOKENS || join(db.dataDir, 'agent-tokens.json')),
  // One row per call in Team › Audit log, as "Agent: <token name>", next to what operators did.
  audit: async (e) => {
    if (e.action.startsWith('mcp.token.')) return void db.audit(e.who || 'terminal', e.action, null, `${TOKEN_ACTIONS[e.action]}: ${e.target}`);
    const tool = e.action.replace(/^mcp\./, '');
    db.audit(e.who, e.action, targetOf(e.target), `${titles.get(tool) || tool}${e.ok ? '' : ' (failed)'}${e.target && e.target !== '{}' ? ' ' + e.target : ''}`);
  },
  limits: { perMinute: 60, perDay: 2000 },
});
