/**
 * User profiles — TASK-013 (registration) + TASK-010 (profile cards)
 *
 * Profile stored per WhatsApp number in a shared JSON file.
 * Auto-created on first message; enriched via /register.
 *
 * Schema:
 * {
 *   "<number>@c.us": {
 *     waId: "...",
 *     displayName: "Apurva",          // set via /register or WA push name
 *     email: "a@b.com",               // optional, set via /register
 *     registeredAt: "2026-...",        // ISO timestamp of /register call
 *     firstSeenAt: "2026-...",         // ISO timestamp of first message
 *     approved: true,                  // admin-approved (or auto-approved)
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

const PROFILES_FILE = path.join(config.stateDir, 'user-profiles.json');

function loadProfiles() {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
    }
  } catch (e) {
    logger.warn('Failed to load profiles:', e.message);
  }
  return {};
}

function saveProfiles(profiles) {
  try {
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
  } catch (e) {
    logger.warn('Failed to save profiles:', e.message);
  }
}

/**
 * Returns the profile for a WA ID, or null if not found.
 */
function getProfile(waId) {
  return loadProfiles()[waId] || null;
}

/**
 * Ensures a profile exists for a WA ID (auto-created on first seen).
 * Uses WA push name as display name if available.
 */
function ensureProfile(waId, pushName) {
  const profiles = loadProfiles();
  if (!profiles[waId]) {
    profiles[waId] = {
      waId,
      displayName: pushName || waId.replace('@c.us', ''),
      email: null,
      registeredAt: null,   // null until /register is called
      firstSeenAt: new Date().toISOString(),
      approved: true,        // auto-approved for now
    };
    saveProfiles(profiles);
    logger.info(`Profile auto-created for ${waId}`);
  } else if (pushName && !profiles[waId].registeredAt) {
    // Update display name from WA if they haven't registered yet
    profiles[waId].displayName = pushName;
    saveProfiles(profiles);
  }
  return profiles[waId];
}

/**
 * Registers a user with a chosen display name and optional email.
 * Returns the updated profile.
 */
function registerUser(waId, displayName, email) {
  const profiles = loadProfiles();
  const existing = profiles[waId] || { waId, firstSeenAt: new Date().toISOString(), approved: true };
  profiles[waId] = {
    ...existing,
    displayName: displayName.trim(),
    email: email ? email.trim().toLowerCase() : existing.email || null,
    registeredAt: existing.registeredAt || new Date().toISOString(),
  };
  saveProfiles(profiles);
  logger.info(`User registered: ${waId} as "${displayName}"`);
  return profiles[waId];
}

/**
 * Returns all profiles (for admin use).
 */
function getAllProfiles() {
  return loadProfiles();
}

/**
 * Formats a profile card as WhatsApp message text.
 */
function formatProfileCard(profile, tokenUsage) {
  const reg = profile.registeredAt
    ? `✅ Registered ${new Date(profile.registeredAt).toLocaleDateString()}`
    : '⏳ Not registered yet — use /register <name>';
  const tokens = tokenUsage
    ? `📊 *Usage:* ${(tokenUsage.input + tokenUsage.output).toLocaleString()} tokens across ${tokenUsage.tasks} task(s)`
    : '📊 *Usage:* no data yet';
  const email = profile.email ? `📧 ${profile.email}` : '';

  return [
    `👤 *${profile.displayName}*`,
    `📱 ${profile.waId.replace('@c.us', '')}`,
    reg,
    email,
    tokens,
    `🕐 First seen: ${new Date(profile.firstSeenAt).toLocaleDateString()}`,
  ].filter(Boolean).join('\n');
}

module.exports = { getProfile, ensureProfile, registerUser, getAllProfiles, formatProfileCard };
