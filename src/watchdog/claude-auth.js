'use strict';

const { execFile } = require('child_process');
const config = require('./config');
const { checkClaudeAuth } = require('./checks');

/**
 * Attempt to fix Claude auth by running `claude --version`,
 * which triggers the CLI's built-in token auto-refresh.
 * @returns {{ fixed: boolean, message: string }}
 */
function attemptFix() {
  return new Promise((resolve) => {
    execFile(config.claudeBinary, ['--version'], { timeout: 30_000 }, (err) => {
      if (err) {
        resolve({ fixed: false, message: `claude --version failed: ${err.message}` });
        return;
      }

      // Re-check credentials after refresh attempt
      const result = checkClaudeAuth();
      if (result.ok) {
        resolve({ fixed: true, message: 'Claude token refreshed successfully' });
      } else {
        resolve({
          fixed: false,
          message: `Token still invalid after refresh: ${result.reason}\n\nManual fix:\n1. Run: claude login\n2. Or: claude auth login\n3. Check: cat ${config.credentialsFile}`,
        });
      }
    });
  });
}

module.exports = { attemptFix };
