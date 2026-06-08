// SDK permission guard — defense-in-depth `canUseTool` callback.
//
// The actual security boundary is the systemd unit hardening (InaccessiblePaths
// / ReadOnlyPaths on .env, src/, *-tokens.json, etc). This callback is an
// application-layer guard that catches the obvious cases earlier and gives
// Claude a clean deny message instead of EACCES. A bug here is NOT a security
// hole as long as systemd hardening is in place.
//
// Rules:
//   - Write/Edit/MultiEdit/NotebookEdit: target file_path MUST resolve inside cwd.
//   - Bash: heuristic deny for privilege escalation, secret access, writes to
//     repo/system paths, and env dumps.
//   - Read: deny known-secret filenames (.env, *-tokens.json, .credentials.json, etc).

const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'MultiEdit']);

const SECRET_BASENAMES = new Set([
  '.env',
  '.env.example',
  '.keys',
  '.bot-shared-state.json',
  'bot_state.json',
  'resend-keys.json',
  'user-profiles.json',
  'client-projects.json',
  'github-installations.json',
  'freetools-accounts.json',
  '.credentials.json',
  '.git-credentials',
]);

const SECRET_SUFFIXES = ['-tokens.json'];

const BASH_DENY_PATTERNS = [
  // Privilege escalation / service / process management
  /\b(sudo|doas|pkexec|systemctl|service\s|setcap|setuid|chattr)\b/i,
  // Env dumps that would leak secrets from process.env
  /\b(printenv|env\s*(\||$|>|&&|;))/,
  // Referencing well-known secret env vars
  /\$\{?(ANTHROPIC|META|WHATSAPP|RESEND|GOOGLE|MICROSOFT|GITHUB|SHOPIFY|INTERNAL_API|OPENAI)_[A-Z_]*(TOKEN|SECRET|KEY|PASSWORD)/,
  // Reading credential-bearing files
  /\b(cat|less|more|head|tail|xxd|od|hexdump)\b[^|&;]{0,80}\.(env|keys|pem|ppk|p12|jks|credentials|git-credentials)\b/,
  // Writes/copies/deletes targeting system or repo-internal paths
  />>?\s*(\/etc|\/usr|\/var|\/opt|\/root|\/home|\/media\/ddarji\/storage\/ai-assistant\/(?!sandboxes\/))/,
  /\b(tee|dd|cp|mv|rm|ln|install|rsync|chmod|chown)\b[^|&;]{0,200}\s(\/etc|\/usr|\/var|\/opt|\/root|\/home|\/boot)\b/,
  // Touch/write into the bot's own repo or state files
  /\/media\/ddarji\/storage\/ai-assistant\/(\.env|\.keys|src\/|dist\/|node_modules\/|package(-lock)?\.json|bot_state\.json|[a-z-]+-tokens\.json|[a-z-]+-installations\.json|[a-z-]+-accounts\.json)/,
  // Network exfil binaries (heuristic — Claude rarely needs these for legitimate user tasks)
  /\b(scp|nc\s|ncat\s|netcat\s|ssh\s)/,
];

function resolveSafe(filePath, cwd) {
  if (!filePath || typeof filePath !== 'string') return null;
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  try {
    return fs.realpathSync(abs);
  } catch {
    // Path may not exist yet (Write creating a new file). Resolve the parent.
    try {
      const realParent = fs.realpathSync(path.dirname(abs));
      return path.join(realParent, path.basename(abs));
    } catch {
      return path.normalize(abs);
    }
  }
}

function isInside(target, root) {
  if (!target || !root) return false;
  const realRoot = (() => { try { return fs.realpathSync(root); } catch { return path.normalize(root); } })();
  const rel = path.relative(realRoot, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isSecretBasename(basename) {
  if (SECRET_BASENAMES.has(basename)) return true;
  return SECRET_SUFFIXES.some((s) => basename.endsWith(s));
}

function createGuard(cwd, chatId = 'unknown') {
  return async function canUseTool(toolName, input) {
    try {
      // 1. File-writing tools — target must resolve inside cwd
      if (WRITE_TOOLS.has(toolName)) {
        const filePath = input.file_path || input.notebook_path;
        const resolved = resolveSafe(filePath, cwd);
        if (!resolved || !isInside(resolved, cwd)) {
          logger.warn(`[sdk-guard] DENY ${toolName} chat=${chatId} path=${filePath} resolved=${resolved}`);
          return {
            behavior: 'deny',
            message: `Write blocked: "${filePath}" is outside your workspace. You can only create or modify files inside your own working directory.`,
          };
        }
      }

      // 2. Read — deny known-secret files anywhere on disk
      if (toolName === 'Read') {
        const filePath = input.file_path;
        const resolved = resolveSafe(filePath, cwd);
        if (resolved && isSecretBasename(path.basename(resolved))) {
          logger.warn(`[sdk-guard] DENY Read chat=${chatId} secret=${resolved}`);
          return {
            behavior: 'deny',
            message: `Read blocked: ${path.basename(resolved)} contains credentials or system state and cannot be accessed.`,
          };
        }
      }

      // 3. Bash — heuristic pattern deny
      if (toolName === 'Bash') {
        const cmd = typeof input.command === 'string' ? input.command : '';
        for (const pat of BASH_DENY_PATTERNS) {
          if (pat.test(cmd)) {
            logger.warn(`[sdk-guard] DENY Bash chat=${chatId} pattern=${pat} cmd=${cmd.slice(0, 200)}`);
            return {
              behavior: 'deny',
              message: `Bash blocked: this command appears to access system files, secrets, or operate outside your workspace. Only commands inside your workspace are allowed.`,
            };
          }
        }
      }
    } catch (err) {
      logger.warn(`[sdk-guard] guard error: ${err.message} — denying by default`);
      return { behavior: 'deny', message: 'Permission check failed.' };
    }

    // NOTE: updatedInput is required by the CLI's runtime Zod schema for the
    // 'allow' branch (sdk.d.ts marks it optional, but omitting it fails
    // validation with "Tool permission request failed: ZodError" and the tool
    // call errors out — this silently broke all MCP tools).
    return { behavior: 'allow', updatedInput: input };
  };
}

module.exports = {
  createGuard,
  // exported for tests
  _internals: { isInside, resolveSafe, isSecretBasename, BASH_DENY_PATTERNS, WRITE_TOOLS },
};
