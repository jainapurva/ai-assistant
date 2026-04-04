#!/usr/bin/env node

/**
 * GitHub MCP Server — stdio proxy for GitHub repos, files, branches, PRs, issues.
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
  name: 'github',
  version: '1.0.0',
});

// ── Repos ────────────────────────────────────────────────────────────────────

server.tool(
  'github_list_repos',
  'List GitHub repos the user has given access to',
  {},
  toolHandler('/github/repos', () => ({})),
);

// ── Files ────────────────────────────────────────────────────────────────────

server.tool(
  'github_get_file',
  'Read a file from a GitHub repo. Returns content and SHA (needed for updates).',
  {
    repo: z.string().describe('Owner/repo format, e.g. "octocat/hello-world"'),
    path: z.string().describe('File path, e.g. "src/index.js"'),
    ref: z.string().optional().describe('Branch or commit SHA (default: repo default branch)'),
  },
  toolHandler('/github/get-file', ({ repo, path, ref }) => ({ repo, path, ref })),
);

server.tool(
  'github_list_files',
  'List files and directories in a repo path',
  {
    repo: z.string().describe('Owner/repo format'),
    path: z.string().optional().describe('Directory path (default: root)'),
    ref: z.string().optional().describe('Branch or commit SHA'),
  },
  toolHandler('/github/list-files', ({ repo, path, ref }) => ({ repo, path, ref })),
);

server.tool(
  'github_create_or_update_file',
  'Create or update a file in a repo. For updates, you MUST provide the sha from github_get_file.',
  {
    repo: z.string().describe('Owner/repo format'),
    path: z.string().describe('File path'),
    content: z.string().describe('File content (plain text)'),
    message: z.string().describe('Commit message'),
    branch: z.string().optional().describe('Target branch (default: repo default branch)'),
    sha: z.string().optional().describe('Current file SHA (required for updates, get from github_get_file)'),
  },
  toolHandler('/github/create-or-update-file', ({ repo, path, content, message, branch, sha }) => ({
    repo, path, content, message, branch, sha,
  })),
);

// ── Branches ─────────────────────────────────────────────────────────────────

server.tool(
  'github_list_branches',
  'List branches in a repo',
  { repo: z.string().describe('Owner/repo format') },
  toolHandler('/github/list-branches', ({ repo }) => ({ repo })),
);

server.tool(
  'github_create_branch',
  'Create a new branch from an existing branch',
  {
    repo: z.string().describe('Owner/repo format'),
    branch: z.string().describe('New branch name'),
    fromBranch: z.string().describe('Source branch to create from (e.g. "main")'),
  },
  toolHandler('/github/create-branch', ({ repo, branch, fromBranch }) => ({ repo, branch, fromBranch })),
);

// ── Pull Requests ────────────────────────────────────────────────────────────

server.tool(
  'github_list_prs',
  'List pull requests in a repo',
  {
    repo: z.string().describe('Owner/repo format'),
    state: z.enum(['open', 'closed', 'all']).optional().describe('PR state filter (default: open)'),
  },
  toolHandler('/github/list-prs', ({ repo, state }) => ({ repo, state })),
);

server.tool(
  'github_create_pr',
  'Create a pull request',
  {
    repo: z.string().describe('Owner/repo format'),
    title: z.string().describe('PR title'),
    head: z.string().describe('Branch with changes'),
    base: z.string().describe('Branch to merge into (e.g. "main")'),
    body: z.string().optional().describe('PR description'),
  },
  toolHandler('/github/create-pr', ({ repo, title, head, base, body }) => ({
    repo, title, head, base, body,
  })),
);

// ── Issues ───────────────────────────────────────────────────────────────────

server.tool(
  'github_list_issues',
  'List issues in a repo',
  {
    repo: z.string().describe('Owner/repo format'),
    state: z.enum(['open', 'closed', 'all']).optional().describe('Issue state filter (default: open)'),
  },
  toolHandler('/github/list-issues', ({ repo, state }) => ({ repo, state })),
);

server.tool(
  'github_create_issue',
  'Create an issue in a repo',
  {
    repo: z.string().describe('Owner/repo format'),
    title: z.string().describe('Issue title'),
    body: z.string().optional().describe('Issue body (markdown)'),
    labels: z.array(z.string()).optional().describe('Labels to apply'),
  },
  toolHandler('/github/create-issue', ({ repo, title, body, labels }) => ({
    repo, title, body, labels,
  })),
);

// ── Search ───────────────────────────────────────────────────────────────────

server.tool(
  'github_search_code',
  'Search code across accessible repos',
  {
    query: z.string().describe('Search query'),
    repo: z.string().optional().describe('Limit search to a specific repo (owner/repo format)'),
  },
  toolHandler('/github/search-code', ({ query, repo }) => ({ query, repo })),
);

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`MCP server fatal: ${err.message}\n`);
  process.exit(1);
});
