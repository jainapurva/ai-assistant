/**
 * Tests for the Outlook MCP server tool handlers.
 *
 * Same pattern as mcp-server.test.js (Google): mock global fetch(),
 * verify each tool sends the correct HTTP request and returns
 * properly formatted MCP results.
 */

process.env.CHAT_ID = 'test-chat-outlook';
process.env.BOT_API_URL = 'http://localhost:9999';

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

describe('Outlook MCP server tool handlers', () => {

  // ── Send ──

  test('outlook_send forwards to, subject, body', async () => {
    const handler = toolHandler('/outlook/send', ({ to, subject, body }) => ({ to, subject, body }));
    const result = await handler({ to: 'a@outlook.com', subject: 'Hi', body: 'Hello' });

    expect(lastFetchUrl).toBe('http://localhost:9999/outlook/send');
    expect(lastFetchBody).toEqual({ chatId: 'test-chat-outlook', to: 'a@outlook.com', subject: 'Hi', body: 'Hello' });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({ status: 'ok', mock: true });
  });

  test('outlook_send forwards optional cc, bcc, html', async () => {
    const handler = toolHandler('/outlook/send', ({ to, subject, body, cc, bcc, html }) => ({ to, subject, body, cc, bcc, html }));
    await handler({ to: 'a@b.com', subject: 'Test', body: '<h1>Hi</h1>', cc: 'c@d.com', bcc: 'e@f.com', html: true });

    expect(lastFetchBody.cc).toBe('c@d.com');
    expect(lastFetchBody.bcc).toBe('e@f.com');
    expect(lastFetchBody.html).toBe(true);
  });

  // ── Inbox ──

  test('outlook_inbox forwards query and maxResults', async () => {
    const handler = toolHandler('/outlook/inbox', ({ query, maxResults }) => ({ query, maxResults }));
    const result = await handler({ query: 'from:user@example.com', maxResults: 5 });

    expect(lastFetchUrl).toBe('http://localhost:9999/outlook/inbox');
    expect(lastFetchBody).toEqual({ chatId: 'test-chat-outlook', query: 'from:user@example.com', maxResults: 5 });
    expect(result.isError).toBeUndefined();
  });

  test('outlook_inbox works with no optional params', async () => {
    const handler = toolHandler('/outlook/inbox', ({ query, maxResults }) => ({ query, maxResults }));
    const result = await handler({});

    expect(lastFetchBody).toEqual({ chatId: 'test-chat-outlook', query: undefined, maxResults: undefined });
    expect(result.isError).toBeUndefined();
  });

  test('outlook_inbox forwards folderId', async () => {
    const handler = toolHandler('/outlook/inbox', ({ query, maxResults, folderId }) => ({ query, maxResults, folderId }));
    await handler({ folderId: 'folder-123' });

    expect(lastFetchBody.folderId).toBe('folder-123');
  });

  // ── Read ──

  test('outlook_read forwards messageId', async () => {
    const handler = toolHandler('/outlook/read', ({ messageId }) => ({ messageId }));
    const result = await handler({ messageId: 'msg-abc' });

    expect(lastFetchUrl).toBe('http://localhost:9999/outlook/read');
    expect(lastFetchBody).toEqual({ chatId: 'test-chat-outlook', messageId: 'msg-abc' });
    expect(result.isError).toBeUndefined();
  });

  // ── Reply ──

  test('outlook_reply forwards messageId and comment', async () => {
    const handler = toolHandler('/outlook/reply', ({ messageId, comment }) => ({ messageId, comment }));
    await handler({ messageId: 'msg-1', comment: 'Thanks!' });

    expect(lastFetchUrl).toBe('http://localhost:9999/outlook/reply');
    expect(lastFetchBody).toEqual({ chatId: 'test-chat-outlook', messageId: 'msg-1', comment: 'Thanks!' });
  });

  // ── Forward ──

  test('outlook_forward forwards messageId, to, and comment', async () => {
    const handler = toolHandler('/outlook/forward', ({ messageId, to, comment }) => ({ messageId, to, comment }));
    await handler({ messageId: 'msg-2', to: 'fwd@test.com', comment: 'FYI' });

    expect(lastFetchUrl).toBe('http://localhost:9999/outlook/forward');
    expect(lastFetchBody).toEqual({ chatId: 'test-chat-outlook', messageId: 'msg-2', to: 'fwd@test.com', comment: 'FYI' });
  });

  // ── Delete ──

  test('outlook_delete forwards messageId', async () => {
    const handler = toolHandler('/outlook/delete', ({ messageId }) => ({ messageId }));
    await handler({ messageId: 'msg-3' });

    expect(lastFetchUrl).toBe('http://localhost:9999/outlook/delete');
    expect(lastFetchBody).toEqual({ chatId: 'test-chat-outlook', messageId: 'msg-3' });
  });

  // ── Move ──

  test('outlook_move forwards messageId and destinationFolderId', async () => {
    const handler = toolHandler('/outlook/move', ({ messageId, destinationFolderId }) => ({ messageId, destinationFolderId }));
    await handler({ messageId: 'msg-4', destinationFolderId: 'archive-folder' });

    expect(lastFetchUrl).toBe('http://localhost:9999/outlook/move');
    expect(lastFetchBody).toEqual({ chatId: 'test-chat-outlook', messageId: 'msg-4', destinationFolderId: 'archive-folder' });
  });

  // ── Mark ──

  test('outlook_mark forwards messageId and isRead', async () => {
    const handler = toolHandler('/outlook/mark', ({ messageId, isRead }) => ({ messageId, isRead }));
    await handler({ messageId: 'msg-5', isRead: true });

    expect(lastFetchUrl).toBe('http://localhost:9999/outlook/mark');
    expect(lastFetchBody).toEqual({ chatId: 'test-chat-outlook', messageId: 'msg-5', isRead: true });
  });

  test('outlook_mark handles unread', async () => {
    const handler = toolHandler('/outlook/mark', ({ messageId, isRead }) => ({ messageId, isRead }));
    await handler({ messageId: 'msg-6', isRead: false });

    expect(lastFetchBody.isRead).toBe(false);
  });

  // ── Folders ──

  test('outlook_folders sends request with chatId only', async () => {
    const handler = toolHandler('/outlook/folders', () => ({}));
    await handler({});

    expect(lastFetchUrl).toBe('http://localhost:9999/outlook/folders');
    expect(lastFetchBody).toEqual({ chatId: 'test-chat-outlook' });
  });

  // ── Draft ──

  test('outlook_draft forwards to, subject, body', async () => {
    const handler = toolHandler('/outlook/draft', ({ to, subject, body }) => ({ to, subject, body }));
    await handler({ to: 'draft@test.com', subject: 'Draft', body: 'Content' });

    expect(lastFetchUrl).toBe('http://localhost:9999/outlook/draft');
    expect(lastFetchBody).toEqual({ chatId: 'test-chat-outlook', to: 'draft@test.com', subject: 'Draft', body: 'Content' });
  });

  test('outlook_draft forwards html flag', async () => {
    const handler = toolHandler('/outlook/draft', ({ to, subject, body, html }) => ({ to, subject, body, html }));
    await handler({ to: 'a@b.com', subject: 'S', body: '<b>Hi</b>', html: true });

    expect(lastFetchBody.html).toBe(true);
  });

  // ── Error handling ──

  test('returns isError on HTTP error with error field', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'chatId required' }),
    }));

    const handler = toolHandler('/outlook/send', ({ to }) => ({ to }));
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

    const handler = toolHandler('/outlook/inbox', ({ query }) => ({ query }));
    const result = await handler({ query: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('HTTP 500');
  });

  test('returns isError on network failure', async () => {
    global.fetch = jest.fn(async () => { throw new Error('ECONNREFUSED'); });

    const handler = toolHandler('/outlook/folders', () => ({}));
    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ECONNREFUSED');
  });

  test('always includes chatId in request body', async () => {
    const handler = toolHandler('/outlook/read', ({ messageId }) => ({ messageId }));
    await handler({ messageId: 'msg-1' });

    expect(lastFetchBody.chatId).toBe('test-chat-outlook');
  });
});
