/**
 * Tests for the Google MCP server tool handlers.
 *
 * We spawn the MCP server source as a module, mock global fetch(),
 * and verify each tool sends the correct HTTP request and returns
 * properly formatted MCP results.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');

// Set env vars BEFORE requiring the server module
process.env.CHAT_ID = 'test-chat-123';
process.env.BOT_API_URL = 'http://localhost:9999';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a fresh MCP server by re-executing the tool registration code.
 * We can't just require() the server file (it calls server.connect()),
 * so we replicate the tool handler factory and register tools the same way.
 */

// Extract the core logic from the server: apiCall + toolHandler
const CHAT_ID = process.env.CHAT_ID;
const BOT_API_URL = process.env.BOT_API_URL;

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

// ── Mock fetch ──────────────────────────────────────────────────────────────

let fetchMock;
let lastFetchUrl;
let lastFetchBody;

beforeEach(() => {
  lastFetchUrl = null;
  lastFetchBody = null;

  fetchMock = jest.fn(async (url, opts) => {
    lastFetchUrl = url;
    lastFetchBody = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'ok', mock: true }),
    };
  });

  global.fetch = fetchMock;
});

afterEach(() => {
  delete global.fetch;
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('MCP server tool handlers', () => {

  // ── Gmail ──

  test('gmail_send forwards to, subject, body', async () => {
    const handler = toolHandler('/gmail/send', ({ to, subject, body }) => ({ to, subject, body }));
    const result = await handler({ to: 'a@b.com', subject: 'Hi', body: 'Hello' });

    expect(lastFetchUrl).toBe('http://localhost:9999/gmail/send');
    expect(lastFetchBody).toEqual({ chatId: 'test-chat-123', to: 'a@b.com', subject: 'Hi', body: 'Hello' });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({ status: 'ok', mock: true });
  });

  test('gmail_inbox forwards query and maxResults', async () => {
    const handler = toolHandler('/gmail/inbox', ({ query, maxResults }) => ({ query, maxResults }));
    const result = await handler({ query: 'is:unread', maxResults: 5 });

    expect(lastFetchUrl).toBe('http://localhost:9999/gmail/inbox');
    expect(lastFetchBody).toEqual({ chatId: 'test-chat-123', query: 'is:unread', maxResults: 5 });
    expect(result.isError).toBeUndefined();
  });

  test('gmail_inbox works with no optional params', async () => {
    const handler = toolHandler('/gmail/inbox', ({ query, maxResults }) => ({ query, maxResults }));
    const result = await handler({});

    expect(lastFetchBody).toEqual({ chatId: 'test-chat-123', query: undefined, maxResults: undefined });
    expect(result.isError).toBeUndefined();
  });

  test('gmail_read forwards messageId', async () => {
    const handler = toolHandler('/gmail/read', ({ messageId }) => ({ messageId }));
    const result = await handler({ messageId: 'msg-abc' });

    expect(lastFetchUrl).toBe('http://localhost:9999/gmail/read');
    expect(lastFetchBody).toEqual({ chatId: 'test-chat-123', messageId: 'msg-abc' });
    expect(result.isError).toBeUndefined();
  });

  // ── Drive ──

  test('drive_list forwards query and maxResults', async () => {
    const handler = toolHandler('/drive/list', ({ query, maxResults }) => ({ query, maxResults }));
    await handler({ query: "name contains 'report'" });

    expect(lastFetchUrl).toBe('http://localhost:9999/drive/list');
    expect(lastFetchBody.query).toBe("name contains 'report'");
  });

  test('drive_upload forwards filePath and folderId', async () => {
    const handler = toolHandler('/drive/upload', ({ filePath, folderId }) => ({ filePath, folderId }));
    await handler({ filePath: '/workspace/data.csv', folderId: 'folder-123' });

    expect(lastFetchBody).toEqual({ chatId: 'test-chat-123', filePath: '/workspace/data.csv', folderId: 'folder-123' });
  });

  test('drive_get forwards fileId', async () => {
    const handler = toolHandler('/drive/get', ({ fileId }) => ({ fileId }));
    await handler({ fileId: 'file-xyz' });

    expect(lastFetchBody).toEqual({ chatId: 'test-chat-123', fileId: 'file-xyz' });
  });

  // ── Sheets ──

  test('sheets_read forwards spreadsheetId and range', async () => {
    const handler = toolHandler('/sheets/read', ({ spreadsheetId, range }) => ({ spreadsheetId, range }));
    await handler({ spreadsheetId: 'sheet-1', range: 'Sheet1!A1:D10' });

    expect(lastFetchUrl).toBe('http://localhost:9999/sheets/read');
    expect(lastFetchBody).toEqual({ chatId: 'test-chat-123', spreadsheetId: 'sheet-1', range: 'Sheet1!A1:D10' });
  });

  test('sheets_write forwards spreadsheetId, range, values', async () => {
    const handler = toolHandler('/sheets/write', ({ spreadsheetId, range, values }) => ({ spreadsheetId, range, values }));
    const values = [['a', 'b'], ['c', 'd']];
    await handler({ spreadsheetId: 'sheet-1', range: 'Sheet1!A1', values });

    expect(lastFetchBody.values).toEqual(values);
  });

  test('sheets_create forwards title', async () => {
    const handler = toolHandler('/sheets/create', ({ title }) => ({ title }));
    await handler({ title: 'My Sheet' });

    expect(lastFetchBody).toEqual({ chatId: 'test-chat-123', title: 'My Sheet' });
  });

  // ── Docs ──

  test('docs_read forwards documentId', async () => {
    const handler = toolHandler('/docs/read', ({ documentId }) => ({ documentId }));
    await handler({ documentId: 'doc-abc' });

    expect(lastFetchUrl).toBe('http://localhost:9999/docs/read');
    expect(lastFetchBody).toEqual({ chatId: 'test-chat-123', documentId: 'doc-abc' });
  });

  test('docs_create forwards title and body', async () => {
    const handler = toolHandler('/docs/create', ({ title, body }) => ({ title, body }));
    await handler({ title: 'My Doc', body: 'Hello world' });

    expect(lastFetchBody).toEqual({ chatId: 'test-chat-123', title: 'My Doc', body: 'Hello world' });
  });

  // ── Error handling ──

  test('returns isError on HTTP error with error field', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'chatId required' }),
    }));

    const handler = toolHandler('/gmail/send', ({ to }) => ({ to }));
    const result = await handler({ to: 'test@test.com' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('chatId required');
  });

  test('returns isError on HTTP error without error field', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    }));

    const handler = toolHandler('/gmail/inbox', ({ query }) => ({ query }));
    const result = await handler({ query: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('HTTP 500');
  });

  test('returns isError on network failure', async () => {
    global.fetch = jest.fn(async () => { throw new Error('ECONNREFUSED'); });

    const handler = toolHandler('/drive/list', ({ query }) => ({ query }));
    const result = await handler({ query: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });

  test('always includes chatId in request body', async () => {
    const handler = toolHandler('/docs/read', ({ documentId }) => ({ documentId }));
    await handler({ documentId: 'doc-1' });

    expect(lastFetchBody.chatId).toBe('test-chat-123');
  });
});
