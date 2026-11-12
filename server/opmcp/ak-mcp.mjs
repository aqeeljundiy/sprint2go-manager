// aqeel-admin-kit: agent access (MCP). Lets an AI agent (any model, any MCP client) do a backend's jobs
// through tools, with a token the owner creates, scopes and revokes in the backend's Settings.
// Copied into a site by scripts/make-mcp.mjs. Never edit it inside a site: change it in the kit and re-run.
// See references/mcp.md for the why of every rule here.
//
//   import { createAgentAccess, fileTokenStore, z } from './ak-mcp.mjs';
//   const access = createAgentAccess({ site: 'Elkiya Group', tools, store: fileTokenStore('data/agent-tokens.json'), audit });
//   /mcp route:            return access.handle(request)          (Web Request -> Response: Astro, Next, Hono, Bun)
//                          access.node(req, res)                  (Node http / Express)
//   local apps:            await access.stdio()                   (token from the AK_MCP_TOKEN environment value)
//   Settings page API:     return access.tokensApi(request, who)  (only after the site checked the owner's session)
//
// Peer dependencies in the site: @modelcontextprotocol/sdk (official TypeScript SDK) and zod.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

export { z };
export const AK_MCP_VERSION = '0.25.0';

const TOKEN_RE = /^akt_([a-f0-9]{12})_([A-Za-z0-9_-]{32})$/;
const KINDS = ['read', 'write', 'send'];
const LOOKS_DESTRUCTIVE = /(^|_)(delete|destroy|purge|drop|wipe|erase|truncate)(_|$)/;
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const now = () => new Date().toISOString();
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const rpcError = (status, code, message, headers) => json(status, { jsonrpc: '2.0', error: { code, message }, id: null }, headers);

/** Token store kept in one JSON file (hashes only). Any other store has the same two methods. */
export function fileTokenStore(file) {
  return {
    async load() { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return []; } },
    async save(list) {
      mkdirSync(dirname(file), { recursive: true });
      const tmp = file + '.tmp';
      writeFileSync(tmp, JSON.stringify(list, null, 2) + '\n', { mode: 0o600 });
      renameSync(tmp, file);
    },
  };
}

/** Checks a tool list against the kit's rules; throws on the first broken one (check.mjs catches the same in code). */
function validate(tools) {
  const seen = new Set();
  for (const t of tools) {
    if (!t || !/^[a-z][a-z0-9_]{1,63}$/.test(t.name || '')) throw new Error(`ak-mcp: tool name "${t?.name}" must be snake_case`);
    if (seen.has(t.name)) throw new Error(`ak-mcp: tool "${t.name}" is listed twice`);
    seen.add(t.name);
    if (!KINDS.includes(t.kind)) throw new Error(`ak-mcp: tool "${t.name}" needs kind: 'read' | 'write' | 'send'`);
    if (typeof t.run !== 'function') throw new Error(`ak-mcp: tool "${t.name}" has no run()`);
    if (!t.description) throw new Error(`ak-mcp: tool "${t.name}" needs a description (the agent reads it to choose the tool)`);
    if (t.kind !== 'read' && t.optIn !== true) throw new Error(`ak-mcp: ${t.kind} tool "${t.name}" needs optIn: true (off until the owner turns it on for a token)`);
    if (t.kind !== 'read' && !t.undo) throw new Error(`ak-mcp: ${t.kind} tool "${t.name}" needs undo: how the owner reverses it`);
    if (LOOKS_DESTRUCTIVE.test(t.name)) throw new Error(`ak-mcp: tool "${t.name}" deletes. Agents archive or hide with a restore, never delete (no-delete rule).`);
  }
}

/**
 * @param {object} o
 * @param {string} o.site                       name shown to agents ("Elkiya Group admin")
 * @param {Array}  o.tools                      [{ name, title, kind, optIn, description, input, undo, run(args, ctx) }]
 * @param {{load():Promise<any[]>, save(list:any[]):Promise<void>}} o.store
 * @param {(e:{who:string, agentId:string, action:string, target:string, ok:boolean, ms:number}) => any} o.audit
 *        writes one row into the backend's own activity log; called for every tool call and token change
 * @param {{perMinute?:number, perDay?:number, badAuthPer15m?:number}} [o.limits]
 */
