/**
 * Client-Projects Registry
 *
 * Maps phone numbers to project directories so that when a registered client
 * messages the bot, Claude automatically works inside their project repo.
 *
 * Config lives in <project-root>/client-projects.json:
 * {
 *   "projects": {
 *     "project-id": {
 *       "name": "Human Name",
 *       "path": "/absolute/path/to/repo",
 *       "deploy": "./scripts/deploy.sh",   // optional
 *       "url": "https://live-site.com",     // optional
 *       "description": "Short description",
 *       "clients": ["+918979484010", ...]
 *     }
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const CONFIG_PATH = path.resolve(__dirname, '..', 'client-projects.json');

// In-memory index: normalized phone -> project config (with id)
let phoneIndex = new Map();
let projects = {};

/**
 * Normalize a phone number to the WhatsApp ID format (digits only, no +).
 * "+918979484010" -> "918979484010"
 * "918979484010@c.us" -> "918979484010"
 */
function normalizePhone(phone) {
  return phone.replace(/[^0-9]/g, '');
}

/**
 * Load (or reload) the config from disk and rebuild the phone index.
 */
function load() {
  phoneIndex = new Map();
  projects = {};

  if (!fs.existsSync(CONFIG_PATH)) {
    logger.info('client-projects: no config file found, skipping');
    return;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    projects = raw.projects || {};

    for (const [id, project] of Object.entries(projects)) {
      if (!project.path || !fs.existsSync(project.path)) {
        logger.warn(`client-projects: project "${id}" path does not exist: ${project.path}`);
        continue;
      }
      for (const phone of project.clients || []) {
        const normalized = normalizePhone(phone);
        if (phoneIndex.has(normalized)) {
          logger.warn(`client-projects: phone ${phone} mapped to multiple projects, using "${id}" (last wins)`);
        }
        phoneIndex.set(normalized, { ...project, id });
      }
    }

    logger.info(`client-projects: loaded ${Object.keys(projects).length} project(s), ${phoneIndex.size} client mapping(s)`);
  } catch (err) {
    logger.error(`client-projects: failed to load config: ${err.message}`);
  }
}

/**
 * Look up a project for a given phone number or chatId.
 * Accepts: "+918979484010", "918979484010", "918979484010@c.us"
 * Returns the project config object (with .id) or null.
 */
function getProjectForPhone(phoneOrChatId) {
  const digits = normalizePhone(phoneOrChatId);
  return phoneIndex.get(digits) || null;
}

/**
 * Get all projects.
 */
function getAllProjects() {
  return { ...projects };
}

/**
 * Get a project by ID.
 */
function getProject(id) {
  const p = projects[id];
  return p ? { ...p, id } : null;
}

/**
 * Add a client phone number to a project (persists to disk).
 */
function addClient(projectId, phone) {
  if (!projects[projectId]) {
    throw new Error(`Project "${projectId}" not found`);
  }

  const normalized = normalizePhone(phone);
  const original = phone.startsWith('+') ? phone : `+${phone}`;

  // Check if already mapped
  const existing = projects[projectId].clients || [];
  if (existing.some(p => normalizePhone(p) === normalized)) {
    return false; // already exists
  }

  projects[projectId].clients = [...existing, original];
  phoneIndex.set(normalized, { ...projects[projectId], id: projectId });
  _save();
  logger.info(`client-projects: added ${original} to project "${projectId}"`);
  return true;
}

/**
 * Remove a client phone number from a project (persists to disk).
 */
function removeClient(projectId, phone) {
  if (!projects[projectId]) {
    throw new Error(`Project "${projectId}" not found`);
  }

  const normalized = normalizePhone(phone);
  const existing = projects[projectId].clients || [];
  const filtered = existing.filter(p => normalizePhone(p) !== normalized);

  if (filtered.length === existing.length) {
    return false; // not found
  }

  projects[projectId].clients = filtered;
  phoneIndex.delete(normalized);
  _save();
  logger.info(`client-projects: removed ${phone} from project "${projectId}"`);
  return true;
}

/**
 * Add a new project to the registry (persists to disk).
 */
function addProject(id, config) {
  if (projects[id]) {
    throw new Error(`Project "${id}" already exists`);
  }
  if (!config.path || !fs.existsSync(config.path)) {
    throw new Error(`Project path does not exist: ${config.path}`);
  }

  projects[id] = {
    name: config.name || id,
    path: config.path,
    deploy: config.deploy || null,
    url: config.url || null,
    description: config.description || '',
    clients: config.clients || [],
  };

  // Index the clients
  for (const phone of projects[id].clients) {
    phoneIndex.set(normalizePhone(phone), { ...projects[id], id });
  }

  _save();
  logger.info(`client-projects: added project "${id}" with ${projects[id].clients.length} client(s)`);
}

/**
 * Persist current state to disk.
 */
function _save() {
  try {
    const data = { projects };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2) + '\n');
  } catch (err) {
    logger.error(`client-projects: failed to save config: ${err.message}`);
  }
}

// Load on require
load();

module.exports = {
  load,
  getProjectForPhone,
  getAllProjects,
  getProject,
  addClient,
  removeClient,
  addProject,
  normalizePhone,
};
