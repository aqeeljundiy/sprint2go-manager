#!/usr/bin/env node
// sprint2go operators MCP over stdio, for MCP apps on the owner's own computer. The token decides which tools exist:
//   AK_MCP_TOKEN=akt_… S2G_DATA=<data folder> node --import ./server/register.mjs server/opmcp/stdio.mjs
import { access } from './access.mjs';
await access.stdio();
