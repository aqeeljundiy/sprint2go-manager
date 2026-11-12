// A stand-in for the Claude Code and Codex command-line tools (scripts/ai-accounts-tests.mjs). It never reaches a
// provider: "signing in" writes a made-up login into the folder it's given, and a "call" answers from that login.
//   node fake-ai-cli.mjs claude …   or   node fake-ai-cli.mjs codex …
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [tool, ...args] = process.argv.slice(2);
const stdin = () => new Promise((res) => {
  let s = '';
  process.stdin.on('data', (b) => (s += b));
  process.stdin.on('end', () => res(s));
});
const jwt = (claims) => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');

if (args[0] === '--version') {
  console.log(`${tool} 0.0.0 (stand-in)`);
  process.exit(0);
}

if (tool === 'claude') {
  const dir = process.env.CLAUDE_CONFIG_DIR;
  if (!dir) (console.error('no CLAUDE_CONFIG_DIR'), process.exit(2));
  if (args[0] === 'auth' && args[1] === 'login') {
    console.log('Browser didn’t open? Use the url below to sign in:\n\nhttps://claude.ai/oauth/authorize?code=true&client_id=stand-in\n\nPaste code here if prompted >');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (line) => {
      const code = String(line).trim();
      if (code !== 'good-code') return void console.log('OAuth error: Invalid code. Try again.');
      writeFileSync(join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'sk-ant-oat01-STANDIN-ACCESS', refreshToken: 'sk-ant-ort01-STANDIN-REFRESH', expiresAt: Date.now() + 8 * 3600e3, scopes: ['user:inference'], subscriptionType: 'max' } }));
      writeFileSync(join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'owner@claude.example', organizationName: 'Owner' } }));
      console.log('Login successful.');
      process.exit(0);
    });
  } else if (args.includes('-p')) {
    const prompt = await stdin();
    const credsFile = join(dir, '.credentials.json');
    if (!existsSync(credsFile) || process.env.ANTHROPIC_API_KEY) (console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · Please run /login' })), process.exit(1));
    const creds = JSON.parse(readFileSync(credsFile, 'utf8'));
    if (/LIMIT-PLEASE/.test(prompt)) (console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Claude AI usage limit reached. Your limit resets at 5pm.' })), process.exit(1));
    // A call renews the login now and then: the server must keep the newer one.
    creds.claudeAiOauth.accessToken = 'sk-ant-oat01-STANDIN-RENEWED';
    writeFileSync(credsFile, JSON.stringify(creds));
    const system = args[args.indexOf('--system-prompt') + 1] ?? '';
    const model = args.includes('--model') ? args[args.indexOf('--model') + 1] : 'default';
    const tools = args.includes('--tools') ? args[args.indexOf('--tools') + 1] : 'all';
    const answer = /JSON Schema/.test(system) ? JSON.stringify({ text: `FAKE-CLAUDE ${model} tools=${tools || 'none'}`, from: 'English' }) : `FAKE-CLAUDE ${model}`;
    console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: answer, usage: { input_tokens: 120, output_tokens: 30 } }));
  } else (console.error('unknown'), process.exit(2));
} else if (tool === 'codex') {
  const dir = process.env.CODEX_HOME;
  if (!dir) (console.error('no CODEX_HOME'), process.exit(2));
  if (args[0] === 'login' && args.includes('--device-auth')) {
    console.log('Follow these steps to sign in with ChatGPT using device code authorization:\n\n1. Open this link in your browser and sign in to your account\n   https://auth.openai.com/codex/device\n\n2. Enter this one-time code (expires in 15 minutes)\n   WXYZ-12345\n');
    setTimeout(() => {
      writeFileSync(join(dir, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: null, tokens: { id_token: jwt({ email: 'owner@chatgpt.example', 'https://api.openai.com/auth': { chatgpt_plan_type: 'pro' } }), access_token: 'STANDIN-CODEX-ACCESS', refresh_token: 'STANDIN-CODEX-REFRESH', account_id: 'acc-standin' }, last_refresh: new Date().toISOString() }));
      console.log('Successfully logged in');
      process.exit(0);
    }, 1500);
  } else if (args[0] === 'exec') {
    const prompt = await stdin();
    if (!existsSync(join(dir, 'auth.json')) || process.env.OPENAI_API_KEY) (console.log(JSON.stringify({ type: 'turn.failed', error: { message: 'Not logged in' } })), process.exit(1));
    const out = args[args.indexOf('-o') + 1];
    const model = args.includes('-m') ? args[args.indexOf('-m') + 1] : 'default';
    const answer = /JSON Schema/.test(prompt) ? JSON.stringify({ text: `FAKE-CODEX ${model}`, from: 'English' }) : `FAKE-CODEX ${model}`;
    writeFileSync(out, answer);
    console.log(JSON.stringify({ type: 'thread.started', thread_id: 't' }));
    console.log(JSON.stringify({ type: 'item.completed', item: { id: 'i', type: 'agent_message', text: answer } }));
    console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 200, cached_input_tokens: 0, output_tokens: 40 } }));
  } else (console.error('unknown'), process.exit(2));
} else (console.error('which tool?'), process.exit(2));
