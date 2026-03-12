#!/usr/bin/env node

/**
 * Outlook MCP Server — stdio proxy for Microsoft Outlook Mail.
 *
 * Reads CHAT_ID and BOT_API_URL from env vars, exposes MCP tools that
 * proxy to the bot's existing HTTP API endpoints via fetch().
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

const server = new McpServer({
  name: 'outlook',
  version: '1.0.0',
});

// ── Outlook Mail ─────────────────────────────────────────────────────────────

server.tool(
  'outlook_send',
  'Send an email via Outlook. Supports comma-separated recipients, optional CC/BCC, and HTML body.',
  {
    to: z.string().describe('Recipient email(s), comma-separated'),
    subject: z.string(),
    body: z.string(),
    cc: z.string().optional().describe('CC recipients, comma-separated'),
    bcc: z.string().optional().describe('BCC recipients, comma-separated'),
    html: z.boolean().optional().describe('Set true if body is HTML'),
  },
  toolHandler('/outlook/send', ({ to, subject, body, cc, bcc, html }) => ({ to, subject, body, cc, bcc, html })),
);

server.tool(
  'outlook_inbox',
  'List or search Outlook inbox. Query uses Microsoft Search syntax (e.g. "from:user@example.com", "subject:invoice").',
  {
    query: z.string().optional().describe('Search query (Microsoft search syntax)'),
    maxResults: z.number().optional().describe('Max emails to return (default 10)'),
    folderId: z.string().optional().describe('Folder ID to list from (default: inbox)'),
  },
  toolHandler('/outlook/inbox', ({ query, maxResults, folderId }) => ({ query, maxResults, folderId })),
);

server.tool(
  'outlook_read',
  'Read a specific Outlook email by its message ID',
  { messageId: z.string() },
  toolHandler('/outlook/read', ({ messageId }) => ({ messageId })),
);

server.tool(
  'outlook_reply',
  'Reply to an Outlook email',
  {
    messageId: z.string(),
    comment: z.string().describe('Reply text'),
  },
  toolHandler('/outlook/reply', ({ messageId, comment }) => ({ messageId, comment })),
);

server.tool(
  'outlook_forward',
  'Forward an Outlook email to other recipients',
  {
    messageId: z.string(),
    to: z.string().describe('Forward to email(s), comma-separated'),
    comment: z.string().optional().describe('Optional comment to include'),
  },
  toolHandler('/outlook/forward', ({ messageId, to, comment }) => ({ messageId, to, comment })),
);

server.tool(
  'outlook_delete',
  'Delete an Outlook email (moves to Deleted Items)',
  { messageId: z.string() },
  toolHandler('/outlook/delete', ({ messageId }) => ({ messageId })),
);

server.tool(
  'outlook_move',
  'Move an email to a specific folder',
  {
    messageId: z.string(),
    destinationFolderId: z.string().describe('Target folder ID (get IDs from outlook_folders)'),
  },
  toolHandler('/outlook/move', ({ messageId, destinationFolderId }) => ({ messageId, destinationFolderId })),
);

server.tool(
  'outlook_mark',
  'Mark an email as read or unread',
  {
    messageId: z.string(),
    isRead: z.boolean().describe('true = mark as read, false = mark as unread'),
  },
  toolHandler('/outlook/mark', ({ messageId, isRead }) => ({ messageId, isRead })),
);

server.tool(
  'outlook_folders',
  'List all mail folders with message counts',
  {},
  toolHandler('/outlook/folders', () => ({})),
);

server.tool(
  'outlook_draft',
  'Create a draft email (saved but not sent)',
  {
    to: z.string().describe('Recipient email(s), comma-separated'),
    subject: z.string(),
    body: z.string(),
    html: z.boolean().optional().describe('Set true if body is HTML'),
  },
  toolHandler('/outlook/draft', ({ to, subject, body, html }) => ({ to, subject, body, html })),
);

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Outlook MCP server fatal: ${err.message}\n`);
  process.exit(1);
});
