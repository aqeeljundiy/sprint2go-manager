// AI subscriptions and closed sign-up, end to end: the server on a throwaway folder with demo data, the Claude Code
// and Codex tools replaced by a stand-in (scripts/fixtures/fake-ai-cli.mjs) and the providers' usage calls by a local
// stand-in, so no real login, token exchange or provider is ever reached.
//  1. Sign-up closed (the default on the live server): no sign-up, no new company from the app for people who aren't
//     operators, while sign-in, invites and /admin's "New company" keep working; only an owner opens it again.
//  2. /admin, AI, Subscriptions (owners only): Claude by pasting the code, ChatGPT by device code, a speech key; logins
//     sealed in the database and never sent to the browser or the logs; every change in the audit log.
//  3. A company set to the priority list runs its AI on the first account, keeps the renewed login, counts the tokens;
//     an account at its limit is skipped (auto-switch), the order can change, an archived one is never used, and a
//     company left "off" keeps its own setup.
//   node scripts/ai-accounts-tests.mjs
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

// Ports 4740-4749 are this check's (local demo data only).
const [httpPort, smtpPort, usagePort] = [4740, 4741, 4742];
const usage = { claude: 20, codex: 10, asked: [] };
const usageServer = createServer((req, res) => {
  usage.asked.push({ path: req.url, auth: req.headers.authorization ?? '' });
  res.setHeader('content-type', 'application/json');
  if (req.url === '/claude') return res.end(JSON.stringify({ five_hour: { utilization: usage.claude, resets_at: new Date(Date.now() + 3600e3).toISOString() }, seven_day: { utilization: 5, resets_at: null } }));
  if (req.url === '/codex') return res.end(JSON.stringify({ plan_type: 'pro', rate_limit: { primary_window: { used_percent: usage.codex, reset_after_seconds: 3600 }, secondary_window: { used_percent: 3, reset_at: Math.floor(Date.now() / 1000) + 86400 } } }));
  res.statusCode = 404;
  res.end('{}');
}).listen(usagePort, '127.0.0.1');

