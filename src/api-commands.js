/**
 * Controlled API access — TASK-003
 *
 * Specific server-side capabilities exposed only via explicit slash commands.
 * Each command uses a named API key — users never touch the keys directly.
 *
 * Available commands:
 *   /imagine <prompt>   — image generation via OpenAI DALL-E 3
 *
 * Per-group enable/disable stored in shared state.
 * Admins can toggle commands with /enable <command> and /disable <command>.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { updateSharedState, loadSharedState, withSharedStateLock } = require('./claude');

// Which API keys power which commands
const COMMAND_KEYS = {
  imagine: 'OPENAI_API_KEY',
};

// Commands enabled by default for all groups
const DEFAULT_ENABLED = new Set(['imagine']);

function getEnabledCommands(chatId) {
  const state = loadSharedState();
  const overrides = (state.commandOverrides || {})[chatId];
  if (!overrides) return new Set(DEFAULT_ENABLED);
  // Start from defaults, apply per-group overrides
  const enabled = new Set(DEFAULT_ENABLED);
  for (const cmd of (overrides.disabled || [])) enabled.delete(cmd);
  for (const cmd of (overrides.enabled || [])) enabled.add(cmd);
  return enabled;
}

function enableCommand(chatId, command) {
  updateSharedState(state => {
    if (!state.commandOverrides) state.commandOverrides = {};
    if (!state.commandOverrides[chatId]) state.commandOverrides[chatId] = { enabled: [], disabled: [] };
    const o = state.commandOverrides[chatId];
    o.disabled = o.disabled.filter(c => c !== command);
    if (!o.enabled.includes(command)) o.enabled.push(command);
  });
}

function disableCommand(chatId, command) {
  updateSharedState(state => {
    if (!state.commandOverrides) state.commandOverrides = {};
    if (!state.commandOverrides[chatId]) state.commandOverrides[chatId] = { enabled: [], disabled: [] };
    const o = state.commandOverrides[chatId];
    o.enabled = o.enabled.filter(c => c !== command);
    if (!o.disabled.includes(command)) o.disabled.push(command);
  });
}

function isCommandEnabled(chatId, command) {
  return getEnabledCommands(chatId).has(command);
}

// ── /imagine ─────────────────────────────────────────────────────────────────

async function imagine(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set on the server.');

  const body = JSON.stringify({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
    response_format: 'url',
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/images/generations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message));
          const url = json.data && json.data[0] && json.data[0].url;
          if (!url) return reject(new Error('No image URL in response'));
          resolve(url);
        } catch (e) {
          reject(new Error(`Failed to parse OpenAI response: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Download an image URL to a temp file, return the local path.
 */
async function downloadImageToTemp(url, tmpDir) {
  return new Promise((resolve, reject) => {
    const filename = `imagine_${Date.now()}.png`;
    const filePath = path.join(tmpDir, filename);
    const file = fs.createWriteStream(filePath);

    const get = (urlStr) => {
      const mod = urlStr.startsWith('https') ? https : require('http');
      mod.get(urlStr, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(filePath); });
        file.on('error', reject);
      }).on('error', reject);
    };

    get(url);
  });
}

module.exports = {
  imagine,
  downloadImageToTemp,
  isCommandEnabled,
  enableCommand,
  disableCommand,
  getEnabledCommands,
  COMMAND_KEYS,
};
