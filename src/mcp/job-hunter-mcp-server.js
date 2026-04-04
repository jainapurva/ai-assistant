#!/usr/bin/env node

/**
 * Job Hunter MCP Server — job search, company info, and application tracking.
 *
 * Proxies job search requests through the bot's HTTP API (which holds the API keys),
 * and manages a local application tracker in a JSON file.
 *
 * Env vars:
 *   TRACKER_PATH  — path to tracker.json (required)
 *   BOT_API_URL   — bot internal API base URL (required for job search)
 *   CHAT_ID       — current user's chat ID (required for job search)
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');

const TRACKER_PATH = process.env.TRACKER_PATH;
if (!TRACKER_PATH) {
  process.stderr.write('ERROR: TRACKER_PATH env var is required\n');
  process.exit(1);
}

const BOT_API_URL = process.env.BOT_API_URL || '';
const CHAT_ID = process.env.CHAT_ID || '';

// ── Tracker persistence ──────────────────────────────────────────────────────

function defaultTracker() {
  return {
    applications: [],
    createdAt: new Date().toISOString(),
  };
}

function loadTracker() {
  try {
    if (fs.existsSync(TRACKER_PATH)) {
      return JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf8'));
    }
  } catch (err) {
    process.stderr.write(`WARN: Failed to load tracker: ${err.message}\n`);
  }
  const t = defaultTracker();
  saveTracker(t);
  return t;
}

function saveTracker(tracker) {
  const dir = path.dirname(TRACKER_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = TRACKER_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(tracker, null, 2));
  fs.renameSync(tmp, TRACKER_PATH);
}

// ── Bot API helper ───────────────────────────────────────────────────────────

async function botApi(endpoint, payload) {
  if (!BOT_API_URL) throw new Error('BOT_API_URL not configured');
  const res = await fetch(`${BOT_API_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: CHAT_ID, ...payload }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'job-hunter',
  version: '1.0.0',
});

function mcpResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function mcpError(msg) {
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

// ── Job Search Tools ─────────────────────────────────────────────────────────

server.tool(
  'job_search',
  'Search for jobs by title, location, and filters. Aggregates results from multiple job boards.',
  {
    query: z.string().describe('Job title or keywords (e.g. "Python developer", "product manager")'),
    location: z.string().optional().describe('Location (e.g. "New York", "London", "remote")'),
    remote: z.boolean().optional().describe('Filter for remote-only jobs'),
    page: z.number().optional().default(1).describe('Page number for pagination'),
  },
  async ({ query, location, remote, page }) => {
    try {
      const result = await botApi('/jobs/search', { query, location, remote, page });
      return mcpResult(result);
    } catch (err) {
      return mcpError(err.message);
    }
  },
);

server.tool(
  'job_details',
  'Get full details for a specific job posting by ID',
  {
    jobId: z.string().describe('The job ID from search results'),
    source: z.string().optional().describe('Source API (jsearch, remotive, arbeitnow, themuse)'),
  },
  async ({ jobId, source }) => {
    try {
      const result = await botApi('/jobs/details', { jobId, source });
      return mcpResult(result);
    } catch (err) {
      return mcpError(err.message);
    }
  },
);

server.tool(
  'company_info',
  'Get company profile and information from The Muse API',
  {
    company: z.string().describe('Company name (e.g. "Google", "Stripe")'),
  },
  async ({ company }) => {
    try {
      const result = await botApi('/jobs/company', { company });
      return mcpResult(result);
    } catch (err) {
      return mcpError(err.message);
    }
  },
);

// ── Application Tracker Tools ────────────────────────────────────────────────

const APPLICATION_STATUSES = ['saved', 'applied', 'screen', 'interview', 'offer', 'rejected', 'withdrawn'];

server.tool(
  'tracker_add',
  'Add a job application to the tracker',
  {
    company: z.string().describe('Company name'),
    role: z.string().describe('Job title/role'),
    url: z.string().optional().describe('Job posting URL'),
    status: z.enum(APPLICATION_STATUSES).default('applied').describe('Application status'),
    notes: z.string().optional().describe('Any notes about the application'),
    salary: z.string().optional().describe('Salary range if known'),
    location: z.string().optional().describe('Job location'),
  },
  async ({ company, role, url, status, notes, salary, location }) => {
    try {
      const tracker = loadTracker();
      const application = {
        id: `app_${Date.now()}`,
        company,
        role,
        url: url || null,
        status,
        notes: notes || null,
        salary: salary || null,
        location: location || null,
        appliedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        history: [{ status, date: new Date().toISOString() }],
      };
      tracker.applications.push(application);
      saveTracker(tracker);
      return mcpResult({ message: 'Application added', application });
    } catch (err) {
      return mcpError(err.message);
    }
  },
);

server.tool(
  'tracker_list',
  'List tracked job applications, optionally filtered by status',
  {
    status: z.enum([...APPLICATION_STATUSES, 'all']).optional().default('all').describe('Filter by status, or "all" for everything'),
    limit: z.number().optional().default(20).describe('Max results to return'),
  },
  async ({ status, limit }) => {
    try {
      const tracker = loadTracker();
      let apps = tracker.applications;
      if (status && status !== 'all') {
        apps = apps.filter(a => a.status === status);
      }
      // Most recent first
      apps = apps.slice(-limit).reverse();
      return mcpResult({
        applications: apps,
        total: tracker.applications.length,
        showing: apps.length,
        filtered: status !== 'all' ? status : null,
      });
    } catch (err) {
      return mcpError(err.message);
    }
  },
);

server.tool(
  'tracker_update',
  'Update the status of a tracked application',
  {
    id: z.string().describe('Application ID (e.g. app_1234567890)'),
    status: z.enum(APPLICATION_STATUSES).describe('New status'),
    notes: z.string().optional().describe('Additional notes about this update'),
  },
  async ({ id, status, notes }) => {
    try {
      const tracker = loadTracker();
      const app = tracker.applications.find(a => a.id === id);
      if (!app) {
        // Try partial match on company name
        const byCompany = tracker.applications.find(a =>
          a.company.toLowerCase().includes(id.toLowerCase()) ||
          a.role.toLowerCase().includes(id.toLowerCase())
        );
        if (byCompany) {
          byCompany.status = status;
          byCompany.updatedAt = new Date().toISOString();
          if (notes) byCompany.notes = (byCompany.notes ? byCompany.notes + '\n' : '') + notes;
          byCompany.history.push({ status, date: new Date().toISOString(), notes: notes || null });
          saveTracker(tracker);
          return mcpResult({ message: 'Application updated', application: byCompany });
        }
        return mcpError(`No application found with ID "${id}". Use tracker_list to see your applications.`);
      }
      app.status = status;
      app.updatedAt = new Date().toISOString();
      if (notes) app.notes = (app.notes ? app.notes + '\n' : '') + notes;
      app.history.push({ status, date: new Date().toISOString(), notes: notes || null });
      saveTracker(tracker);
      return mcpResult({ message: 'Application updated', application: app });
    } catch (err) {
      return mcpError(err.message);
    }
  },
);

server.tool(
  'tracker_stats',
  'Get application funnel stats — how many applications at each stage',
  {},
  async () => {
    try {
      const tracker = loadTracker();
      const stats = {};
      for (const s of APPLICATION_STATUSES) {
        stats[s] = tracker.applications.filter(a => a.status === s).length;
      }
      const total = tracker.applications.length;
      const activeStatuses = ['applied', 'screen', 'interview'];
      const active = tracker.applications.filter(a => activeStatuses.includes(a.status)).length;

      // Calculate response rate
      const applied = stats.applied + stats.screen + stats.interview + stats.offer + stats.rejected;
      const responded = stats.screen + stats.interview + stats.offer + stats.rejected;
      const responseRate = applied > 0 ? Math.round((responded / applied) * 100) : 0;

      return mcpResult({
        total,
        active,
        byStatus: stats,
        responseRate: `${responseRate}%`,
        oldestApplication: tracker.applications.length > 0 ? tracker.applications[0].appliedAt : null,
        newestApplication: tracker.applications.length > 0 ? tracker.applications[tracker.applications.length - 1].appliedAt : null,
      });
    } catch (err) {
      return mcpError(err.message);
    }
  },
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

// Export for testing
if (typeof module !== 'undefined') {
  module.exports = {
    loadTracker, saveTracker, defaultTracker,
    APPLICATION_STATUSES, TRACKER_PATH,
  };
}
