/**
 * Tests for the GitHub MCP server tool handlers.
 *
 * Replicates the tool handler pattern from the MCP server and verifies
 * each tool sends the correct HTTP request and returns properly formatted results.
 */

// Set env vars BEFORE anything else
process.env.CHAT_ID = 'test-github-chat';
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
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}: ${text.slice(0, 200)}`);
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

// Register tool handlers matching the MCP server
const tools = {
  github_list_repos: toolHandler('/github/repos', () => ({})),
  github_get_file: toolHandler('/github/get-file', ({ repo, path, ref }) => ({ repo, path, ref })),
  github_list_files: toolHandler('/github/list-files', ({ repo, path, ref }) => ({ repo, path, ref })),
  github_create_or_update_file: toolHandler('/github/create-or-update-file', ({ repo, path, content, message, branch, sha }) => ({ repo, path, content, message, branch, sha })),
  github_list_branches: toolHandler('/github/list-branches', ({ repo }) => ({ repo })),
  github_create_branch: toolHandler('/github/create-branch', ({ repo, branch, fromBranch }) => ({ repo, branch, fromBranch })),
  github_list_prs: toolHandler('/github/list-prs', ({ repo, state }) => ({ repo, state })),
  github_create_pr: toolHandler('/github/create-pr', ({ repo, title, head, base, body }) => ({ repo, title, head, base, body })),
  github_list_issues: toolHandler('/github/list-issues', ({ repo, state }) => ({ repo, state })),
  github_create_issue: toolHandler('/github/create-issue', ({ repo, title, body, labels }) => ({ repo, title, body, labels })),
  github_search_code: toolHandler('/github/search-code', ({ query, repo }) => ({ query, repo })),
};

function mockFetch(response, status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(response),
  });
}

// ── Tool count ──────────────────────────────────────────────────────────────

describe('GitHub MCP server tools', () => {
  test('has 11 tools registered', () => {
    expect(Object.keys(tools)).toHaveLength(11);
  });
});

// ── github_list_repos ───────────────────────────────────────────────────────

describe('github_list_repos', () => {
  test('calls /github/repos with chatId', async () => {
    global.fetch = mockFetch({ repos: [{ fullName: 'user/repo' }] });
    const result = await tools.github_list_repos({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.repos).toHaveLength(1);
    expect(parsed.repos[0].fullName).toBe('user/repo');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('http://localhost:9999/github/repos');
    const body = JSON.parse(opts.body);
    expect(body.chatId).toBe('test-github-chat');
  });
});

// ── github_get_file ─────────────────────────────────────────────────────────

describe('github_get_file', () => {
  test('sends repo, path, and ref', async () => {
    global.fetch = mockFetch({ name: 'index.js', content: 'hello', sha: 'abc123' });
    const result = await tools.github_get_file({ repo: 'user/app', path: 'src/index.js', ref: 'main' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.name).toBe('index.js');
    expect(parsed.sha).toBe('abc123');

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.repo).toBe('user/app');
    expect(body.path).toBe('src/index.js');
    expect(body.ref).toBe('main');
  });
});

// ── github_list_files ───────────────────────────────────────────────────────

describe('github_list_files', () => {
  test('sends repo and path', async () => {
    global.fetch = mockFetch({ files: [{ name: 'README.md', type: 'file' }] });
    const result = await tools.github_list_files({ repo: 'user/app', path: 'src' });
    expect(result.isError).toBeUndefined();

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.repo).toBe('user/app');
    expect(body.path).toBe('src');
  });
});

// ── github_create_or_update_file ────────────────────────────────────────────

describe('github_create_or_update_file', () => {
  test('sends all params for file creation', async () => {
    global.fetch = mockFetch({ path: 'newfile.js', sha: 'def456', commitSha: 'commit1' });
    const result = await tools.github_create_or_update_file({
      repo: 'user/app', path: 'newfile.js', content: 'const x = 1;',
      message: 'Add newfile', branch: 'feat', sha: undefined,
    });
    expect(result.isError).toBeUndefined();

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.content).toBe('const x = 1;');
    expect(body.message).toBe('Add newfile');
    expect(body.branch).toBe('feat');
  });

  test('sends sha for file update', async () => {
    global.fetch = mockFetch({ path: 'existing.js', sha: 'new-sha' });
    await tools.github_create_or_update_file({
      repo: 'user/app', path: 'existing.js', content: 'updated',
      message: 'Update file', sha: 'old-sha',
    });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.sha).toBe('old-sha');
  });
});

// ── github_list_branches ────────────────────────────────────────────────────

describe('github_list_branches', () => {
  test('calls /github/list-branches', async () => {
    global.fetch = mockFetch({ branches: [{ name: 'main', sha: 'abc' }] });
    const result = await tools.github_list_branches({ repo: 'user/app' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.branches).toHaveLength(1);
  });
});

// ── github_create_branch ────────────────────────────────────────────────────

describe('github_create_branch', () => {
  test('sends repo, branch, and fromBranch', async () => {
    global.fetch = mockFetch({ branch: 'feat-x', sha: 'abc', fromBranch: 'main' });
    await tools.github_create_branch({ repo: 'user/app', branch: 'feat-x', fromBranch: 'main' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.branch).toBe('feat-x');
    expect(body.fromBranch).toBe('main');
  });
});

// ── github_list_prs ─────────────────────────────────────────────────────────

describe('github_list_prs', () => {
  test('sends repo and state', async () => {
    global.fetch = mockFetch({ pullRequests: [{ number: 1, title: 'Fix bug' }] });
    await tools.github_list_prs({ repo: 'user/app', state: 'open' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.state).toBe('open');
  });
});

// ── github_create_pr ────────────────────────────────────────────────────────

describe('github_create_pr', () => {
  test('sends all PR params', async () => {
    global.fetch = mockFetch({ number: 5, title: 'New feature', htmlUrl: 'https://github.com/user/app/pull/5' });
    const result = await tools.github_create_pr({
      repo: 'user/app', title: 'New feature', head: 'feat-branch', base: 'main', body: 'Description',
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.number).toBe(5);

    const reqBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(reqBody.title).toBe('New feature');
    expect(reqBody.head).toBe('feat-branch');
    expect(reqBody.base).toBe('main');
  });
});

// ── github_list_issues ──────────────────────────────────────────────────────

describe('github_list_issues', () => {
  test('sends repo and state', async () => {
    global.fetch = mockFetch({ issues: [{ number: 10, title: 'Bug report' }] });
    await tools.github_list_issues({ repo: 'user/app', state: 'open' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.repo).toBe('user/app');
  });
});

// ── github_create_issue ─────────────────────────────────────────────────────

describe('github_create_issue', () => {
  test('sends title, body, and labels', async () => {
    global.fetch = mockFetch({ number: 11, title: 'New issue', htmlUrl: 'https://github.com/...' });
    await tools.github_create_issue({
      repo: 'user/app', title: 'New issue', body: 'Details here', labels: ['bug'],
    });
    const reqBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(reqBody.title).toBe('New issue');
    expect(reqBody.labels).toEqual(['bug']);
  });
});

// ── github_search_code ──────────────────────────────────────────────────────

describe('github_search_code', () => {
  test('sends query and optional repo', async () => {
    global.fetch = mockFetch({ totalCount: 3, items: [{ name: 'file.js', path: 'src/file.js' }] });
    await tools.github_search_code({ query: 'useState', repo: 'user/app' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.query).toBe('useState');
    expect(body.repo).toBe('user/app');
  });
});

// ── Error handling ──────────────────────────────────────────────────────────

describe('error handling', () => {
  test('returns isError on API failure', async () => {
    global.fetch = mockFetch({ error: 'Not connected' }, 500);
    const result = await tools.github_list_repos({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Not connected');
  });

  test('returns isError on network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    const result = await tools.github_get_file({ repo: 'x/y', path: 'f.js' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network error');
  });
});
