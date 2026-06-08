#!/usr/bin/env node

/**
 * Host-Subdomain MCP Server — stdio proxy for hosting GitHub repos at swayat.com subdomains.
 *
 * Single tool: host_subdomain(repo, sub) — clones a GitHub repo, builds it in a
 * sandbox, and deploys at <sub>.swayat.com. The user who first claims a sub becomes
 * the owner; only the owner can re-deploy to that sub.
 *
 * Reads CHAT_ID and BOT_API_URL from env; proxies to the bot's /host-subdomain
 * endpoint which enforces ownership, runs the build sandbox, and calls the
 * deploy-subdomain skill.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const CHAT_ID = process.env.CHAT_ID;
const BOT_API_URL = process.env.BOT_API_URL;

if (!CHAT_ID || !BOT_API_URL) {
  process.stderr.write('ERROR: CHAT_ID and BOT_API_URL env vars are required\n');
  process.exit(1);
}

async function apiCall(endpoint, params) {
  const url = `${BOT_API_URL}${endpoint}`;
  const body = JSON.stringify({ chatId: CHAT_ID, ...params });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bot-auth': process.env.INTERNAL_API_TOKEN || '', 'x-api-key': process.env.SERVICE_API_SECRET || '' },
    body,
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = data.error || `HTTP ${res.status}: ${text.slice(0, 200)}`;
    throw new Error(msg);
  }
  return data;
}

const server = new McpServer({
  name: 'host-subdomain',
  version: '1.0.0',
});

server.tool(
  'host_subdomain',
  'Host a public or accessible GitHub repository as a static website at <sub>.swayat.com. Builds the repo (npm ci && npm run build) in a sandbox and deploys the resulting dist/ or build/ output. Re-deploys are allowed only by the original requester. Returns { success, url, message }. Build can take 30-120 seconds; the user will receive WhatsApp progress messages during that time.',
  {
    repo: z.string().describe('GitHub repository as "owner/repo" or full URL (e.g. "octocat/Hello-World" or "https://github.com/octocat/Hello-World")'),
    sub: z.string().describe('Desired subdomain — lowercase letters, digits, hyphens (e.g. "alice", "my-portfolio"). Reserved names like www/api/admin/apurva/dhruvil are blocked.'),
  },
  async ({ repo, sub }) => {
    try {
      const result = await apiCall('/host-subdomain', { repo, sub });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`host-subdomain MCP server fatal: ${err.message}\n`);
  process.exit(1);
});
