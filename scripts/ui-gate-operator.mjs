// ui-gate's sign-in for /admin and /admin/v2 (ui-gate.json "storageState"). LOCAL DEMO DATA ONLY.
// Start a throwaway server first (NODE_ENV=development, S2G_DATA=<empty dir>, PORT=4342,
// SEED_PASSWORD=<pw>, S2G_OPERATORS=james@demo.sprint2go.com), then:
//   UI_GATE_PW=<pw> node scripts/ui-gate-operator.mjs <that S2G_DATA dir> .ui-gate/auth.json
// It signs in the demo owner, marks the console's two-step sign-in as passed in that throwaway database, and writes
// the session cookie for Playwright. Never point it at a real data folder.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
const [, , dataDir, out] = process.argv;
if (!dataDir || !out || !process.env.UI_GATE_PW) throw new Error('Usage: UI_GATE_PW=<seed password> node scripts/ui-gate-operator.mjs <S2G_DATA dir> .ui-gate/auth.json');
if (/\/data\/?$/.test(dataDir)) throw new Error('That looks like a real data folder. Use a throwaway one.');
const r = await fetch('http://127.0.0.1:4342/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'james@demo.sprint2go.com', password: process.env.UI_GATE_PW }) });
const set = r.headers.get('set-cookie') || '';
const token = /s2g=([^;]+)/.exec(set)?.[1];
if (!token) throw new Error('no session: ' + r.status + ' ' + (await r.text()));
const db = new DatabaseSync(dataDir + '/sprint2go.db');
db.prepare("UPDATE operators SET totp_on = 1, totp = 'JBSWY3DPEHPK3PXP' WHERE email = 'james@demo.sprint2go.com'").run();
db.prepare('UPDATE sessions SET op_ok = ? WHERE token = ?').run(new Date().toISOString(), createHash('sha256').update(token).digest('hex'));
mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
writeFileSync(out, JSON.stringify({ cookies: [{ name: 's2g', value: token, domain: '127.0.0.1', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }], origins: [] }));
const me = await fetch('http://127.0.0.1:4342/api/admin/me', { headers: { cookie: 's2g=' + token } }).then((x) => x.json());
console.log('operator:', me.email, me.role, 'verified', me.verified);
