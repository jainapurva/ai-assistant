#!/usr/bin/env node

/**
 * Google MCP Server — stdio proxy for Gmail, Drive, Sheets, and Docs.
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

/**
 * POST JSON to the bot's HTTP API and return the parsed response.
 */
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

/**
 * Wrap a tool handler: call apiCall, return MCP-formatted result.
 */
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
  name: 'google',
  version: '1.0.0',
});

// ── Gmail ───────────────────────────────────────────────────────────────────

server.tool(
  'gmail_send',
  'Send an email via Gmail',
  { to: z.string(), subject: z.string(), body: z.string() },
  toolHandler('/gmail/send', ({ to, subject, body }) => ({ to, subject, body })),
);

server.tool(
  'gmail_inbox',
  'List or search Gmail inbox',
  { query: z.string().optional(), maxResults: z.number().optional() },
  toolHandler('/gmail/inbox', ({ query, maxResults }) => ({ query, maxResults })),
);

server.tool(
  'gmail_read',
  'Read a specific Gmail message by ID',
  { messageId: z.string() },
  toolHandler('/gmail/read', ({ messageId }) => ({ messageId })),
);

// ── Drive ───────────────────────────────────────────────────────────────────

server.tool(
  'drive_list',
  'List or search Google Drive files',
  { query: z.string().optional(), maxResults: z.number().optional() },
  toolHandler('/drive/list', ({ query, maxResults }) => ({ query, maxResults })),
);

server.tool(
  'drive_upload',
  'Upload a file from workspace to Google Drive',
  { filePath: z.string(), folderId: z.string().optional() },
  toolHandler('/drive/upload', ({ filePath, folderId }) => ({ filePath, folderId })),
);

server.tool(
  'drive_get',
  'Get Google Drive file metadata by ID',
  { fileId: z.string() },
  toolHandler('/drive/get', ({ fileId }) => ({ fileId })),
);

// ── Sheets ──────────────────────────────────────────────────────────────────

server.tool(
  'sheets_read',
  'Read data from a Google Sheets range',
  { spreadsheetId: z.string(), range: z.string() },
  toolHandler('/sheets/read', ({ spreadsheetId, range }) => ({ spreadsheetId, range })),
);

server.tool(
  'sheets_write',
  'Write data to a Google Sheets range',
  { spreadsheetId: z.string(), range: z.string(), values: z.array(z.array(z.string())) },
  toolHandler('/sheets/write', ({ spreadsheetId, range, values }) => ({ spreadsheetId, range, values })),
);

server.tool(
  'sheets_create',
  'Create a new Google Sheets spreadsheet',
  { title: z.string() },
  toolHandler('/sheets/create', ({ title }) => ({ title })),
);

// ── Docs ────────────────────────────────────────────────────────────────────

server.tool(
  'docs_read',
  'Read a Google Docs document by ID',
  { documentId: z.string() },
  toolHandler('/docs/read', ({ documentId }) => ({ documentId })),
);

server.tool(
  'docs_create',
  'Create a new Google Docs document',
  { title: z.string(), body: z.string().optional() },
  toolHandler('/docs/create', ({ title, body }) => ({ title, body })),
);

// ── Start ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`MCP server fatal: ${err.message}\n`);
  process.exit(1);
});
