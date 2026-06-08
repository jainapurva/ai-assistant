// Host a user's GitHub repo as a static site at <sub>.swayat.com.
//
// Flow: validate → claim/own subdomain → clone repo → build in bwrap → deploy
//   via the deploy-subdomain skill. Owner = chatId who first claimed the sub.
//
// MVP scope (deferred to later iterations):
//   - Per-user GitHub OAuth (currently uses the host's `gh` auth)
//   - Dynamic frameworks (only Vite/CRA-style static dist/build supported)
//   - Resource quotas (timeout 300 only — no CPU/memory caps yet)

const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const config = require('./config');
const logger = require('./logger');

const DOMAIN = 'swayat.com';
const REGISTRY_PATH = path.join(config.stateDir, 'host-registry.json');
const BUILDS_DIR = '/tmp/swayat-builds';
const DEPLOY_SCRIPT = '/home/ddarji/.claude/skills/deploy-subdomain/deploy.sh';
const BUILD_TIMEOUT_SEC = 300;
const RESERVED_SUBS = new Set([
  'www', 'api', 'admin', 'app', 'cdn', 'root',
  'mail', 'mx', 'smtp', 'imap', 'pop', 'pop3',
  'ns', 'ns1', 'ns2', 'ns3',
  'localhost', 'test', 'staging', 'dev',
  // Founder domains — reserved, not claimable by users
  'apurva', 'dhruvil',
]);

// ── Registry ────────────────────────────────────────────────────────────────

function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')); }
  catch { return {}; }
}

function saveRegistry(reg) {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}

function recordDeploy(fqdn, chatId, repoUrl) {
  const reg = loadRegistry();
  const existing = reg[fqdn] || {};
  reg[fqdn] = {
    chatId,
    repoUrl,
    firstDeployedAt: existing.firstDeployedAt || new Date().toISOString(),
    lastDeployedAt: new Date().toISOString(),
  };
  saveRegistry(reg);
}

// ── Validation ──────────────────────────────────────────────────────────────

function validateSubdomain(sub) {
  if (!sub) return 'subdomain is required';
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(sub)) {
    return 'subdomain must be lowercase letters, digits, hyphens (start with letter/digit, max 63 chars)';
  }
  if (RESERVED_SUBS.has(sub)) return `'${sub}' is a reserved subdomain`;
  return null;
}

