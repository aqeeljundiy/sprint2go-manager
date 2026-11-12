// AI subscriptions: the owner's own AI accounts, shared out to the companies he picks (/admin, AI, Subscriptions).
// Three kinds: a Claude subscription (signed in through Claude Code's own sign-in), a ChatGPT subscription (Codex's
// device-code sign-in) and a plain API key for any provider the app can call. Every account sits in one priority list;
// each company is set to use the whole list, one account, or none (then its own AI setup runs, as before). An account
// that hits its limit is skipped (auto-switch), and the company's own setup always follows as the fallback.
//
// Secrets: every login and key is sealed in the database with the server's key (db.seal). A subscription's login is
// written to a private temporary folder only while its tool runs, read back (it may have been renewed) and removed.
// Nothing secret goes to the browser or into a log line; every change goes into the operator audit log.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { chmod, chown, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as db from './db.ts';
import { AIError, canCall, CLOUD, registerRunner, testKey, type AIConfig, type RunOpts } from './llm.ts';
import { PROVIDERS } from '../src/data/aiCatalog.ts';
import { mark, msg } from '../src/i18n/index.ts';

db.db.exec(`
  CREATE TABLE IF NOT EXISTS ai_accounts (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, provider TEXT NOT NULL, label TEXT NOT NULL, sealed TEXT NOT NULL,
    model TEXT, info TEXT NOT NULL DEFAULT '{}', added_by TEXT, added_at TEXT NOT NULL, archived_at TEXT
  );
  CREATE TABLE IF NOT EXISTS ai_account_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

export type Kind = 'claude' | 'codex' | 'key';
/** The provider names a subscription runs under in an AIConfig (and in the usage log). */
export const SUB_PROVIDER: Record<Exclude<Kind, 'key'>, string> = { claude: 'claude-sub', codex: 'codex-sub' };
/** Speech to text providers the meeting recorder can use (server/index.ts, STT). */
export const SPEECH = ['groq', 'deepgram', 'sumopod', 'openai'];
const KEY_PROVIDERS: string[] = PROVIDERS.filter((p) => !CLOUD.has(p.id) && (p.kind === 'speech' || canCall(p.id))).map((p) => p.id);
const TEXT_KEY = (provider: string) => provider !== 'deepgram' && canCall(provider) && !CLOUD.has(provider);

interface Info {
  email?: string;
  plan?: string;
  addedVia?: string;
  usage?: Usage | null;
  usageAt?: string | null;
  usageError?: string | null;
  usageNext?: number;
  signedOut?: boolean;
  restUntil?: number; // a limit or rate error: skipped until then
  lastUsedAt?: string | null;
  lastError?: string | null;
  lastErrorAt?: string | null;
  month?: string; // the month the counters below are for
  calls?: number;
  inTokens?: number;
  outTokens?: number;
}
export interface Usage {
  windows: { id: string; label: string; used: number; resets: string | null }[];
}
interface Row {
  id: string;
  kind: Kind;
  provider: string;
  label: string;
  sealed: string;
  model: string | null;
  info: string;
  added_by: string | null;
  added_at: string;
  archived_at: string | null;
}
export interface Settings {
  priority: string[]; // account ids, first is tried first
  autoSwitch: boolean; // skip an account at its limit
  limit: number; // percent of a usage window that counts as "at the limit"
  workspaces: Record<string, { ai?: 'off' | 'priority' | string; speech?: 'off' | string }>;
}
const DEFAULTS: Settings = { priority: [], autoSwitch: true, limit: 90, workspaces: {} };

const now = () => new Date().toISOString();
const month = () => now().slice(0, 7);
const rows = (all = false) => db.db.prepare(`SELECT * FROM ai_accounts${all ? '' : ' WHERE archived_at IS NULL'} ORDER BY added_at`).all() as unknown as Row[];
const row = (id: string) => db.db.prepare('SELECT * FROM ai_accounts WHERE id = ?').get(id) as unknown as Row | undefined;
const infoOf = (r: Row): Info => {
  try {
    return JSON.parse(r.info) as Info;
  } catch {
    return {};
  }
};
function setInfo(id: string, patch: Partial<Info>) {
  const r = row(id);
  if (!r) return;
  db.db.prepare('UPDATE ai_accounts SET info = ? WHERE id = ?').run(JSON.stringify({ ...infoOf(r), ...patch }), id);
}
/** What the account's seal holds: a key (with its base URL), or a subscription's login files by name. */
type Secret = { key?: string; baseUrl?: string; files?: Record<string, string> };
const secretOf = (r: Row): Secret => JSON.parse(db.unseal(r.sealed)) as Secret;
const sealSecret = (s: Secret) => db.seal(JSON.stringify(s));

export function settings(): Settings {
  const r = db.db.prepare("SELECT value FROM ai_account_settings WHERE key = 'settings'").get() as { value: string } | undefined;
  try {
    return { ...DEFAULTS, ...(r ? (JSON.parse(r.value) as Partial<Settings>) : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings(s: Settings) {
  db.db.prepare("INSERT INTO ai_account_settings (key, value) VALUES ('settings', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(JSON.stringify(s));
}

/* ---------- the sign-in tools (Claude Code and Codex) ---------- */

// S2G_CLAUDE_BIN / S2G_CODEX_BIN: another command (a JSON array like ["node","fake.mjs"] works too). The tests use
// stand-ins that never reach a provider.
const binOf = (kind: 'claude' | 'codex'): string[] => {
  const v = process.env[kind === 'claude' ? 'S2G_CLAUDE_BIN' : 'S2G_CODEX_BIN'];
  if (!v) return [kind];
  if (v.startsWith('[')) {
    try {
      const a = JSON.parse(v);
      if (Array.isArray(a) && a.length && a.every((x) => typeof x === 'string')) return a;
    } catch {
      /* below */
    }
  }
  return [v];
};
const toolSeen = new Map<string, { at: number; ok: boolean }>();
/** Whether this server has the tool a kind of subscription needs (checked at most every 10 minutes). */
export function toolReady(kind: 'claude' | 'codex') {
  const seen = toolSeen.get(kind);
  if (seen && Date.now() - seen.at < 10 * 60_000) return seen.ok;
  const [cmd, ...pre] = binOf(kind);
  let ok = false;
  try {
    ok = spawnSync(cmd, [...pre, '--version'], { timeout: 15_000, stdio: 'ignore', env: toolEnv(kind, '') }).status === 0;
  } catch {
    ok = false;
  }
  toolSeen.set(kind, { at: Date.now(), ok });
  return ok;
}
/**
 * The tool's environment: only what a program needs to run (never the server's own settings, keys or passwords), its
 * own folder for the login, quiet. With no API key in it, the tool has to use the login.
 */
const PASS = ['PATH', 'LANG', 'LC_ALL', 'TZ', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR', 'USE_BUILTIN_RIPGREP', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS'];
function toolEnv(kind: 'claude' | 'codex', dir: string) {
  const e: Record<string, string | undefined> = { BROWSER: 'true', NO_COLOR: '1', DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
  for (const k of PASS) if (process.env[k]) e[k] = process.env[k];
  if (dir) ((e[kind === 'claude' ? 'CLAUDE_CONFIG_DIR' : 'CODEX_HOME'] = dir), (e.HOME = dir), (e.XDG_CONFIG_HOME = dir));
  return e as NodeJS.ProcessEnv;
}
const FILES: Record<'claude' | 'codex', string[]> = { claude: ['.credentials.json', '.claude.json'], codex: ['auth.json'] };
const MAIN_FILE: Record<'claude' | 'codex', string> = { claude: '.credentials.json', codex: 'auth.json' };
const TMP = () => process.env.S2G_AI_TMP || join(tmpdir(), 's2g-ai');
/**
 * The user the tools run as. In the container the server is root; the tools run as "aitool" (made in the Dockerfile),
 * which can't read the data folder (made private below), so a prompt can never get a tool to read the database or the
 * server's key. On a laptop (not root) they run as the server does.
 */
const TOOL_USER = (() => {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) return null;
  try {
    const uid = Number(spawnSync('id', ['-u', 'aitool'], { encoding: 'utf8' }).stdout.trim());
    const gid = Number(spawnSync('id', ['-g', 'aitool'], { encoding: 'utf8' }).stdout.trim());
    return uid > 0 && gid > 0 ? { uid, gid } : null;
  } catch {
    return null;
  }
})();
if (TOOL_USER && process.env.S2G_DATA) void chmod(process.env.S2G_DATA, 0o700).catch(() => {});
const asTool = TOOL_USER ? { uid: TOOL_USER.uid, gid: TOOL_USER.gid } : {};
async function privateDir(tag: string) {
  await mkdir(TMP(), { recursive: true, mode: 0o711 });
  const dir = await mkdtemp(join(TMP(), `${tag}-`));
  await chmod(dir, 0o700).catch(() => {});
  if (TOOL_USER) await chown(dir, TOOL_USER.uid, TOOL_USER.gid).catch(() => {});
  return dir;
}
/** A login file in a tool's folder, readable only by the tool's user. */
async function putFile(path: string, text: string) {
  await writeFile(path, text, { mode: 0o600 });
  if (TOOL_USER) await chown(path, TOOL_USER.uid, TOOL_USER.gid).catch(() => {});
}
const strip = (s: string) => s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r/g, '');
/** A tool's output, without anything that looks like a token (it only ever reaches the server log as a short reason). */
const scrub = (s: string) => strip(s).replace(/(sk-ant-[\w-]+|sk-[\w-]{12,}|eyJ[\w-]+\.[\w-]+\.[\w-]+|"?(access|refresh|id)_?token"?\s*[:=]\s*"?[^\s",}]+)/gi, '[hidden]').slice(-400);

/** The login's details shown in the list: the email and plan (no secrets). */
function whoFromFiles(kind: 'claude' | 'codex', files: Record<string, string>): { email?: string; plan?: string } {
  try {
    if (kind === 'claude') {
      const creds = JSON.parse(files['.credentials.json'] ?? '{}').claudeAiOauth ?? {};
      const acc = files['.claude.json'] ? (JSON.parse(files['.claude.json']).oauthAccount ?? {}) : {};
      return { email: acc.emailAddress || undefined, plan: creds.subscriptionType || undefined };
    }
    const auth = JSON.parse(files['auth.json'] ?? '{}');
    const idTok = String(auth.tokens?.id_token ?? '');
    const payload = idTok.split('.')[1];
    const claims = payload ? JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) : {};
    const plan = claims['https://api.openai.com/auth']?.chatgpt_plan_type;
    return { email: claims.email || undefined, plan: plan || undefined };
  } catch {
    return {};
  }
}
const signedIn = (kind: 'claude' | 'codex', files: Record<string, string>) => {
  try {
    const f = JSON.parse(files[MAIN_FILE[kind]] ?? '{}');
    return kind === 'claude' ? !!(f.claudeAiOauth?.accessToken || f.claudeAiOauth?.refreshToken) : !!(f.tokens?.access_token || f.tokens?.refresh_token);
  } catch {
    return false;
  }
};

/* ---------- signing in ---------- */

interface Login {
  id: string;
  kind: 'claude' | 'codex';
  label: string;
  accountId: string | null; // reconnecting this account
  by: string;
  dir: string;
  child: ChildProcess | null;
  out: string;
  state: 'running' | 'done' | 'failed' | 'cancelled';
  url: string | null;
  code: string | null; // the device code to type in (ChatGPT)
  error: string | null;
  resultId: string | null;
  closed: Promise<void>;
}
const logins = new Map<string, Login>();
const LOGIN_MINUTES = 15;

async function startLogin(kind: 'claude' | 'codex', label: string, by: string, accountId: string | null): Promise<Login> {
  if (!toolReady(kind)) throw new AIError(kind === 'claude' ? mark('This server doesn’t have the Claude sign-in tool yet. It comes with the next deploy.') : mark('This server doesn’t have the ChatGPT sign-in tool yet. It comes with the next deploy.'), 409);
  for (const l of logins.values()) if (l.state === 'running' && (accountId ? l.accountId === accountId : false)) await cancelLogin(l.id);
  const id = 'login-' + randomBytes(6).toString('hex');
  const dir = await privateDir(id);
  const [cmd, ...pre] = binOf(kind);
  const args = kind === 'claude' ? [...pre, 'auth', 'login'] : [...pre, 'login', '--device-auth'];
  let end!: () => void;
  const l: Login = { id, kind, label, accountId, by, dir, child: null, out: '', state: 'running', url: null, code: null, error: null, resultId: null, closed: new Promise<void>((r) => (end = r)) };
  logins.set(id, l);
  const child = spawn(cmd, args, { env: toolEnv(kind, dir), cwd: dir, stdio: ['pipe', 'pipe', 'pipe'], ...asTool });
  l.child = child;
  const add = (b: Buffer) => {
    l.out = (l.out + strip(String(b))).slice(-8000);
    l.url ??= /https:\/\/\S+/.exec(l.out)?.[0]?.replace(/[).,]+$/, '') ?? null;
    if (kind === 'codex') l.code ??= /\b([A-Z0-9]{4,5}-[A-Z0-9]{4,6})\b/.exec(l.out)?.[1] ?? null;
  };
  child.stdout?.on('data', add);
  child.stderr?.on('data', add);
  child.on('error', (e) => {
    l.state = 'failed';
    l.error = e.message;
  });
  child.on('close', async (code) => {
    try {
      if (l.state === 'cancelled') return;
      if (code !== 0) {
        l.state = 'failed';
        l.error ??= scrub(l.out.split('\n').filter(Boolean).slice(-2).join(' ')) || 'The sign-in ended.';
        return;
      }
      const files: Record<string, string> = {};
      for (const f of FILES[kind]) {
        const text = await readFile(join(dir, f), 'utf8').catch(() => null);
        if (text !== null) files[f] = text;
      }
      if (!signedIn(kind, files)) {
        l.state = 'failed';
        l.error = 'The sign-in finished without a saved login.';
        return;
      }
      l.resultId = saveLogin(l, files);
      l.state = 'done';
    } catch (e) {
      l.state = 'failed';
      l.error = e instanceof Error ? e.message : String(e);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      end();
    }
  });
  setTimeout(() => {
    if (l.state === 'running') void cancelLogin(id, 'failed');
  }, LOGIN_MINUTES * 60_000).unref();
  setTimeout(() => logins.delete(id), (LOGIN_MINUTES + 30) * 60_000).unref();
  // The page to open (and the code, for ChatGPT) come in the first seconds.
  for (let i = 0; i < 60 && l.state === 'running' && !(l.url && (kind === 'claude' || l.code)); i++) await new Promise((r) => setTimeout(r, 250));
  return l;
}
function saveLogin(l: Login, files: Record<string, string>): string {
  const who = whoFromFiles(l.kind, files);
  if (l.accountId && row(l.accountId)) {
    db.db.prepare('UPDATE ai_accounts SET sealed = ? WHERE id = ?').run(sealSecret({ files }), l.accountId);
    setInfo(l.accountId, { ...who, signedOut: false, restUntil: 0, usageNext: 0, lastError: null });
    db.audit(l.by, 'ai-account.reconnected', l.accountId, `${l.kind}${who.email ? `, ${who.email}` : ''}`);
    return l.accountId;
  }
  const id = 'acct-' + randomBytes(5).toString('hex');
  // Named after the kind ("Claude", "Claude 2"…); the email shows on its own line. Rename any time.
  const base = l.kind === 'claude' ? 'Claude' : 'ChatGPT';
  const same = rows(true).filter((r) => r.kind === l.kind).length;
  const label = l.label || (same ? `${base} ${same + 1}` : base);
  db.db.prepare('INSERT INTO ai_accounts (id, kind, provider, label, sealed, model, info, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, l.kind, SUB_PROVIDER[l.kind], label.slice(0, 80), sealSecret({ files }), l.kind === 'claude' ? 'sonnet' : null, JSON.stringify({ ...who, addedVia: 'sign-in' }), l.by, now());
  const s = settings();
  saveSettings({ ...s, priority: [...s.priority.filter((x) => x !== id), id] });
  db.audit(l.by, 'ai-account.added', id, `${l.kind} subscription${who.email ? `, ${who.email}` : ''}`);
  return id;
}
async function cancelLogin(id: string, state: 'cancelled' | 'failed' = 'cancelled') {
  const l = logins.get(id);
  if (!l || l.state !== 'running') return;
  l.state = state;
  if (state === 'failed') l.error = 'The sign-in took too long. Start again.';
  l.child?.kill();
  await Promise.race([l.closed, new Promise((r) => setTimeout(r, 3000))]);
  await rm(l.dir, { recursive: true, force: true }).catch(() => {});
}
async function sendCode(id: string, code: string) {
  const l = logins.get(id);
  if (!l || l.state !== 'running') throw new AIError(mark('This sign-in isn’t running any more. Start again.'), 410);
  const c = String(code ?? '').trim();
  if (!c || c.length > 4096) throw new AIError(mark('Paste the code from the sign-in page.'), 400);
  l.child?.stdin?.write(c + '\n');
  for (let i = 0; i < 40 && l.state === 'running'; i++) await new Promise((r) => setTimeout(r, 250));
  return loginView(l);
}
const loginView = (l: Login) => ({ id: l.id, kind: l.kind, state: l.state, url: l.url, code: l.code, error: l.state === 'failed' ? l.error : null, accountId: l.resultId, wrongCode: l.state === 'running' && /invalid|incorrect|expired/i.test(l.out.split('\n').slice(-4).join(' ')) });

/* ---------- running a job on a subscription ---------- */

const locks = new Map<string, Promise<unknown>>();
/** One call at a time for an account whose login is about to be renewed (two renewals at once sign each other out). */
function exclusive<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const before = locks.get(id) ?? Promise.resolve();
  const run = before.catch(() => {}).then(fn);
  locks.set(id, run.catch(() => {}));
  return run;
}
function renewsSoon(kind: 'claude' | 'codex', files: Record<string, string>) {
  try {
    const f = JSON.parse(files[MAIN_FILE[kind]] ?? '{}');
    if (kind === 'claude') return Number(f.claudeAiOauth?.expiresAt ?? 0) - Date.now() < 15 * 60_000;
    return Date.now() - Date.parse(f.last_refresh ?? 0) > 7 * 86_400_000;
  } catch {
    return true;
  }
}

async function runSub(ai: AIConfig, prompt: string, opts: RunOpts): Promise<string> {
  const r = ai.account ? row(ai.account) : undefined;
  if (!r || r.archived_at || r.kind === 'key') throw new AIError(mark('This AI subscription isn’t there any more.'), 409);
  const kind = r.kind as 'claude' | 'codex';
  const files = secretOf(r).files ?? {};
  const go = () => runTool(r, kind, prompt, opts, ai);
  return renewsSoon(kind, files) ? exclusive(r.id, go) : go();
}

async function runTool(r0: Row, kind: 'claude' | 'codex', prompt: string, opts: RunOpts, ai: AIConfig): Promise<string> {
  const r = row(r0.id) ?? r0; // the newest login (a call before this one may have renewed it)
  const files = secretOf(r).files ?? {};
  const dir = await privateDir(r.id);
  try {
    for (const [name, text] of Object.entries(files)) await putFile(join(dir, name), text);
    const [cmd, ...pre] = binOf(kind);
    const model = ai.model && ai.model !== 'default' ? ai.model : '';
    const args =
      kind === 'claude'
        ? [...pre, '-p', '--output-format', 'json', '--max-turns', '1', '--tools', '', '--system-prompt', opts.system, ...(model ? ['--model', model] : [])]
        : [...pre, 'exec', '--skip-git-repo-check', '--sandbox', 'read-only', '-c', 'features.shell_tool=false', '-c', 'tools.web_search=false', '--color', 'never', '--json', '-o', join(dir, 'answer.txt'), ...(model ? ['-m', model] : []), '-'];
    const input = kind === 'claude' ? prompt : `${opts.system}\n\n---\n\n${prompt}`;
    const { code, out, err } = await new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
      const child = spawn(cmd, args, { env: toolEnv(kind, dir), cwd: dir, stdio: ['pipe', 'pipe', 'pipe'], ...asTool });
      let out = '';
      let err = '';
      const timer = setTimeout(() => child.kill(), 5 * 60_000);
      child.stdout.on('data', (b) => (out = (out + String(b)).slice(-2_000_000)));
      child.stderr.on('data', (b) => (err = (err + String(b)).slice(-8000)));
      child.on('error', (e) => (clearTimeout(timer), reject(new AIError(`Couldn’t start the ${kind === 'claude' ? 'Claude' : 'ChatGPT'} tool: ${e.message}`, 503))));
      child.on('close', (code) => (clearTimeout(timer), resolve({ code, out, err })));
      child.stdin.end(input);
    });
    // The tool may have renewed the login: keep the newer one.
    const after: Record<string, string> = { ...files };
    let changed = false;
    for (const f of FILES[kind]) {
      const text = await readFile(join(dir, f), 'utf8').catch(() => null);
      if (text !== null && text !== files[f]) ((after[f] = text), (changed = true));
    }
    if (changed && signedIn(kind, after)) db.db.prepare('UPDATE ai_accounts SET sealed = ? WHERE id = ?').run(sealSecret({ files: after }), r.id);

    let text = '';
    let inT = 0;
    let outT = 0;
    let failure: string | null = null;
    if (kind === 'claude') {
      const last = out.trim().split('\n').reverse().find((l) => l.trim().startsWith('{'));
      const res = last ? (JSON.parse(last) as { is_error?: boolean; subtype?: string; result?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }) : null;
      if (!res) failure = scrub(err || out) || `exit ${code}`;
      else if (res.is_error || (res.subtype && res.subtype !== 'success')) failure = scrub(String(res.result ?? res.subtype ?? 'error'));
      else {
        text = String(res.result ?? '');
        inT = (res.usage?.input_tokens ?? 0) + (res.usage?.cache_read_input_tokens ?? 0) + (res.usage?.cache_creation_input_tokens ?? 0);
        outT = res.usage?.output_tokens ?? 0;
      }
    } else {
      for (const line of out.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === 'turn.completed' && ev.usage) ((inT += Number(ev.usage.input_tokens ?? 0)), (outT += Number(ev.usage.output_tokens ?? 0)));
          if (ev.type === 'turn.failed' || ev.type === 'error') failure = scrub(String(ev.error?.message ?? ev.message ?? 'error'));
          if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) text = String(ev.item.text);
        } catch {
          /* not an event */
        }
      }
      text = (await readFile(join(dir, 'answer.txt'), 'utf8').catch(() => '')) || text;
      if (!failure && (code !== 0 || !text)) failure = scrub(err || out) || `exit ${code}`;
    }
    if (failure) throw toolError(r.id, kind, failure);
    ai.onUsage?.(inT, outT);
    return opts.schema ? text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '') : text;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
/** A tool's failure as an error the chain understands; a limit rests the account, a lost login marks it signed out. */
function toolError(id: string, kind: 'claude' | 'codex', why: string): AIError {
  const name = kind === 'claude' ? 'Claude' : 'ChatGPT';
  if (/usage limit|rate.?limit|limit reached|hit your limit|429|too many requests|quota/i.test(why)) {
    const reset = /reset[s]? (?:at|in) ([^.\n]+)/i.exec(why)?.[1];
    setInfo(id, { restUntil: Date.now() + 30 * 60_000, lastError: `Limit reached${reset ? `, resets ${reset}` : ''}`, lastErrorAt: now() });
    return new AIError(`${name} subscription is at its limit.`, 503);
  }
  if (/log ?in|sign ?in|auth|401|403|expired|invalid.*token|credential/i.test(why)) {
    setInfo(id, { signedOut: true, lastError: 'Signed out. Reconnect it.', lastErrorAt: now() });
    return new AIError(`${name} subscription is signed out.`, 503);
  }
  setInfo(id, { lastError: why.slice(0, 200), lastErrorAt: now(), restUntil: Date.now() + 2 * 60_000 });
  return new AIError(`${name} subscription failed.`, 503);
}

registerRunner('claude-sub', runSub);
registerRunner('codex-sub', runSub);

/* ---------- usage and limits, where the provider tells ---------- */

// Local testing only: S2G_AI_USAGE_TEST, JSON like {"claude":"http://127.0.0.1:9000/u","codex":"http://127.0.0.1:9000/w"}.
const USAGE_TEST: Record<string, string> = (() => {
  if (process.env.NODE_ENV === 'production' || !process.env.S2G_AI_USAGE_TEST) return {};
  try {
    const m = JSON.parse(process.env.S2G_AI_USAGE_TEST) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === 'string' && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(v as string))) as Record<string, string>;
  } catch {
    return {};
  }
})();
const USAGE_EVERY = 5 * 60_000;
const pct = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const isoOf = (v: unknown) => (typeof v === 'string' && v ? v : typeof v === 'number' && v > 0 ? new Date(v < 1e12 ? v * 1000 : v).toISOString() : null);

export async function refreshUsage(id: string, force = false) {
  const r = row(id);
  if (!r || r.archived_at || r.kind === 'key') return;
  const info = infoOf(r);
  if (!force && Date.now() < (info.usageNext ?? 0)) return;
  const files = secretOf(r).files ?? {};
  try {
    if (r.kind === 'claude') {
      const creds = JSON.parse(files['.credentials.json'] ?? '{}').claudeAiOauth ?? {};
      if (!creds.accessToken || Number(creds.expiresAt ?? 0) < Date.now()) return setInfo(id, { usageError: mark('Shown again after the next use renews the login.'), usageNext: Date.now() + USAGE_EVERY });
      const res = await fetch(USAGE_TEST.claude ?? 'https://api.anthropic.com/api/oauth/usage', { headers: { authorization: `Bearer ${creds.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20', accept: 'application/json', 'user-agent': 'claude-code/2.1.0' }, signal: AbortSignal.timeout(15_000) });
      if (res.status === 401) return setInfo(id, { usageError: mark('Shown again after the next use renews the login.'), usageNext: Date.now() + USAGE_EVERY });
      if (!res.ok) return setInfo(id, { usageError: res.status === 429 ? mark('Anthropic isn’t giving out usage right now. It asks again by itself.') : mark('Usage isn’t available right now.'), usageNext: Date.now() + (res.status === 429 ? 15 * 60_000 : USAGE_EVERY) });
      const u = (await res.json()) as Record<string, { utilization?: number; resets_at?: string } | null>;
      const win = (key: string, label: string) => (u[key] ? [{ id: key, label, used: pct(u[key]!.utilization), resets: isoOf(u[key]!.resets_at) }] : []);
      setInfo(id, { usage: { windows: [...win('five_hour', '5 hours'), ...win('seven_day', 'Week'), ...win('seven_day_opus', 'Week, Opus'), ...win('seven_day_sonnet', 'Week, Sonnet')] }, usageAt: now(), usageError: null, usageNext: Date.now() + USAGE_EVERY });
    } else {
      const auth = JSON.parse(files['auth.json'] ?? '{}');
      const token = auth.tokens?.access_token;
      if (!token) return setInfo(id, { usageError: mark('Shown after the first use.'), usageNext: Date.now() + USAGE_EVERY });
      const res = await fetch(USAGE_TEST.codex ?? 'https://chatgpt.com/backend-api/wham/usage', { headers: { authorization: `Bearer ${token}`, ...(auth.tokens?.account_id ? { 'chatgpt-account-id': String(auth.tokens.account_id) } : {}), accept: 'application/json', 'user-agent': 'codex_cli_rs' }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return setInfo(id, { usageError: res.status === 401 ? 'Shown again after the next use renews the login.' : mark('Usage isn’t available right now.'), usageNext: Date.now() + USAGE_EVERY });
      const u = (await res.json()) as { plan_type?: string; rate_limit?: Record<string, { used_percent?: number; reset_at?: number; reset_after_seconds?: number } | null> };
      const win = (key: string, label: string) => {
        const w = u.rate_limit?.[key];
        return w ? [{ id: key, label, used: pct(w.used_percent), resets: isoOf(w.reset_at) ?? (w.reset_after_seconds ? new Date(Date.now() + w.reset_after_seconds * 1000).toISOString() : null) }] : [];
      };
      setInfo(id, { usage: { windows: [...win('primary_window', '5 hours'), ...win('secondary_window', 'Week')] }, usageAt: now(), usageError: null, usageNext: Date.now() + USAGE_EVERY, ...(u.plan_type ? { plan: u.plan_type } : {}) });
    }
  } catch {
    setInfo(id, { usageError: mark('Couldn’t reach the provider for usage.'), usageNext: Date.now() + USAGE_EVERY });
  }
}
/** Every five minutes: each subscription's usage (that's what auto-switch looks at). */
export function startUsageLoop() {
  const tick = () => void Promise.all(rows().filter((r) => r.kind !== 'key').map((r) => refreshUsage(r.id).catch(() => {})));
  setTimeout(tick, 20_000).unref();
  setInterval(tick, USAGE_EVERY).unref();
}

/* ---------- which accounts run a company's AI ---------- */

const worst = (info: Info) => Math.max(0, ...(info.usage?.windows ?? []).map((w) => w.used));
type State = 'ok' | 'limit' | 'resting' | 'signed-out';
function stateOf(r: Row, s = settings()): State {
  const info = infoOf(r);
  if (info.signedOut) return 'signed-out';
  if ((info.restUntil ?? 0) > Date.now()) return 'resting';
  if (r.kind !== 'key' && worst(info) >= s.limit) return 'limit';
  return 'ok';
}
const byPriority = (s: Settings) => {
  const order = new Map(s.priority.map((id, i) => [id, i]));
  return (a: Row, b: Row) => (order.get(a.id) ?? 1e6) - (order.get(b.id) ?? 1e6) || a.added_at.localeCompare(b.added_at);
};
const textCapable = (r: Row) => r.kind !== 'key' || TEXT_KEY(r.provider);
/** The model a key account uses for a job: its own pick, else the catalogue's recommendation for that provider. */
function keyModel(r: Row, rec?: string[]) {
  if (r.model) return r.model;
  const info = PROVIDERS.find((p) => p.id === r.provider);
  return rec?.find((m) => info?.models.some((x) => x.id === m)) ?? info?.models.find((m) => m.tier === 'balanced')?.id ?? info?.models[0]?.id ?? '';
}

/**
 * The subscriptions and keys that run a job for this company, best first (an empty list: the company's own AI setup
 * runs, as before). Auto-switch leaves out an account at its limit, resting after an error, or signed out.
 */
export function chainFor(wsId: string, rec?: string[]): AIConfig[] {
  const s = settings();
  const pick = s.workspaces[wsId]?.ai;
  if (!pick || pick === 'off') return [];
  const list = rows().filter(textCapable).filter((r) => pick === 'priority' || r.id === pick).sort(byPriority(s));
  const out: AIConfig[] = [];
  for (const r of list) {
    const st = stateOf(r, s);
    if (st === 'signed-out' || (s.autoSwitch && st !== 'ok')) continue;
    const bump = (inT: number, outT: number) => {
      const i = infoOf(row(r.id) ?? r);
      const fresh = i.month === month();
      setInfo(r.id, { month: month(), calls: (fresh ? i.calls ?? 0 : 0) + 1, inTokens: (fresh ? i.inTokens ?? 0 : 0) + inT, outTokens: (fresh ? i.outTokens ?? 0 : 0) + outT, lastUsedAt: now() });
    };
    if (r.kind === 'key') {
      let sec: Secret;
      try {
        sec = secretOf(r);
      } catch {
        continue;
      }
      if (!sec.key) continue;
      out.push({ provider: r.provider, model: keyModel(r, rec), apiKey: sec.key, baseUrl: sec.baseUrl, account: r.id, onTokens: bump, onFail: (e) => keyFailed(r.id, e) });
    } else out.push({ provider: r.provider, model: r.model ?? '', apiKey: '', account: r.id, onTokens: bump, onFail: () => {} });
  }
  return out;
}
function keyFailed(id: string, e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  const status = e instanceof AIError ? e.status : 0;
  setInfo(id, { lastError: m.slice(0, 200), lastErrorAt: now(), ...(status === 503 ? { restUntil: Date.now() + 5 * 60_000 } : {}) });
}
/** The speech-to-text key assigned to this company, if any (else the company's own speech setup runs). */
export function speechFor(wsId: string): { provider: string; apiKey: string; model: string | null } | null {
  const s = settings();
  const pick = s.workspaces[wsId]?.speech;
  if (!pick || pick === 'off') return null;
  const r = row(pick);
  if (!r || r.archived_at || r.kind !== 'key' || !SPEECH.includes(r.provider) || stateOf(r, s) === 'signed-out') return null;
  try {
    const sec = secretOf(r);
    if (!sec.key) return null;
    setInfo(r.id, { lastUsedAt: now() });
    return { provider: r.provider, apiKey: sec.key, model: r.provider === 'sumopod' ? (r.model || 'gemini/gemini-3.5-flash') : null };
  } catch {
    return null;
  }
}

/* ---------- /admin: AI subscriptions (owners only) ---------- */

function publicView(r: Row, s: Settings, wsNames: Map<string, string>) {
  const info = infoOf(r);
  let last4: string | null = null;
  if (r.kind === 'key') {
    try {
      last4 = (secretOf(r).key ?? '').trim().slice(-4) || null;
    } catch {
      last4 = null;
    }
  }
  const fresh = info.month === month();
  const usedBy = Object.entries(s.workspaces)
    .filter(([, w]) => w.ai === r.id || (w.ai === 'priority' && textCapable(r)) || w.speech === r.id)
    .map(([id]) => wsNames.get(id))
    .filter(Boolean) as string[];
  return {
    id: r.id,
    kind: r.kind,
    provider: r.provider,
    label: r.label,
    model: r.model,
    email: info.email ?? null,
    plan: info.plan ?? null,
    last4,
    addedBy: r.added_by,
    addedAt: r.added_at,
    archivedAt: r.archived_at,
    state: r.archived_at ? 'archived' : stateOf(r, s),
    text: textCapable(r),
    speech: r.kind === 'key' && SPEECH.includes(r.provider),
    usage: info.usage ?? null,
    usageAt: info.usageAt ?? null,
    usageError: info.usageError ?? null,
    restUntil: info.restUntil && info.restUntil > Date.now() ? new Date(info.restUntil).toISOString() : null,
    lastUsedAt: info.lastUsedAt ?? null,
    lastError: info.lastError ?? null,
    lastErrorAt: info.lastErrorAt ?? null,
    calls: fresh ? info.calls ?? 0 : 0,
    tokens: fresh ? (info.inTokens ?? 0) + (info.outTokens ?? 0) : 0,
    usedBy,
  };
}

export interface AdminBits {
  req: IncomingMessage;
  res: ServerResponse;
  json: (res: ServerResponse, status: number, data: unknown) => void;
  body: (req: IncomingMessage) => Promise<any>;
  owner: boolean;
  email: string;
  log: (action: string, target: string | null, detail?: string) => void;
  workspaces: () => { id: string; name: string }[];
}

export async function handleAdmin(sub: string, x: AdminBits): Promise<boolean> {
  const { req, res, json, body, log } = x;
  const done = (data: unknown, status = 200) => (json(res, status, data), true);
  if (!x.owner) return done({ error: mark('Only an owner can see and change the AI subscriptions.') }, 403);
  const GET = req.method === 'GET';
  const POST = req.method === 'POST';
  const view = () => {
    const s = settings();
    const ws = x.workspaces();
    const names = new Map(ws.map((w) => [w.id, w.name]));
    const all = rows(true).sort(byPriority(s));
    return {
      accounts: all.filter((r) => !r.archived_at).map((r) => publicView(r, s, names)),
      archived: all.filter((r) => r.archived_at).map((r) => publicView(r, s, names)),
      settings: { autoSwitch: s.autoSwitch, limit: s.limit },
      workspaces: ws.map((w) => ({ id: w.id, name: w.name, ai: s.workspaces[w.id]?.ai ?? 'off', speech: s.workspaces[w.id]?.speech ?? 'off' })),
      tools: { claude: toolReady('claude'), codex: toolReady('codex') },
      keyProviders: KEY_PROVIDERS.map((id) => {
        const p = PROVIDERS.find((q) => q.id === id)!;
        return { id, name: p.name, speech: SPEECH.includes(id), text: TEXT_KEY(id), models: p.models.map((m) => ({ id: m.id, name: m.name })) };
      }),
    };
  };
  try {
    if (sub === 'ai-accounts' && GET) return done(view());

    if (sub === 'ai-accounts/login' && POST) {
      const b = await body(req);
      const kind = b.kind === 'codex' ? 'codex' : b.kind === 'claude' ? 'claude' : null;
      if (!kind) return done({ error: mark('Pick Claude or ChatGPT.') }, 400);
      const reconnect = typeof b.accountId === 'string' ? row(b.accountId) : undefined;
      if (b.accountId && (!reconnect || reconnect.kind !== kind)) return done({ error: mark('That account isn’t there any more.') }, 404);
      const l = await startLogin(kind, String(b.label ?? '').trim().slice(0, 80), x.email, reconnect?.id ?? null);
      log('ai-account.sign-in-started', reconnect?.id ?? null, kind);
      return done(loginView(l));
    }
    let m = /^ai-accounts\/login\/(login-[a-f0-9]+)(?:\/(code|cancel))?$/.exec(sub);
    if (m) {
      const l = logins.get(m[1]);
      if (!l) return done({ id: m[1], state: 'failed', error: 'This sign-in isn’t running any more. Start again.' });
      if (!m[2] && GET) return done(loginView(l));
      if (m[2] === 'code' && POST) return done(await sendCode(l.id, String((await body(req)).code ?? '')));
      if (m[2] === 'cancel' && POST) {
        await cancelLogin(l.id);
        log('ai-account.sign-in-cancelled', l.accountId, l.kind);
        return done({ ok: true });
      }
    }

    if (sub === 'ai-accounts/key' && POST) {
      const b = await body(req);
      const provider = String(b.provider ?? '');
      const key = String(b.key ?? '').trim();
      const baseUrl = typeof b.baseUrl === 'string' && b.baseUrl.trim() ? b.baseUrl.trim() : undefined;
      if (!KEY_PROVIDERS.includes(provider)) return done({ error: mark('Pick a provider.') }, 400);
      if (key.length < 8 || key.length > 4000) return done({ error: mark('Paste the whole key.') }, 400);
      if (provider === 'custom' && !(baseUrl && /^https:\/\//.test(baseUrl))) return done({ error: mark('A custom provider needs its https address.') }, 400);
      const model = typeof b.model === 'string' && b.model.trim() ? b.model.trim().slice(0, 120) : null;
      // A text key is tried with a tiny request first; a speech key is saved as it is.
      if (TEXT_KEY(provider) && !b.skipTest) {
        const probe = model ?? keyModel({ provider, model: null } as Row);
        try {
          await testKey({ provider, model: probe, apiKey: key, baseUrl });
        } catch (e) {
          return done({ error: msg('The key didn’t work: {why}', { why: e instanceof Error ? e.message : String(e) }) }, 400);
        }
      }
      const id = 'acct-' + randomBytes(5).toString('hex');
      const name = PROVIDERS.find((p) => p.id === provider)?.name ?? provider;
      const label = String(b.label ?? '').trim().slice(0, 80) || `${name} key`;
      db.db.prepare('INSERT INTO ai_accounts (id, kind, provider, label, sealed, model, info, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, 'key', provider, label, sealSecret({ key, baseUrl }), model, JSON.stringify({ addedVia: 'key' }), x.email, now());
      const s = settings();
      saveSettings({ ...s, priority: [...s.priority, id] });
      log('ai-account.added', id, `${provider} key ending ${key.slice(-4)}`);
      return done({ id, ...view() });
    }

    if (sub === 'ai-accounts/priority' && POST) {
      const order = ((await body(req)).order ?? []) as unknown[];
      const known = new Set(rows(true).map((r) => r.id));
      const next = order.filter((id): id is string => typeof id === 'string' && known.has(id));
      const s = settings();
      saveSettings({ ...s, priority: [...new Set([...next, ...s.priority.filter((id) => known.has(id))])] });
      log('ai-account.priority', null, next.join(' > '));
      return done(view());
    }
    if (sub === 'ai-accounts/settings' && POST) {
      const b = await body(req);
      const s = settings();
      const next = { ...s, autoSwitch: typeof b.autoSwitch === 'boolean' ? b.autoSwitch : s.autoSwitch, limit: [70, 80, 90, 95, 100].includes(Number(b.limit)) ? Number(b.limit) : s.limit };
      saveSettings(next);
      log('ai-account.settings', null, `auto-switch ${next.autoSwitch ? 'on' : 'off'}, limit ${next.limit}%`);
      return done(view());
    }
    if (sub === 'ai-accounts/workspace' && POST) {
      const b = await body(req);
      const wsId = String(b.workspaceId ?? '');
      if (!x.workspaces().some((w) => w.id === wsId)) return done({ error: mark('That company isn’t there any more.') }, 404);
      const s = settings();
      const cur = s.workspaces[wsId] ?? {};
      const live = rows();
      const ai = b.ai === undefined ? cur.ai : b.ai === 'off' || b.ai === 'priority' ? b.ai : live.some((r) => r.id === b.ai && textCapable(r)) ? String(b.ai) : null;
      const speech = b.speech === undefined ? cur.speech : b.speech === 'off' ? 'off' : live.some((r) => r.id === b.speech && r.kind === 'key' && SPEECH.includes(r.provider)) ? String(b.speech) : null;
      if (ai === null || speech === null) return done({ error: mark('Pick one of the accounts in the list.') }, 400);
      saveSettings({ ...s, workspaces: { ...s.workspaces, [wsId]: { ai: ai ?? 'off', speech: speech ?? 'off' } } });
      log('ai-account.company', wsId, `AI: ${ai ?? 'off'}, speech: ${speech ?? 'off'}`);
      return done(view());
    }

    m = /^ai-accounts\/(acct-[a-f0-9]+)\/(update|archive|restore|refresh|test)$/.exec(sub);
    if (m && POST) {
      const r = row(m[1]);
      if (!r) return done({ error: mark('That account isn’t there any more.') }, 404);
      const b = await body(req);
      if (m[2] === 'update') {
        const label = typeof b.label === 'string' && b.label.trim() ? b.label.trim().slice(0, 80) : r.label;
        const model = typeof b.model === 'string' ? b.model.trim().slice(0, 120) || null : r.model;
        db.db.prepare('UPDATE ai_accounts SET label = ?, model = ? WHERE id = ?').run(label, model, r.id);
        log('ai-account.changed', r.id, `name ${label}, model ${model ?? 'default'}`);
      } else if (m[2] === 'archive') {
        // Archived, never deleted: its login stays sealed, it just stops being used. Restore brings it back.
        db.db.prepare('UPDATE ai_accounts SET archived_at = ? WHERE id = ?').run(now(), r.id);
        log('ai-account.archived', r.id, r.label);
      } else if (m[2] === 'restore') {
        db.db.prepare('UPDATE ai_accounts SET archived_at = NULL WHERE id = ?').run(r.id);
        log('ai-account.restored', r.id, r.label);
      } else if (m[2] === 'refresh') {
        setInfo(r.id, { restUntil: 0, signedOut: false });
        await refreshUsage(r.id, true);
      } else {
        const cfg: AIConfig = r.kind === 'key' ? { provider: r.provider, model: keyModel(r), apiKey: secretOf(r).key ?? '', baseUrl: secretOf(r).baseUrl, account: r.id } : { provider: r.provider, model: r.model ?? '', apiKey: '', account: r.id };
        if (r.kind === 'key' && !TEXT_KEY(r.provider)) return done({ error: mark('Speech keys are tried in the first meeting that uses them.') }, 400);
        try {
          await testKey(cfg);
          setInfo(r.id, { lastError: null, signedOut: false, restUntil: 0 });
          log('ai-account.tested', r.id, 'ok');
        } catch (e) {
          log('ai-account.tested', r.id, 'failed');
          return done({ error: msg('The test didn’t work: {why}', { why: e instanceof Error ? e.message : String(e) }), ...view() }, 400);
        }
      }
      return done(view());
    }
  } catch (e) {
    const status = e instanceof AIError ? e.status : 500;
    console.error('[ai accounts]', sub, e instanceof Error ? scrub(e.message) : 'error');
    return done({ error: e instanceof AIError ? e.message : mark('Something went wrong.') }, status);
  }
  return false;
}
