#!/usr/bin/env node
// Make, list and revoke agent tokens from a terminal (for apps without a Settings page, or a locked-out owner).
//   S2G_DATA=<data folder> node --import ./server/register.mjs server/opmcp/tokens-cli.mjs list | make "<agent name>" [tool,tool] | revoke <id>
import { access } from './access.mjs';
const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'make') {
  const { token, record } = await access.tokens.create({ name: a, scopes: ['read', ...(b ? b.split(',') : [])], by: 'terminal' });
  console.log(`Token for ${record.name} (shown once, store it in the agent's app):\n${token}\nCan do: ${record.scopes.join(', ')}`);
} else if (cmd === 'revoke') console.log(await access.tokens.revoke(a, 'terminal'));
else console.table((await access.tokens.list()).map((t) => ({ id: t.id, name: t.name, scopes: t.scopes.join(' '), lastUsed: t.lastUsedAt, revoked: t.revokedAt })));