function parseRepoUrl(input) {
  // Accept: https://github.com/owner/repo, https://github.com/owner/repo.git, owner/repo, git@github.com:owner/repo.git
  const trimmed = String(input || '').trim().replace(/\.git$/, '');
  let m;
  if ((m = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)/i))) return `${m[1]}/${m[2]}`;
  if ((m = trimmed.match(/^git@github\.com:([^/]+)\/([^/?#]+)/i))) return `${m[1]}/${m[2]}`;
  if ((m = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/))) return `${m[1]}/${m[2]}`;
  return null;
}

// ── Build sandbox (bwrap) ───────────────────────────────────────────────────

function buildInBwrap(repoDir) {
  const nodeBinDir = path.dirname(config.nodeBinaryPath);
  const args = [
    '--ro-bind', '/usr', '/usr',
    '--ro-bind', '/lib', '/lib',
    ...(fs.existsSync('/lib64') ? ['--ro-bind', '/lib64', '/lib64'] : []),
    '--ro-bind', '/bin', '/bin',
    '--ro-bind', '/sbin', '/sbin',
    '--ro-bind', '/etc', '/etc',
    ...(fs.existsSync('/run/systemd/resolve') ? ['--ro-bind', '/run/systemd/resolve', '/run/systemd/resolve'] : []),
    '--proc', '/proc',
    '--dev', '/dev',
    '--tmpfs', '/tmp',
    '--ro-bind', nodeBinDir, '/opt/node/bin',
    '--bind', repoDir, '/workspace',
    '--chdir', '/workspace',
    '--unshare-pid', '--unshare-ipc', '--unshare-uts',
    '--setenv', 'HOME', '/workspace',
    '--setenv', 'PATH', '/opt/node/bin:/usr/local/bin:/usr/bin:/bin',
    '--setenv', 'NPM_CONFIG_CACHE', '/workspace/.npm-cache',
    '--setenv', 'CI', 'true',
    '--',
    '/usr/bin/timeout', String(BUILD_TIMEOUT_SEC),
    '/bin/sh', '-c',
    'npm ci --no-audit --no-fund --prefer-offline 2>&1 && npm run build 2>&1',
  ];

  return new Promise((resolve) => {
    const proc = spawn('bwrap', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      const tail = (stdout + '\n' + stderr).split('\n').slice(-30).join('\n');
      resolve({ ok: code === 0, code, log: tail });
    });
    proc.on('error', (err) => resolve({ ok: false, code: -1, log: `bwrap spawn failed: ${err.message}` }));
  });
}

function detectBuildOutput(repoDir) {
  for (const candidate of ['dist', 'build', 'out']) {
    const p = path.join(repoDir, candidate);
    if (fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) return p;
  }
  return null;
}

// ── Deploy hand-off ─────────────────────────────────────────────────────────

function runDeployScript(sub, outputDir) {
  return new Promise((resolve) => {
    const proc = spawn('bash', [DEPLOY_SCRIPT, sub, DOMAIN, outputDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      resolve({ ok: code === 0, code, log: (stdout + '\n' + stderr) });
    });
    proc.on('error', (err) => resolve({ ok: false, code: -1, log: `deploy spawn failed: ${err.message}` }));
  });
}

// ── Main entry ──────────────────────────────────────────────────────────────

/**
 * Host a GitHub repo at <sub>.swayat.com.
 * @param {object} opts
 * @param {string} opts.chatId - WhatsApp chat ID (becomes the subdomain owner on first deploy)
 * @param {string} opts.repoInput - GitHub URL or "owner/repo"
 * @param {string} opts.sub - Requested subdomain
 * @param {function} [opts.onProgress] - Optional callback for progress messages (str) => void
 * @returns {Promise<{success: boolean, url?: string, message: string}>}
 */
async function hostSubdomain({ chatId, repoInput, sub, onProgress = () => {} }) {
  // Validate subdomain
  const subErr = validateSubdomain(sub);
  if (subErr) return { success: false, message: `❌ ${subErr}` };

  // Parse repo
  const repo = parseRepoUrl(repoInput);
  if (!repo) return { success: false, message: '❌ Invalid GitHub repo. Use `owner/repo` or `https://github.com/owner/repo`.' };

  const fqdn = `${sub}.${DOMAIN}`;

  // Ownership check
  const reg = loadRegistry();
  if (reg[fqdn] && reg[fqdn].chatId !== chatId) {
    return { success: false, message: `❌ ${fqdn} is already owned by another user.` };
  }

  fs.mkdirSync(BUILDS_DIR, { recursive: true });
  const stamp = Date.now();
  const repoDir = path.join(BUILDS_DIR, `${sub}-${stamp}`);

  try {
    // Clone (uses host gh CLI auth — works for public + repos accessible to authed gh accounts)
    onProgress(`📥 Cloning ${repo}...`);
    try {
      execFileSync('gh', ['repo', 'clone', repo, repoDir, '--', '--depth', '1'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120000,
      });
    } catch (e) {
      const stderr = (e.stderr || '').toString();
      return { success: false, message: `❌ Clone failed: ${stderr.split('\n')[0] || e.message}` };
    }

    // Need a package.json to run build
    if (!fs.existsSync(path.join(repoDir, 'package.json'))) {
      // No build needed — assume index.html at repo root
      if (!fs.existsSync(path.join(repoDir, 'index.html'))) {
        return { success: false, message: '❌ Repo has no `package.json` and no top-level `index.html` — nothing to deploy.' };
      }
      onProgress('📄 No build needed (static index.html)');
      const deployRes = await runDeployScript(sub, repoDir);
      if (!deployRes.ok) {
        return { success: false, message: `❌ Deploy failed:\n${deployRes.log.split('\n').slice(-8).join('\n')}` };
      }
      recordDeploy(fqdn, chatId, repo);
      return { success: true, url: `https://${fqdn}`, message: `✅ Live: https://${fqdn}` };
    }

    // Build in bwrap
    onProgress('🔨 Building in sandbox (npm ci && npm run build)...');
    const buildRes = await buildInBwrap(repoDir);
    if (!buildRes.ok) {
      return { success: false, message: `❌ Build failed (exit ${buildRes.code}):\n\`\`\`\n${buildRes.log}\n\`\`\`` };
    }

    const outDir = detectBuildOutput(repoDir);
    if (!outDir) {
      return { success: false, message: '❌ Build succeeded but no `dist/`, `build/`, or `out/` directory with `index.html` was produced.' };
    }

    // Deploy
    onProgress(`🚀 Deploying to ${fqdn}...`);
    const deployRes = await runDeployScript(sub, outDir);
    if (!deployRes.ok) {
      return { success: false, message: `❌ Deploy failed:\n\`\`\`\n${deployRes.log.split('\n').slice(-12).join('\n')}\n\`\`\`` };
    }

    recordDeploy(fqdn, chatId, repo);
    return { success: true, url: `https://${fqdn}`, message: `✅ Live: https://${fqdn}\n\nRe-run \`/host ${repo} ${sub}\` to update.` };
  } finally {
    // Always clean up clone (free disk in /tmp)
    try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch (e) { logger.warn(`host-subdomain: cleanup failed: ${e.message}`); }
  }
}

module.exports = {
  hostSubdomain,
  loadRegistry,
  validateSubdomain,
  parseRepoUrl,
  DOMAIN,
};
