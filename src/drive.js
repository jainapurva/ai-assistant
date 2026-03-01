/**
 * Google Drive integration — per-user OAuth via google-auth.js.
 *
 * Provides uploadFile and listFiles for the bot (file uploads, /drive command).
 * All operations use the user's own Google account via OAuth.
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const logger = require('./logger');
const googleAuth = require('./google-auth');

const ROOT_FOLDER_NAME = 'WhatsApp Bot';

// waId+groupId → Drive folder ID cache (reset on restart)
const folderIdCache = new Map();

function isConfigured() {
  return googleAuth.isConfigured();
}

async function findOrCreateFolder(driveApi, name, parentId) {
  const q = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;

  const res = await driveApi.files.list({
    q,
    fields: 'files(id, name)',
    pageSize: 1,
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const meta = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    meta.parents = [parentId];
  }

  const created = await driveApi.files.create({
    requestBody: meta,
    fields: 'id',
  });

  return created.data.id;
}

async function getGroupFolderId(driveApi, waId, groupId, groupName) {
  const cacheKey = `${waId}:${groupId}`;
  if (folderIdCache.has(cacheKey)) {
    return folderIdCache.get(cacheKey);
  }

  const rootId = await findOrCreateFolder(driveApi, ROOT_FOLDER_NAME, null);
  const label = groupName || groupId;
  const groupFolderId = await findOrCreateFolder(driveApi, label, rootId);

  folderIdCache.set(cacheKey, groupFolderId);
  return groupFolderId;
}

/**
 * Upload a file to the user's Drive under WhatsApp Bot/<group> folder.
 * @param {string} waId - User's WhatsApp ID (for OAuth)
 * @param {string} groupId - Chat/group ID (for folder organization)
 * @param {string} groupName - Display name for the folder
 * @param {string} filePath - Local file path
 * @returns {string} Drive view link, or error string
 */
async function uploadFile(waId, groupId, groupName, filePath) {
  if (!isConfigured()) {
    return 'Drive not configured: Google OAuth not set up.';
  }

  const client = googleAuth.createAuthenticatedClient(waId);
  if (!client) {
    return 'Drive not connected. Use /gmail login to connect your Google account.';
  }

  try {
    const driveApi = google.drive({ version: 'v3', auth: client });
    const folderId = await getGroupFolderId(driveApi, waId, groupId, groupName);
    const fileName = path.basename(filePath);
    const fileStream = fs.createReadStream(filePath);

    const res = await driveApi.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        body: fileStream,
      },
      fields: 'id, name',
    });

    const fileId = res.data.id;

    await driveApi.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    logger.info(`drive: uploaded "${fileName}" for ${waId} group ${groupId} → ${fileId}`);
    return `https://drive.google.com/file/d/${fileId}/view`;
  } catch (err) {
    logger.error(`drive: upload failed for ${filePath}: ${err.message}`);
    return `Drive upload error: ${err.message}`;
  }
}

/**
 * List files in the user's Drive folder for a group.
 * @param {string} waId - User's WhatsApp ID (for OAuth)
 * @param {string} groupId - Chat/group ID
 * @returns {Array|string} Array of file objects, or error string
 */
async function listFiles(waId, groupId) {
  if (!isConfigured()) {
    return 'Drive not configured: Google OAuth not set up.';
  }

  const client = googleAuth.createAuthenticatedClient(waId);
  if (!client) {
    return 'Drive not connected. Use /gmail login to connect your Google account.';
  }

  try {
    const driveApi = google.drive({ version: 'v3', auth: client });
    const folderId = await getGroupFolderId(driveApi, waId, groupId, groupId);

    const res = await driveApi.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, size, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
    });

    return (res.data.files || []).map(f => ({
      name: f.name,
      link: `https://drive.google.com/file/d/${f.id}/view`,
      size: f.size ? parseInt(f.size, 10) : 0,
      modifiedTime: f.modifiedTime,
    }));
  } catch (err) {
    logger.error(`drive: listFiles failed for ${waId} group ${groupId}: ${err.message}`);
    return `Drive list error: ${err.message}`;
  }
}

module.exports = { uploadFile, listFiles, isConfigured };
