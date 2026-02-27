const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const logger = require('./logger');

const ROOT_FOLDER_NAME = 'WhatsApp Bot';

// groupId → Drive folder ID cache (reset on restart)
const folderIdCache = new Map();

// Cached auth client and drive instance
let _auth = null;
let _drive = null;

function getCredentialsPath() {
  if (process.env.GOOGLE_CREDENTIALS_FILE) {
    return process.env.GOOGLE_CREDENTIALS_FILE;
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const adc = path.join(
    process.env.HOME || '/root',
    '.config', 'gcloud', 'application_default_credentials.json'
  );
  if (fs.existsSync(adc)) {
    return adc;
  }
  return null;
}

function isConfigured() {
  return getCredentialsPath() !== null;
}

function getDriveClient() {
  if (_drive) return _drive;

  const credPath = getCredentialsPath();
  if (!credPath) {
    throw new Error('No Google credentials found. Set GOOGLE_CREDENTIALS_FILE or GOOGLE_APPLICATION_CREDENTIALS, or run gcloud auth application-default login.');
  }

  const scopes = ['https://www.googleapis.com/auth/drive.file'];

  const keyFile = fs.readFileSync(credPath, 'utf8');
  const parsed = JSON.parse(keyFile);

  // Application Default Credentials (gcloud) use a different structure than service accounts
  if (parsed.type === 'authorized_user') {
    _auth = new google.auth.OAuth2();
    _auth.setCredentials({
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      token_type: parsed.token_type,
    });
    // Attach client_id/secret so the client can auto-refresh
    _auth._clientId = parsed.client_id;
    _auth._clientSecret = parsed.client_secret;
  } else {
    _auth = new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes,
    });
  }

  _drive = google.drive({ version: 'v3', auth: _auth });
  return _drive;
}

async function findOrCreateFolder(drive, name, parentId) {
  const q = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;

  const res = await drive.files.list({
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

  const created = await drive.files.create({
    requestBody: meta,
    fields: 'id',
  });

  return created.data.id;
}

async function getGroupFolderId(drive, groupId, groupName) {
  if (folderIdCache.has(groupId)) {
    return folderIdCache.get(groupId);
  }

  const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME, null);
  const label = groupName || groupId;
  const groupFolderId = await findOrCreateFolder(drive, label, rootId);

  folderIdCache.set(groupId, groupFolderId);
  return groupFolderId;
}

async function uploadFile(groupId, groupName, filePath) {
  if (!isConfigured()) {
    return 'Drive not configured: no Google credentials found.';
  }

  let drive;
  try {
    drive = getDriveClient();
  } catch (err) {
    logger.error(`drive: auth error: ${err.message}`);
    return `Drive auth error: ${err.message}`;
  }

  try {
    const folderId = await getGroupFolderId(drive, groupId, groupName);
    const fileName = path.basename(filePath);
    const fileStream = fs.createReadStream(filePath);

    const res = await drive.files.create({
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

    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    logger.info(`drive: uploaded "${fileName}" for group ${groupId} → ${fileId}`);
    return `https://drive.google.com/file/d/${fileId}/view`;
  } catch (err) {
    logger.error(`drive: upload failed for ${filePath}: ${err.message}`);
    return `Drive upload error: ${err.message}`;
  }
}

async function listFiles(groupId) {
  if (!isConfigured()) {
    return 'Drive not configured: no Google credentials found.';
  }

  let drive;
  try {
    drive = getDriveClient();
  } catch (err) {
    logger.error(`drive: auth error: ${err.message}`);
    return `Drive auth error: ${err.message}`;
  }

  try {
    // groupName not available here, but the cache may already have it.
    // If not cached, fall back to groupId as folder label — folder may not exist yet.
    const folderId = await getGroupFolderId(drive, groupId, groupId);

    const res = await drive.files.list({
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
    logger.error(`drive: listFiles failed for group ${groupId}: ${err.message}`);
    return `Drive list error: ${err.message}`;
  }
}

module.exports = { uploadFile, listFiles, isConfigured };
