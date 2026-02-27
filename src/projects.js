const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const HOME = process.env.HOME || '/home/ddarji';

// Directories to scan for CLAUDE.md files
const SCAN_DIRS = [
  HOME,
  '/media/ddarji/storage/git',
  '/media/ddarji/storage',
];

// Claude memory projects dir
const CLAUDE_PROJECTS_DIR = path.join(HOME, '.claude/projects');

// Directories that are NOT projects (too broad)
const IGNORE_DIRS = new Set([
  HOME,
  '/media/ddarji/storage',
  '/media/ddarji/storage/git',
  path.join(HOME, 'dhruvil'),
  path.join(HOME, 'dhruvil/storage'),
  path.join(HOME, 'dhruvil/storage/git'),
]);

/**
 * Discover all projects that have Claude context (CLAUDE.md, memory, etc.)
 * Returns array of { dir, name, hasClaudeMd, hasMemory }
 */
function discoverProjects() {
  const projects = new Map(); // resolved real path -> info

  // 1. Scan for CLAUDE.md files in known directories
  for (const scanDir of SCAN_DIRS) {
    if (!fs.existsSync(scanDir)) continue;
    scanForClaudeMd(scanDir, 3, projects);
  }

  // 2. Check Claude's own projects/memory directory
  if (fs.existsSync(CLAUDE_PROJECTS_DIR)) {
    try {
      const entries = fs.readdirSync(CLAUDE_PROJECTS_DIR);
      for (const entry of entries) {
        const decoded = decodeClaudeProjectPath(entry);
        if (decoded && fs.existsSync(decoded)) {
          const realDir = fs.realpathSync(decoded);
          if (IGNORE_DIRS.has(realDir)) continue;

          if (!projects.has(realDir)) {
            projects.set(realDir, {
              dir: realDir,
              name: path.basename(realDir),
              hasClaudeMd: fs.existsSync(path.join(realDir, 'CLAUDE.md')),
              hasMemory: false,
            });
          }
          const memDir = path.join(CLAUDE_PROJECTS_DIR, entry, 'memory');
          if (fs.existsSync(memDir)) {
            projects.get(realDir).hasMemory = true;
          }
        }
      }
    } catch (e) {
      logger.warn('Failed to scan Claude projects dir:', e.message);
    }
  }

  // Sort by name
  return Array.from(projects.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function scanForClaudeMd(dir, maxDepth, projects) {
  if (maxDepth <= 0) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const claudeMd = path.join(fullPath, 'CLAUDE.md');
        if (fs.existsSync(claudeMd)) {
          const realDir = fs.realpathSync(fullPath);
          if (IGNORE_DIRS.has(realDir)) continue;

          if (!projects.has(realDir)) {
            projects.set(realDir, {
              dir: realDir,
              name: entry.name,
              hasClaudeMd: true,
              hasMemory: false,
            });
          } else {
            projects.get(realDir).hasClaudeMd = true;
          }
        }
        if (maxDepth > 1) {
          scanForClaudeMd(fullPath, maxDepth - 1, projects);
        }
      }
    }
  } catch (e) {
    // Permission denied etc — skip
  }
}

/**
 * Decode Claude's mangled project path.
 * e.g. "-media-ddarji-storage-git-myapp" -> "/media/ddarji/storage/git/myapp"
 */
function decodeClaudeProjectPath(encoded) {
  const parts = encoded.split('-').filter(Boolean);
  let bestPath = null;
  let current = '';

  for (let i = 0; i < parts.length; i++) {
    const tryPath = current + '/' + parts[i];
    if (fs.existsSync(tryPath)) {
      current = tryPath;
      bestPath = current;
    } else {
      current = current + '-' + parts[i];
      if (fs.existsSync(current)) {
        bestPath = current;
      }
    }
  }

  return bestPath;
}

/**
 * Get a short description for a project by reading CLAUDE.md
 */
function getProjectSummary(dir) {
  const claudeMd = path.join(dir, 'CLAUDE.md');
  if (!fs.existsSync(claudeMd)) return '';

  try {
    const content = fs.readFileSync(claudeMd, 'utf8');
    const lines = content.split('\n');
    // Find first non-header, non-blank line
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        return trimmed.slice(0, 80);
      }
    }
  } catch (e) {}
  return '';
}

module.exports = { discoverProjects, getProjectSummary };
