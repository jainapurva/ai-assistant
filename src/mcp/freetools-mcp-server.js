#!/usr/bin/env node

/**
 * FreeTools MCP Server — stdio proxy for social media publishing via freetools.us.
 *
 * Exposes MCP tools for:
 *   - Connecting X (Twitter), LinkedIn, Instagram accounts
 *   - Listing and disconnecting social accounts
 *   - Publishing posts immediately or scheduling them
 *   - Managing scheduled posts
 *
 * Reads CHAT_ID and BOT_API_URL from env vars; proxies all calls to the
 * bot's internal HTTP API which handles auth and freetools.us API calls.
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

// ── HTTP helper ──────────────────────────────────────────────────────────────

async function apiCall(endpoint, params) {
  const url = `${BOT_API_URL}${endpoint}`;
  const body = JSON.stringify({ chatId: CHAT_ID, ...params });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = data.error || `HTTP ${res.status}: ${text.slice(0, 200)}`;
    throw new Error(msg);
  }

  return data;
}

function toolHandler(endpoint, paramsFn) {
  return async (params) => {
    try {
      const result = await apiCall(endpoint, paramsFn(params));
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  };
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'freetools',
  version: '1.0.0',
});

// ── Account connection ───────────────────────────────────────────────────────

server.tool(
  'social_get_connect_url',
  'Get an OAuth URL to connect a social media account (X/Twitter, LinkedIn, or Instagram). Returns a URL the user must open in their browser to authorize.',
  { platform: z.enum(['TWITTER', 'LINKEDIN', 'INSTAGRAM']).describe('Platform to connect') },
  toolHandler('/freetools/connect-url', ({ platform }) => ({ platform })),
);

// ── Account management ───────────────────────────────────────────────────────

server.tool(
  'social_list_accounts',
  'List all connected social media accounts. Returns objects with an "id" field (integer) — use that integer as the accountId when publishing. Do NOT use the "account_id" field (that is the platform URN, not the publishing ID).',
  {
    platform: z.enum(['TWITTER', 'LINKEDIN', 'INSTAGRAM']).optional()
      .describe('Filter by platform (optional — omit to list all)'),
  },
  toolHandler('/freetools/list-accounts', ({ platform }) => ({ platform: platform || null })),
);

server.tool(
  'social_disconnect_account',
  'Disconnect (remove) a connected social media account by its ID.',
  { accountId: z.number().describe('Account ID from social_list_accounts') },
  toolHandler('/freetools/disconnect-account', ({ accountId }) => ({ accountId })),
);

// ── Publishing ───────────────────────────────────────────────────────────────

server.tool(
  'social_publish_now',
  'Publish a post immediately to one or more connected social media accounts. Always call social_list_accounts first. Use the integer "id" field from those results — NOT the "account_id" string field. For media: use filePath for local workspace files (preferred), or mediaUrl for public URLs.',
  {
    accountIds: z.array(z.number().int()).describe('List of integer account IDs from social_list_accounts — use the "id" field (e.g. 23), not "account_id"'),
    caption: z.string().describe('Text content of the post'),
    filePath: z.string().optional().describe('Local workspace file path to attach (e.g. "video.mp4", "image.png"). The bot will make it publicly accessible automatically.'),
    mediaUrl: z.string().optional().describe('Public URL of an image or video to attach (alternative to filePath)'),
    mediaType: z.enum(['IMAGE', 'VIDEO']).optional().describe('Required if filePath or mediaUrl is provided'),
  },
  toolHandler('/freetools/publish-now', ({ accountIds, caption, filePath, mediaUrl, mediaType }) => ({
    accountIds, caption, filePath: filePath || null, mediaUrl: mediaUrl || null, mediaType: mediaType || null,
  })),
);

server.tool(
  'social_schedule_post',
  'Schedule a post for a specific future time. Always call social_list_accounts first. Use the integer "id" field from those results — NOT the "account_id" string field. For media: use filePath for local workspace files (preferred), or mediaUrl for public URLs.',
  {
    accountIds: z.array(z.number().int()).describe('List of integer account IDs from social_list_accounts — use the "id" field (e.g. 23), not "account_id"'),
    caption: z.string().describe('Text content of the post'),
    scheduledTime: z.string().describe('ISO 8601 datetime (e.g. "2026-03-25T10:00:00Z")'),
    filePath: z.string().optional().describe('Local workspace file path to attach (e.g. "video.mp4", "image.png"). The bot will make it publicly accessible automatically.'),
    mediaUrl: z.string().optional().describe('Public URL of an image or video to attach (alternative to filePath)'),
    mediaType: z.enum(['IMAGE', 'VIDEO']).optional().describe('Required if filePath or mediaUrl is provided'),
  },
  toolHandler('/freetools/schedule-post', ({ accountIds, caption, scheduledTime, filePath, mediaUrl, mediaType }) => ({
    accountIds, caption, scheduledTime, filePath: filePath || null, mediaUrl: mediaUrl || null, mediaType: mediaType || null,
  })),
);

// ── Post management ──────────────────────────────────────────────────────────

server.tool(
  'social_list_posts',
  'List scheduled and published posts for the user.',
  {},
  toolHandler('/freetools/list-posts', () => ({})),
);

server.tool(
  'social_delete_post',
  'Delete a scheduled post by its ID (cannot delete already-published posts).',
  { postId: z.string().describe('Post ID from social_list_posts') },
  toolHandler('/freetools/delete-post', ({ postId }) => ({ postId })),
);

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`FreeTools MCP server fatal: ${err.message}\n`);
  process.exit(1);
});
