// Types for routes.mjs, so server/index.ts type-checks (tsc -p tsconfig.server.json).
import type { IncomingMessage, ServerResponse } from 'node:http';
export const MCP_PATH: string;
export function mcpRoute(req: IncomingMessage, res: ServerResponse): Promise<void>;
export function tokensRoute(req: IncomingMessage, res: ServerResponse, who: { email: string; token: string } | null): Promise<void>;