const dir = mkdtempSync(join(tmpdir(), 's2g-ai-accounts-'));
const tmp = mkdtempSync(join(tmpdir(), 's2g-ai-tmp-'));
const fake = join(ROOT, 'scripts', 'fixtures', 'fake-ai-cli.mjs');
const env = {
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot ?? '',
  NODE_ENV: 'development',
  S2G_DATA: dir,
  PORT: String(httpPort),
  HOST: '127.0.0.1',
  MAIL_PORT: String(smtpPort),
  MAIL_HOST: 'localhost',
  SEED_PASSWORD: randomBytes(12).toString('hex'),
  S2G_OPERATORS: 'thomas@rimbagroup.example',
  S2G_SIGNUPS: 'closed',
  S2G_CLAUDE_BIN: JSON.stringify([process.execPath, fake, 'claude']),
  S2G_CODEX_BIN: JSON.stringify([process.execPath, fake, 'codex']),
  S2G_AI_USAGE_TEST: JSON.stringify({ claude: `http://127.0.0.1:${usagePort}/claude`, codex: `http://127.0.0.1:${usagePort}/codex` }),
  S2G_AI_TMP: tmp,
  ANTHROPIC_API_KEY: 'sk-ant-api-SERVER-KEY-MUST-NOT-REACH-THE-TOOL',
  SUPPORT_EMAIL: 'support@s2g-check.test',
  PUBLIC_URL: '',
  RECORDER_URL: '',
};
const server = spawn(process.execPath, ['--import', './server/register.mjs', 'server/index.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (b) => (log += b));
server.stderr.on('data', (b) => (log += b));
const finish = (code) => {
  server.kill('SIGTERM');
  usageServer.close();
  for (const d of [dir, tmp])
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* the server may still hold a file for a moment */
    }
  if (code) console.log(`\nServer log:\n${log.split('\n').slice(-40).join('\n')}`);
  process.exit(code);
};
setTimeout(() => (console.log('FAIL timed out'), finish(1)), 180_000).unref();

try {
  for (let i = 0; i < 300 && !/sprint2go on http/.test(log); i++) {
    if (server.exitCode !== null) break;
    await sleep(100);
  }
  check(/sprint2go on http/.test(log), 'the server starts');
  if (!/sprint2go on http/.test(log)) finish(1);

  const db = new DatabaseSync(join(dir, 'sprint2go.db'));
  const base = `http://127.0.0.1:${httpPort}`;
  const doc = (coll, id) => JSON.parse(db.prepare('SELECT data FROM docs WHERE coll = ? AND id = ?').get(coll, id)?.data ?? 'null');
  const asJson = async (x) => ({ status: x.status, body: await x.json().catch(() => ({})), raw: '' });
  const anon = { post: (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(asJson), get: (path) => fetch(`${base}${path}`).then(asJson) };
  const signIn = async (email, password = env.SEED_PASSWORD) => {
    const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
    const call = (method, path, body) => fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    return {
      ok: r.ok && cookie.startsWith('s2g='),
      token: cookie.slice(4),
      get: (path) => call('GET', path).then(asJson),
      getText: (path) => call('GET', path).then((x) => x.text()),
      post: (path, body) => call('POST', path, body).then(asJson),
      sync: (coll, upserts) => call('POST', '/api/sync', { coll, upserts, deletes: [] }).then(asJson),
    };
  };
  const operator = async (email, role) => {
    if (role) db.prepare('INSERT INTO operators (email, role, added_by, added_at, totp_on) VALUES (?, ?, ?, ?, 1)').run(email, role, 'test', now());
    else db.prepare('UPDATE operators SET totp_on = 1 WHERE email = ?').run(email);
    const s = await signIn(email);
    db.prepare('UPDATE sessions SET op_ok = ? WHERE token = ?').run(now(), createHash('sha256').update(s.token).digest('hex'));
    return s;
  };
  const audit = () => db.prepare('SELECT action, target, detail FROM audit ORDER BY id').all();
  const owner = await operator('thomas@rimbagroup.example');
  const admin = await operator('ethan@rimbagroup.example', 'admin');
  const james = await signIn('james@demo.sprint2go.com'); // owner of the demo company "pnp", not an operator
  check(owner.ok && admin.ok && james.ok, 'the owner, an admin operator and a company owner sign in');

  /* ---------- 1. sign-up closed ---------- */
  check((await anon.get('/api/caps')).body.signups === false, 'caps: sign-up is closed');
  check((await anon.post('/api/signup', { name: 'Someone New', email: 'new@outside.example', password: 'long-enough-1' })).status === 403, 'nobody can sign up');
  check((await anon.post('/api/signup/verify', { email: 'new@outside.example', code: '123456' })).status === 403, 'nor finish a sign-up');
  const ws = (id, name) => ({ workspace: { id, name, color: '#5b5bf6', domains: [], accounts: [], members: [] }, users: [] });
  check((await james.post('/api/workspace', ws('ws-closed-1', 'Side Project'))).status === 403 && !doc('workspaces', 'ws-closed-1'), 'a signed-in person who isn’t an operator can’t start a company');
  await james.sync('workspaces', [{ id: 'ws-closed-2', name: 'Sneaky Co', members: [{ userId: 'u-james', role: 'owner' }] }]);
  check(!doc('workspaces', 'ws-closed-2'), 'not through sync either');
  check(!!doc('workspaces', 'pnp') && (await james.get('/api/caps')).status === 200, 'existing companies keep working');
  const made = await owner.post('/api/admin/company/create', { name: 'Owner Holdings', ownerEmail: 'boss@owner-holdings.example', tier: 'studio', track: 'ai', trialDays: 0 });
  check(made.status === 200 && !!doc('workspaces', made.body.id), 'the owner still makes companies from /admin');
  const token = new URL(made.body.link ?? '/?invite=', base).searchParams.get('invite');
  const accepted = await anon.post('/api/invite/accept', { token, password: 'a-good-password-1' });
  check(accepted.status === 200, 'and the invite it makes still works');
  check((await owner.post('/api/workspace', ws('ws-op-1', 'Operator Co'))).status === 200, 'an operator can still start a company in the app');
  check((await admin.post('/api/admin/settings', { signups: 'open' })).status === 403, 'an admin operator can’t open sign-up');
  check((await owner.post('/api/admin/settings', { signups: 'open' })).status === 200 && (await anon.get('/api/caps')).body.signups === true, 'the owner opens it (the switch)');
  check((await anon.post('/api/signup', { name: 'Someone New', email: 'new@outside.example', password: 'long-enough-1' })).status === 200, 'then sign-up works again');
  check((await owner.post('/api/admin/settings', { signups: 'closed' })).status === 200 && (await anon.get('/api/caps')).body.signups === false, 'and closes it again');
  check(audit().filter((a) => a.action === 'settings.signups').length === 2, 'both in the audit log');

  /* ---------- 2. AI subscriptions in /admin ---------- */
  check((await admin.get('/api/admin/ai-accounts')).status === 403, 'only an owner sees the AI subscriptions');
  check((await james.get('/api/admin/ai-accounts')).status >= 401, 'nor does anyone outside the team');
  const first = await owner.get('/api/admin/ai-accounts');
  check(first.status === 200 && first.body.tools.claude && first.body.tools.codex && first.body.accounts.length === 0, 'the page opens with the sign-in tools ready');

  const cl = await owner.post('/api/admin/ai-accounts/login', { kind: 'claude' });
  check(cl.status === 200 && /^https:\/\/claude\.ai\/oauth\/authorize/.test(cl.body.url ?? ''), 'Claude: the sign-in page to open');
  const bad = await owner.post(`/api/admin/ai-accounts/login/${cl.body.id}/code`, { code: 'wrong' });
  check(bad.body.state === 'running' && bad.body.wrongCode, 'a wrong code says so and the sign-in waits');
  const good = await owner.post(`/api/admin/ai-accounts/login/${cl.body.id}/code`, { code: 'good-code' });
  check(good.body.state === 'done' && /^acct-/.test(good.body.accountId ?? ''), 'the right code signs in');
  const claudeId = good.body.accountId;

  const cx = await owner.post('/api/admin/ai-accounts/login', { kind: 'codex' });
  check(cx.status === 200 && cx.body.code === 'WXYZ-12345' && /auth\.openai\.com/.test(cx.body.url ?? ''), 'ChatGPT: the device page and its code');
  let cxState = cx.body;
  for (let i = 0; i < 40 && cxState.state === 'running'; i++) (await sleep(200), (cxState = (await owner.get(`/api/admin/ai-accounts/login/${cx.body.id}`)).body));
  check(cxState.state === 'done' && /^acct-/.test(cxState.accountId ?? ''), 'it finishes by itself once the code is entered');
  const codexId = cxState.accountId;

  const sp = await owner.post('/api/admin/ai-accounts/key', { provider: 'deepgram', key: 'dg-STANDIN-SPEECH-KEY-1234', label: 'Meetings' });
  check(sp.status === 200, 'a speech key is added');
  const speechId = sp.body.id;
  check((await owner.post('/api/admin/ai-accounts/key', { provider: 'nope', key: 'x'.repeat(20) })).status === 400, 'an unknown provider is refused');

  let view = (await owner.get('/api/admin/ai-accounts')).body;
  const viewText = JSON.stringify(view);
  check(view.accounts.length === 3 && view.accounts.map((a) => a.id).join() === [claudeId, codexId, speechId].join(), 'three accounts, in the order they were added');
  check(view.accounts.find((a) => a.id === claudeId).email === 'owner@claude.example' && view.accounts.find((a) => a.id === codexId).email === 'owner@chatgpt.example', 'each shows its email');
  check(!/STANDIN|sk-ant/.test(viewText) && view.accounts.find((a) => a.id === speechId).last4 === '1234', 'no login or key reaches the browser (only a key’s last 4)');
  const sealed = db.prepare('SELECT sealed FROM ai_accounts').all().map((r) => r.sealed).join();
  check(sealed.length > 100 && !/STANDIN|sk-ant|owner@/.test(sealed), 'logins and keys are sealed in the database');
  check(audit().filter((a) => a.action === 'ai-account.added').length === 3 && !audit().some((a) => /STANDIN|sk-ant/.test(`${a.detail}`)), 'each one in the audit log, without secrets');

  // Usage: asked with the account's own token, shown as percentages.
  await owner.post(`/api/admin/ai-accounts/${claudeId}/refresh`, {});
  await owner.post(`/api/admin/ai-accounts/${codexId}/refresh`, {});
  view = (await owner.get('/api/admin/ai-accounts')).body;
  check(view.accounts.find((a) => a.id === claudeId).usage?.windows?.[0]?.used === 20 && view.accounts.find((a) => a.id === codexId).usage?.windows?.[0]?.used === 10, 'usage and limits per account');
  check(usage.asked.some((a) => a.auth === 'Bearer sk-ant-oat01-STANDIN-ACCESS') && usage.asked.some((a) => a.auth === 'Bearer STANDIN-CODEX-ACCESS'), 'asked with each account’s own login');

  /* ---------- 3. which account runs a company's AI ---------- */
  const ask = () => james.post('/api/ai/translate', { workspaceId: 'pnp', text: 'Halo', to: 'English' });
  const before = await ask();
  check(!/FAKE/.test(JSON.stringify(before.body)), 'a company left off keeps its own setup');
  check((await owner.post('/api/admin/ai-accounts/workspace', { workspaceId: 'pnp', ai: 'priority', speech: speechId })).status === 200, 'pnp is set to the priority list, with the speech key');
  check((await owner.post('/api/admin/ai-accounts/workspace', { workspaceId: 'pnp', ai: 'acct-doesnotexist' })).status === 400, 'an unknown account can’t be assigned');
  let r = await ask();
  check(r.status === 200 && /FAKE-CLAUDE sonnet tools=none/.test(r.body.text ?? ''), 'its AI runs on the first account (Claude, Sonnet, no tools)');
  const row = db.prepare('SELECT provider, via, in_tokens AS i FROM ai_usage ORDER BY rowid DESC LIMIT 1').get();
  check(row?.provider === 'claude-sub' && row.i === 120, 'the usage log names the subscription');
  check((await owner.get('/api/admin/ai-accounts')).body.accounts.find((a) => a.id === claudeId).calls === 1, 'and the account counts its calls');
  await owner.post(`/api/admin/ai-accounts/${claudeId}/refresh`, {});
  check(usage.asked.some((a) => a.auth === 'Bearer sk-ant-oat01-STANDIN-RENEWED'), 'the login the tool renewed is kept');
  check(!/STANDIN|SERVER-KEY/.test(log), 'no login or key in the server log');

  usage.claude = 95;
  await owner.post(`/api/admin/ai-accounts/${claudeId}/refresh`, {});
  view = (await owner.get('/api/admin/ai-accounts')).body;
  check(view.accounts.find((a) => a.id === claudeId).state === 'limit', 'Claude at 95% is at its limit');
  r = await ask();
  check(/FAKE-CODEX/.test(r.body.text ?? ''), 'auto-switch: the next account takes over');
  await owner.post('/api/admin/ai-accounts/settings', { autoSwitch: false });
  r = await ask();
  check(/FAKE-CLAUDE/.test(r.body.text ?? ''), 'with auto-switch off, the first account runs anyway');
  await owner.post('/api/admin/ai-accounts/settings', { autoSwitch: true });
  usage.claude = 20;
  await owner.post(`/api/admin/ai-accounts/${claudeId}/refresh`, {});
  await owner.post('/api/admin/ai-accounts/priority', { order: [codexId, claudeId, speechId] });
  r = await ask();
  check(/FAKE-CODEX/.test(r.body.text ?? ''), 'a new order applies at once');
  check((await owner.post('/api/admin/ai-accounts/workspace', { workspaceId: 'pnp', ai: claudeId })).status === 200 && /FAKE-CLAUDE/.test((await ask()).body.text ?? ''), 'a company can be given one account');
  await owner.post(`/api/admin/ai-accounts/${claudeId}/archive`, {});
  r = await ask();
  check(!/FAKE-CLAUDE/.test(JSON.stringify(r.body)), 'an archived account is never used (the company’s own setup runs)');
  view = (await owner.get('/api/admin/ai-accounts')).body;
  check(view.archived.some((a) => a.id === claudeId) && !!db.prepare('SELECT 1 FROM ai_accounts WHERE id = ?').get(claudeId), 'archived, not deleted');
  await owner.post(`/api/admin/ai-accounts/${claudeId}/restore`, {});
  check(/FAKE-CLAUDE/.test((await ask()).body.text ?? ''), 'restored, it runs again');
  // A limit message from the tool rests the account and the next one answers in the same request.
  await owner.post('/api/admin/ai-accounts/workspace', { workspaceId: 'pnp', ai: 'priority' });
  await owner.post('/api/admin/ai-accounts/priority', { order: [claudeId, codexId, speechId] });
  r = await james.post('/api/ai/translate', { workspaceId: 'pnp', text: 'LIMIT-PLEASE', to: 'English' });
  view = (await owner.get('/api/admin/ai-accounts')).body;
  check(/FAKE-CODEX/.test(r.body.text ?? '') && view.accounts.find((a) => a.id === claudeId).state === 'resting', 'Claude saying its limit is reached: rested, ChatGPT answers');
  const acts = new Set(audit().map((a) => a.action));
  check(['ai-account.company', 'ai-account.priority', 'ai-account.settings', 'ai-account.archived', 'ai-account.restored', 'ai-account.sign-in-started'].every((a) => acts.has(a)), 'every change is in the audit log');
  db.close();
} catch (e) {
  check(false, `unexpected: ${e instanceof Error ? e.stack : e}`);
}
console.log(failed ? `\n${failed} failed` : '\nAI subscriptions and sign-up checks passed');
finish(failed ? 1 : 0);
