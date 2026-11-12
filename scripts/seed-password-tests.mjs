// No shared starter password: the rules in server/seedPassword.ts, then two real first runs of the server on a
// throwaway data folder (no SEED_PASSWORD: a random password is printed and works, the published one doesn't; the
// published one as SEED_PASSWORD: the server refuses to start).
//   node --import ./server/register.mjs scripts/seed-password-tests.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dirs = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 's2g-seedpw-'));
  dirs.push(d);
  return d;
};
process.env.S2G_DATA = tmp();

let failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${e instanceof Error ? e.message.split('\n').join('\n     ') : e}`);
  }
};

const { seedPassword, sweepPublishedPasswords, PUBLISHED_SEED_PASSWORDS } = await import('../server/seedPassword.ts');
const db = await import('../server/db.ts');
const OLD = PUBLISHED_SEED_PASSWORDS[0];

await test('the published starter password is refused', () => {
  assert.throws(() => seedPassword({ SEED_PASSWORD: OLD }), /published/);
  assert.throws(() => seedPassword({ SEED_PASSWORD: ` ${OLD} `, NODE_ENV: 'production' }), /published/);
});
await test('a short SEED_PASSWORD is refused', () => assert.throws(() => seedPassword({ SEED_PASSWORD: 'short-pw' }), /too short/));
await test('your own SEED_PASSWORD is used as is', () => assert.deepEqual(seedPassword({ SEED_PASSWORD: 'my-own-long-password' }), { password: 'my-own-long-password', generated: false }));
await test('no SEED_PASSWORD on a laptop: a fresh random one each time', () => {
  const a = seedPassword({}), b = seedPassword({ NODE_ENV: 'development' });
  assert.equal(a.generated, true);
  assert.ok(a.password.length >= 16);
  assert.notEqual(a.password, b.password);
  assert.ok(!PUBLISHED_SEED_PASSWORDS.includes(a.password));
});
await test('no SEED_PASSWORD on a production server: refuses', () => assert.throws(() => seedPassword({ NODE_ENV: 'production' }), /Set SEED_PASSWORD/));

await test('sweep: only sign-ins on a published password get a new one, nothing is removed', async () => {
  const logins = [
    { user_id: 'u-old', email: 'old@demo.test', pw_hash: await db.hashPassword(OLD) },
    { user_id: 'u-own', email: 'own@demo.test', pw_hash: await db.hashPassword('changed-by-the-person') },
  ];
  const replaced = new Map();
  const ids = await sweepPublishedPasswords(logins, db.checkPassword, async (id, email, pw) => void replaced.set(id, { email, pw }));
  assert.deepEqual(ids, ['u-old']);
  assert.equal(replaced.get('u-old').email, 'old@demo.test');
  assert.ok(replaced.get('u-old').pw.length >= 24 && replaced.get('u-old').pw !== OLD);
  // And against the real table: the swept login stays, with a password nobody knows.
  await db.setLogin('u-old', 'old@demo.test', OLD);
  await sweepPublishedPasswords([db.findLogin('old@demo.test')], db.checkPassword, db.setLogin);
  const after = db.findLogin('old@demo.test');
  assert.ok(after, 'the sign-in still exists');
  assert.equal(await db.checkPassword(OLD, after.pw_hash), false);
});

/* ---------- real first runs ---------- */

const freePort = () =>
  new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
const start = async (extra) => {
  const port = await freePort();
  const env = { ...process.env, NODE_ENV: 'development', S2G_DATA: tmp(), PORT: String(port), HOST: '127.0.0.1', MAIL_PORT: String(await freePort()), MAIL_HOST: 'localhost', SES_KEY: '', SES_SECRET: '', MAIL_FROM: '', S3_BUCKET: '', CF_DNS_TOKEN: '', PUBLIC_URL: '', RECORDER_URL: '', MAIL_RELAY_URL: '', ...extra };
  if (extra.SEED_PASSWORD === undefined) delete env.SEED_PASSWORD;
  const child = spawn(process.execPath, ['--import', './server/register.mjs', 'server/index.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const exited = new Promise((res) => child.once('exit', (code) => res(code)));
  return { child, port, exited, log: () => log };
};
const waitFor = async (fn, ms = 60_000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('timed out');
};
const login = (port, password) =>
  fetch(`http://127.0.0.1:${port}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'james@demo.sprint2go.com', password }) });

await test('first run without SEED_PASSWORD: prints a random password that works; the published one does not', async () => {
  const s = await start({ SEED_PASSWORD: undefined });
  try {
    const pw = await waitFor(async () => /shown once\): (\S+)\./.exec(s.log())?.[1]);
    await waitFor(async () => (await fetch(`http://127.0.0.1:${s.port}/`)).status > 0);
    assert.equal((await login(s.port, OLD)).status, 401);
    assert.equal((await login(s.port, pw)).status, 200);
  } finally {
    s.child.kill();
  }
});
await test('first run with the published password as SEED_PASSWORD: the server refuses to start', async () => {
  const s = await start({ SEED_PASSWORD: OLD });
  const code = await Promise.race([s.exited, new Promise((r) => setTimeout(() => r('still running'), 60_000))]);
  if (code === 'still running') s.child.kill();
  assert.notEqual(code, 'still running');
  assert.notEqual(code, 0);
  assert.match(s.log(), /published/);
});

db.close?.();
for (const d of dirs) try { rmSync(d, { recursive: true, force: true, maxRetries: 5 }); } catch {} // Windows keeps the open database locked
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
