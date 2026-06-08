#!/usr/bin/env node
// One-time backfill of usage_daily from the bot's activity logs
// (activity/<hash>/<agent>.jsonl). Aggregates per-phone per-UTC-day counters
// and emits idempotent SQL to stdout or a file.
//
// Only emits days strictly BEFORE today (UTC) — today's data flows live via
// /api/user/analytics, so including it would double-count.
//
// Usage:
//   node scripts/backfill-usage.js > backfill-usage.sql
//   node scripts/backfill-usage.js --out backfill-usage.sql

const fs = require('fs');
const path = require('path');

const ACTIVITY_DIR = '/media/ddarji/storage/ai-assistant/activity';

function chatIdToPhone(chatId) {
  return '+' + chatId.replace('@c.us', '').replace('@g.us', '');
}

function emptyDay() {
  return {
    messages_in: 0, messages_out: 0, tasks: 0, completed_tasks: 0,
    failed_tasks: 0, input_tokens: 0, output_tokens: 0,
    cache_creation_tokens: 0, cache_read_tokens: 0, cost_usd: 0, duration_secs: 0,
  };
}

const buckets = new Map(); // `${date}|${phone}` -> counters
const today = new Date().toISOString().slice(0, 10);

function bucket(date, phone) {
  const key = `${date}|${phone}`;
  if (!buckets.has(key)) buckets.set(key, emptyDay());
  return buckets.get(key);
}

let events = 0;
let skippedToday = 0;

for (const hashDir of fs.readdirSync(ACTIVITY_DIR)) {
  const dir = path.join(ACTIVITY_DIR, hashDir);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
    const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let evt;
      try { evt = JSON.parse(line); } catch { continue; }
      if (!evt.ts || !evt.chatId) continue;
      const date = evt.ts.slice(0, 10);
      if (date >= today) { skippedToday++; continue; }
      const b = bucket(date, chatIdToPhone(evt.chatId));
      events++;
      switch (evt.event) {
        case 'message_in':
          b.messages_in++;
          break;
        case 'message_out':
          b.messages_out++;
          break;
        case 'task_end':
          b.tasks++;
          if (evt.status === 'completed') b.completed_tasks++;
          else if (evt.status === 'error') b.failed_tasks++;
          if (evt.tokens) {
            b.input_tokens += evt.tokens.input || 0;
            b.output_tokens += evt.tokens.output || 0;
            b.cache_creation_tokens += evt.tokens.cacheCreation || 0;
            b.cache_read_tokens += evt.tokens.cacheRead || 0;
            b.cost_usd += evt.tokens.costUsd || 0;
          }
          b.duration_secs += evt.durationSecs || 0;
          break;
        default:
          events--; // not counted
      }
    }
  }
}

const rows = [...buckets.entries()]
  .filter(([, b]) => Object.values(b).some((v) => v > 0))
  .sort(([a], [c]) => a.localeCompare(c));

let sql = `-- usage_daily backfill generated ${new Date().toISOString()}\n`;
sql += `-- ${rows.length} day-user rows from ${events} activity events (skipped ${skippedToday} same-day events)\n`;
sql += `BEGIN;\n`;
for (const [key, b] of rows) {
  const [date, phone] = key.split('|');
  sql += `INSERT INTO usage_daily (date, phone, messages_in, messages_out, tasks, completed_tasks, failed_tasks, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd, duration_secs)\n`;
  sql += `VALUES ('${date}', '${phone.replace(/'/g, "''")}', ${b.messages_in}, ${b.messages_out}, ${b.tasks}, ${b.completed_tasks}, ${b.failed_tasks}, ${b.input_tokens}, ${b.output_tokens}, ${b.cache_creation_tokens}, ${b.cache_read_tokens}, ${b.cost_usd.toFixed(6)}, ${b.duration_secs})\n`;
  sql += `ON CONFLICT (date, phone) DO UPDATE SET messages_in = EXCLUDED.messages_in, messages_out = EXCLUDED.messages_out, tasks = EXCLUDED.tasks, completed_tasks = EXCLUDED.completed_tasks, failed_tasks = EXCLUDED.failed_tasks, input_tokens = EXCLUDED.input_tokens, output_tokens = EXCLUDED.output_tokens, cache_creation_tokens = EXCLUDED.cache_creation_tokens, cache_read_tokens = EXCLUDED.cache_read_tokens, cost_usd = EXCLUDED.cost_usd, duration_secs = EXCLUDED.duration_secs;\n`;
}
sql += `COMMIT;\n`;

const outIdx = process.argv.indexOf('--out');
if (outIdx !== -1 && process.argv[outIdx + 1]) {
  fs.writeFileSync(process.argv[outIdx + 1], sql);
  console.error(`Wrote ${rows.length} rows to ${process.argv[outIdx + 1]}`);
} else {
  process.stdout.write(sql);
}