export function createAgentAccess({ site, tools, store, audit, limits = {} }) {
  if (!site || !Array.isArray(tools) || !store || typeof audit !== 'function') throw new Error('ak-mcp: createAgentAccess needs site, tools, store and audit');
  validate(tools);
  const perMinute = limits.perMinute ?? 60, perDay = limits.perDay ?? 2000, badAuth = limits.badAuthPer15m ?? 20;
  const byName = new Map(tools.map((t) => [t.name, t]));
  const writeNames = tools.filter((t) => t.kind !== 'read').map((t) => t.name);
  const log = async (e) => { try { await audit(e); } catch (err) { console.error('[ak-mcp] audit failed', err); } };

  // ---- tokens ----
  let cache = null;
  const load = async () => (cache ??= await store.load());
  const persist = async (list) => { cache = list; await store.save(list); };
  const safe = (t) => ({ id: t.id, name: t.name, scopes: t.scopes, hint: `akt_${t.id}_…`, createdAt: t.createdAt, createdBy: t.createdBy, lastUsedAt: t.lastUsedAt || null, uses: t.uses || 0, revokedAt: t.revokedAt || null, revokedBy: t.revokedBy || null });
  const cleanScopes = (scopes) => [...new Set((Array.isArray(scopes) ? scopes : ['read']).filter((s) => s === 'read' || writeNames.includes(s)))];

  async function verify(raw) {
    const m = TOKEN_RE.exec(raw || '');
    if (!m) return null;
    const t = (await load()).find((x) => x.id === m[1]);
    if (!t || t.revokedAt) return null;
    const a = Buffer.from(sha(m[2]), 'hex'), b = Buffer.from(t.hash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b) ? t : null;
  }
  const lastWrite = new Map();
  async function touch(t, from) {
    t.uses = (t.uses || 0) + 1;
    t.lastUsedAt = now();
    if (from) t.lastUsedFrom = from.slice(0, 64);
    // A busy agent must not rewrite the file on every call: at most once a minute per token.
    if (Date.now() - (lastWrite.get(t.id) || 0) > 60e3) { lastWrite.set(t.id, Date.now()); await persist(cache); }
  }

  // ---- rate limits (in memory, per process) ----
  const hits = new Map(), fails = new Map();
  function limited(id) {
    const n = Date.now(), h = hits.get(id) || { m: n, mc: 0, d: n, dc: 0 };
    if (n - h.m > 60e3) { h.m = n; h.mc = 0; }
    if (n - h.d > 864e5) { h.d = n; h.dc = 0; }
    hits.set(id, h);
    if (h.mc >= perMinute) return Math.ceil((h.m + 60e3 - n) / 1000);
    if (h.dc >= perDay) return Math.ceil((h.d + 864e5 - n) / 1000);
    h.mc++; h.dc++;
    return 0;
  }
  const failedTooOften = (ip) => { const f = fails.get(ip); if (!f) return false; if (Date.now() > f.until) { fails.delete(ip); return false; } return f.n >= badAuth; };
  const failed = (ip) => { const f = fails.get(ip); if (!f || Date.now() > f.until) fails.set(ip, { n: 1, until: Date.now() + 15 * 60e3 }); else f.n++; };

  // ---- the MCP server for one token: only the tools that token may use are listed ----
  function serverFor(token) {
    const server = new McpServer({ name: `${site} admin`, version: AK_MCP_VERSION }, { instructions: `Tools for the ${site} backend. Read tools are safe. Write tools change real data and are logged; each says how the owner undoes it.` });
    const allowed = tools.filter((t) => (t.kind === 'read' ? token.scopes.includes('read') : token.scopes.includes(t.name)));
    for (const t of allowed) {
      server.registerTool(t.name, {
        title: t.title || t.name,
        description: t.kind === 'read' ? t.description : `${t.description}\nChanges real data. Undo: ${t.undo}`,
        inputSchema: t.input || {},
        annotations: { readOnlyHint: t.kind === 'read', destructiveHint: false, idempotentHint: t.kind === 'read', openWorldHint: t.kind === 'send' },
      }, async (args) => {
        const started = Date.now();
        const ctx = { agent: { id: token.id, name: token.name }, who: `Agent: ${token.name}`, kind: t.kind };
        let ok = true, result;
        try { result = await t.run(args || {}, ctx); }
        catch (err) { ok = false; result = { error: String(err?.message || err) }; }
        await log({ who: ctx.who, agentId: token.id, action: `mcp.${t.name}`, target: summarise(args), ok, ms: Date.now() - started });
        const text = typeof result === 'string' ? result : JSON.stringify(result ?? null, null, 2);
        return { content: [{ type: 'text', text: text.length > 200000 ? text.slice(0, 200000) + '\n… (cut: ask for fewer rows)' : text }], isError: !ok };
      });
    }
    return server;
  }

  /** The /mcp endpoint: Streamable HTTP, stateless, JSON responses. Web Request in, Response out. */
  async function handle(request) {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((k) => /token|key|secret|auth|bearer|password/i.test(k)))
      return rpcError(400, -32600, 'Never put a token in the address. Send it as the header  Authorization: Bearer <token>');
    const ip = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'local').split(',')[0].trim();
    if (failedTooOften(ip)) return rpcError(429, -32000, 'Too many failed attempts. Wait 15 minutes.', { 'retry-after': '900' });
    const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '');
    const token = m ? await verify(m[1]) : null;
    if (!token) {
      failed(ip);
      return rpcError(401, -32001, `Signed out. Ask the owner of ${site} for an agent token (Settings › Agent access) and send it as  Authorization: Bearer <token>`, { 'www-authenticate': `Bearer realm="${site} agent access"` });
    }
    if (request.method !== 'POST') return rpcError(405, -32000, 'This server is stateless: send JSON-RPC with POST.', { allow: 'POST' });
    const wait = limited(token.id);
    if (wait) return rpcError(429, -32000, `Rate limit: ${perMinute} calls a minute, ${perDay} a day. Try again in ${wait} s.`, { 'retry-after': String(wait) });
    await touch(token, ip);
    const server = serverFor(token);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try { return await transport.handleRequest(request); }
    finally { transport.close().catch(() => {}); server.close().catch(() => {}); }
  }

  /** Node http / Express adapter. Works with or without express.json() in front. */
  async function node(req, res) {
    let body;
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (req.body !== undefined && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) body = JSON.stringify(req.body);
      else if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) body = req.body;
      else { const chunks = []; for await (const c of req) chunks.push(c); body = Buffer.concat(chunks); }
    }
    const proto = String(req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http')).split(',')[0].trim();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
    const r = await handle(new Request(new URL(req.originalUrl || req.url, `${proto}://${req.headers.host || 'localhost'}`), { method: req.method, headers, body }));
    res.statusCode = r.status;
    r.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await r.arrayBuffer()));
  }

  /** stdio for apps that only run on the owner's computer. The token still decides which tools exist. */
  async function stdio({ token = process.env.AK_MCP_TOKEN } = {}) {
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    const t = await verify(token);
    if (!t) { console.error(`[ak-mcp] Signed out: set AK_MCP_TOKEN to a token from ${site} Settings › Agent access.`); process.exit(1); }
    const server = serverFor(t);
    await touch(t, 'stdio');
    await server.connect(new StdioServerTransport());
    return server;
  }

  // ---- token management for the Settings › Agent access page ----
  const catalog = () => tools.map((t) => ({ name: t.name, title: t.title || t.name, kind: t.kind, description: t.description, undo: t.undo || null }));
  async function create({ name, scopes, by }) {
    name = String(name || '').trim().slice(0, 60);
    if (!name) throw new Error('Give the token a name, for example the agent that will use it.');
    const id = randomBytes(6).toString('hex'), secret = randomBytes(24).toString('base64url');
    const rec = { id, name, scopes: cleanScopes(scopes), hash: sha(secret), createdAt: now(), createdBy: by || '', lastUsedAt: null, uses: 0, revokedAt: null };
    await persist([...(await load()), rec]);
    await log({ who: by || '', agentId: id, action: 'mcp.token.create', target: `${name} (${rec.scopes.join(', ')})`, ok: true, ms: 0 });
    return { token: `akt_${id}_${secret}`, record: safe(rec) };
  }
  async function update(id, patch, by) {
    const list = await load(), t = list.find((x) => x.id === id);
    if (!t) throw new Error('No such token.');
    if (t.revokedAt) throw new Error('This token is revoked. Make a new one instead.');
    if (patch.name !== undefined) t.name = String(patch.name).trim().slice(0, 60) || t.name;
    if (patch.scopes !== undefined) t.scopes = cleanScopes(patch.scopes);
    await persist(list);
    await log({ who: by || '', agentId: id, action: 'mcp.token.update', target: `${t.name} (${t.scopes.join(', ')})`, ok: true, ms: 0 });
    return safe(t);
  }
  // Revoked tokens stay in the list (who, when) and never work again: a leaked token must not come back.
  async function revoke(id, by) {
    const list = await load(), t = list.find((x) => x.id === id);
    if (!t) throw new Error('No such token.');
    if (!t.revokedAt) { t.revokedAt = now(); t.revokedBy = by || ''; await persist(list); }
    await log({ who: by || '', agentId: id, action: 'mcp.token.revoke', target: t.name, ok: true, ms: 0 });
    return safe(t);
  }
  const list = async () => (await load()).map(safe).reverse();

  /** JSON API for the Settings page. Call it only after the site has checked an owner/admin session. */
  async function tokensApi(request, who) {
    try {
      if (request.method === 'GET') return json(200, { tools: catalog(), tokens: await list(), limits: { perMinute, perDay } });
      const body = await request.json().catch(() => ({}));
      if (request.method === 'POST' && body.action === 'revoke') return json(200, { token: await revoke(body.id, who) });
      if (request.method === 'POST') return json(201, await create({ name: body.name, scopes: body.scopes, by: who }));
      if (request.method === 'PATCH') return json(200, { token: await update(body.id, body, who) });
      return json(405, { error: 'Method not allowed' }, { allow: 'GET, POST, PATCH' });
    } catch (e) { return json(400, { error: String(e?.message || e) }); }
  }

  return { handle, node, stdio, tokensApi, tokens: { list, create, update, revoke, verify }, catalog };
}

function summarise(args) {
  try { const s = JSON.stringify(args ?? {}); return s.length > 200 ? s.slice(0, 197) + '…' : s; } catch { return ''; }
}
