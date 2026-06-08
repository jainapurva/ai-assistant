#!/usr/bin/env node

/**
 * Schedule MCP Server — stdio proxy for the unified scheduler.
 *
 * Exposes 4 tools (schedule_create, schedule_list, schedule_remove,
 * schedule_update) to Claude. Each tool proxies to the bot's HTTP API
 * on BOT_API_URL. Schedules are scoped per-user via the CHAT_ID env var
 * injected by the bot when launching this server.
 *
 * Use this whenever the user mentions a reminder, follow-up, deadline,
 * or recurring task — never just acknowledge verbally without persisting.
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

async function apiCall(endpoint, params = {}) {
  const url = `${BOT_API_URL}${endpoint}`;
  const body = JSON.stringify({ chatId: CHAT_ID, ...params });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bot-auth': process.env.INTERNAL_API_TOKEN || '' },
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
  name: 'schedule',
  version: '1.0.0',
});

const WHEN_DESC = `When the schedule should fire. Accepts:
- Natural recurrence: "hourly", "daily 6pm", "daily 18:00", "weekdays 9am", "weekends 10:00", "every monday 10:00", "every 30m", "every 2h", "every 1d"
- Raw 5-field cron: "0 18 * * *"
- One-shot ISO 8601 datetime in user timezone (default America/Los_Angeles): "2026-05-01T15:30:00-07:00" — fires once and auto-removes.`;

server.tool(
  'schedule_create',
  'Persist a reminder or recurring task. Call this whenever the user asks to be reminded of something, set a deadline, schedule a recurring task, or follow up later — never just acknowledge verbally without persisting. Returns { id, cron, friendlyInterval, prompt, type, oneShot }.',
  {
    when: z.string().describe(WHEN_DESC),
    prompt: z.string().describe('The reminder text (for type="remind") or the AI instruction to execute (for type="task"). For reminders this is exactly what the user will see.'),
    type: z.enum(['remind', 'task']).optional().describe('"remind" (default) sends the prompt as a WhatsApp message at the scheduled time. "task" runs the prompt through the AI each time it fires (use for things like "check my emails and summarize").'),
  },
  async ({ when, prompt, type }) => {
    try {
      const result = await apiCall('/schedule/create', { when, prompt, type });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  'schedule_list',
  'List the user\'s active schedules. Call this when the user asks "what reminders do I have?", "my schedules", "what\'s coming up". Returns an array of schedule objects with their id, friendlyInterval, prompt, type, and lastRun.',
  {},
  async () => {
    try {
      const result = await apiCall('/schedule/list', {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  'schedule_remove',
  'Remove a schedule. Call when the user says "cancel that reminder", "stop the weekly X", "never mind", or finishes a one-off task before it fires. Use schedule_list first if you need to find the id.',
  {
    id: z.string().describe('Schedule id (returned by schedule_create or schedule_list).'),
  },
  async ({ id }) => {
    try {
      const result = await apiCall('/schedule/remove', { id });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  'schedule_update',
  'Edit an existing schedule\'s time, prompt text, or type. Use when the user says "snooze that to tomorrow", "change the message to X", "actually make it weekly". Pass only the fields that change.',
  {
    id: z.string().describe('Schedule id.'),
    when: z.string().optional().describe(WHEN_DESC),
    prompt: z.string().optional().describe('New reminder text or AI instruction.'),
    type: z.enum(['remind', 'task']).optional().describe('Switch between plain reminder and AI-executed task.'),
  },
  async ({ id, when, prompt, type }) => {
    try {
      const result = await apiCall('/schedule/update', { id, when, prompt, type });
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
  process.stderr.write(`schedule MCP server fatal: ${err.message}\n`);
  process.exit(1);
});
