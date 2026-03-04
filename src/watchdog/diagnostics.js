'use strict';

const fs = require('fs');
const https = require('https');
const config = require('./config');

/**
 * Read the last N lines from the bot log file.
 */
function readLogTail(lines = config.diagnosticLogLines) {
  try {
    if (!fs.existsSync(config.botLogFile)) return '(no log file found)';
    const content = fs.readFileSync(config.botLogFile, 'utf8');
    const allLines = content.split('\n');
    return allLines.slice(-lines).join('\n');
  } catch (err) {
    return `(error reading log: ${err.message})`;
  }
}

/**
 * Get OpenAI API key from .env file.
 */
function getOpenAIKey() {
  try {
    const envPath = require('path').join(config.botDir, '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^\s*OPENAI_API_KEY\s*=\s*(.+?)\s*$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Call OpenAI GPT-4o for root cause analysis.
 * Direct HTTPS — zero SDK dependencies.
 * @param {string} context - Error context description
 * @returns {Promise<string>} Diagnosis text
 */
function diagnose(context) {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    return Promise.resolve('(OpenAI API key not configured — add OPENAI_API_KEY to .env for AI diagnostics)');
  }

  const logTail = readLogTail();

  const body = JSON.stringify({
    model: config.openaiModel,
    max_tokens: config.openaiMaxTokens,
    messages: [
      {
        role: 'system',
        content: 'You are a DevOps diagnostician. Analyze the error context and log output to determine the root cause and suggest a fix. Be concise — max 3-4 sentences.',
      },
      {
        role: 'user',
        content: `Error context: ${context}\n\nLast ${config.diagnosticLogLines} lines of bot.log:\n\`\`\`\n${logTail}\n\`\`\`\n\nWhat is the root cause and how to fix it?`,
      },
    ],
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.choices?.[0]?.message?.content || '(no diagnosis returned)';
          resolve(text);
        } catch {
          resolve(`(failed to parse OpenAI response: ${data.slice(0, 200)})`);
        }
      });
    });

    req.on('error', (err) => {
      resolve(`(OpenAI API error: ${err.message})`);
    });

    req.setTimeout(30_000, () => {
      req.destroy();
      resolve('(OpenAI API timeout)');
    });

    req.write(body);
    req.end();
  });
}

module.exports = { diagnose, readLogTail, getOpenAIKey };
