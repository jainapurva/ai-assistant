const http = require('http');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const BaseProvider = require('./base-provider');
const logger = require('../logger');

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const MEDIA_DIR = path.join(__dirname, '..', '..', 'media_tmp');
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

/**
 * Meta WhatsApp Cloud API provider.
 *
 * Uses a webhook server to receive messages and the Graph API to send them.
 * DM-only in v1 (Cloud API has limited group support).
 */
class CloudAPIProvider extends BaseProvider {

  constructor(config) {
    super(config);
    this.name = 'cloud-api';
    this.accessToken = config.metaAccessToken;
    this.appSecret = config.metaAppSecret;
    this.phoneNumberId = config.metaPhoneNumberId;
    this.verifyToken = config.metaWebhookVerifyToken;
    this.webhookPort = config.webhookPort != null ? config.webhookPort : 3000;
    this.server = null;
    this.connected = false;

    // Custom routes registered by other modules (e.g. OAuth callbacks)
    this._customRoutes = [];

    // Dedup: track processed message IDs (Meta can send duplicates / retries)
    this._processedMessages = new Set();
    this._processedMessagesTTL = 5 * 60 * 1000; // 5 min
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this._handleRequest(req, res));

      this.server.listen(this.webhookPort, () => {
        logger.info(`Cloud API webhook server listening on port ${this.webhookPort}`);
        this.connected = true;
        this.emit('ready');
        resolve();
      });

      this.server.on('error', (err) => {
        logger.error('Webhook server error:', err.message);
        reject(err);
      });
    });
  }

  async destroy() {
    this.connected = false;
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info('Cloud API webhook server closed');
          resolve();
        });
      });
    }
  }

  async getState() {
    return this.connected ? 'CONNECTED' : 'DISCONNECTED';
  }

  // ---------- Route registration ----------

  /**
   * Register a custom route on the webhook HTTP server.
   * @param {string} method - HTTP method (GET, POST, etc.)
   * @param {string} pathPrefix - URL path prefix to match
   * @param {Function} handler - (req, res) handler function
   */
  addRoute(method, pathPrefix, handler) {
    this._customRoutes.push({ method: method.toUpperCase(), pathPrefix, handler });
    logger.info(`Registered route: ${method.toUpperCase()} ${pathPrefix}`);
  }

  // ---------- HTTP request handler ----------

  _handleRequest(req, res) {
    if (req.method === 'GET' && req.url.startsWith('/webhook')) {
      this._handleVerification(req, res);
    } else if (req.method === 'POST' && req.url.startsWith('/webhook')) {
      this._handleWebhook(req, res);
    } else {
      // Check custom routes before returning 404
      for (const route of this._customRoutes) {
        if (req.method === route.method && req.url.startsWith(route.pathPrefix)) {
          route.handler(req, res);
          return;
        }
      }
      res.writeHead(404);
      res.end();
    }
  }

  /** GET /webhook — Meta verification challenge */
  _handleVerification(req, res) {
    const url = new URL(req.url, `http://localhost:${this.webhookPort}`);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === this.verifyToken) {
      logger.info('Webhook verification successful');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
    } else {
      logger.warn('Webhook verification failed — token mismatch');
      res.writeHead(403);
      res.end();
    }
  }

  /** POST /webhook — Incoming messages */
  _handleWebhook(req, res) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      // Validate signature if app secret is configured
      if (this.appSecret) {
        const signature = req.headers['x-hub-signature-256'];
        if (!this._verifySignature(body, signature)) {
          logger.warn('Webhook signature validation failed');
          res.writeHead(403);
          res.end();
          return;
        }
      }

      // Always respond 200 quickly to avoid Meta retries
      res.writeHead(200);
      res.end();

      try {
        const payload = JSON.parse(body);
        this._processPayload(payload);
      } catch (e) {
        logger.error('Failed to parse webhook payload:', e.message);
      }
    });
  }

  _verifySignature(body, signature) {
    if (!signature) return false;
    const expected = 'sha256=' + crypto
      .createHmac('sha256', this.appSecret)
      .update(body)
      .digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  // ---------- Process incoming webhook payload ----------

  _processPayload(payload) {
    if (!payload.entry) return;

    for (const entry of payload.entry) {
      if (!entry.changes) continue;
      for (const change of entry.changes) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value || !value.messages) continue;

        const metadata = value.metadata || {};
        const contacts = value.contacts || [];

        for (const msg of value.messages) {
          this._processMessage(msg, metadata, contacts);
        }
      }
    }
  }

  _processMessage(msg, metadata, contacts) {
    // Dedup
    if (this._processedMessages.has(msg.id)) return;
    this._processedMessages.add(msg.id);
    setTimeout(() => this._processedMessages.delete(msg.id), this._processedMessagesTTL);

    // Resolve sender name from contacts array
    const contactInfo = contacts.find(c => c.wa_id === msg.from);
    const pushName = contactInfo ? contactInfo.profile.name : null;

    // Normalize phone number to chatId format: number@c.us
    const senderId = msg.from + '@c.us';
    const chatId = senderId; // Cloud API v1 is DM-only

    // Extract message body based on type
    let type = 'chat';
    let body = '';
    let hasMedia = false;

    if (msg.type === 'text' && msg.text) {
      body = msg.text.body || '';
    } else if (msg.type === 'image') {
      type = 'image';
      hasMedia = true;
      body = (msg.image && msg.image.caption) || '';
    } else if (msg.type === 'document') {
      type = 'document';
      hasMedia = true;
      body = (msg.document && msg.document.caption) || '';
    } else if (msg.type === 'audio' || msg.type === 'voice') {
      type = 'audio';
      hasMedia = true;
    } else if (msg.type === 'video') {
      type = 'video';
      hasMedia = true;
      body = (msg.video && msg.video.caption) || '';
    } else if (msg.type === 'interactive') {
      // Button / list reply
      if (msg.interactive && msg.interactive.button_reply) {
        body = msg.interactive.button_reply.title || '';
      } else if (msg.interactive && msg.interactive.list_reply) {
        body = msg.interactive.list_reply.title || '';
      }
    } else {
      // Unsupported message type — skip
      logger.info(`Ignoring unsupported Cloud API message type: ${msg.type}`);
      return;
    }

    const normalized = {
      id: msg.id,
      chatId,
      senderId,
      type,
      body: body.trim(),
      fromMe: false, // Cloud API webhook only receives incoming messages
      isGroup: false, // v1 is DM-only
      hasMedia,
      author: null,
      pushName: pushName,
      _raw: msg,
      _metadata: metadata,
    };

    logger.info(`Cloud API message [${chatId}]: type=${type}, from=${senderId}, body="${body.slice(0, 100)}"`);
    this.emit('message', normalized);
  }

  // ---------- Sending ----------

  async sendMessage(chatId, text) {
    const to = chatId.replace('@c.us', '');
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    };

    const result = await this._graphPost(`/${this.phoneNumberId}/messages`, payload);
    return result && result.messages && result.messages[0]
      ? result.messages[0].id
      : null;
  }

  async replyToMessage(originalMsg, text) {
    const to = originalMsg.chatId.replace('@c.us', '');
    const msgId = originalMsg.id || (originalMsg._raw && originalMsg._raw.id);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    };

    // Add context for reply threading if we have the original message ID
    if (msgId) {
      payload.context = { message_id: msgId };
    }

    await this._graphPost(`/${this.phoneNumberId}/messages`, payload);
  }

  async sendMedia(chatId, filePath, opts = {}) {
    const to = chatId.replace('@c.us', '');
    const mediaId = await this._uploadMedia(filePath);
    if (!mediaId) throw new Error('Failed to upload media');

    const ext = path.extname(filePath).toLowerCase();
    let mediaType = 'document';
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) mediaType = 'image';
    else if (['.mp4'].includes(ext)) mediaType = 'video';
    else if (['.ogg', '.mp3'].includes(ext)) mediaType = 'audio';

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: mediaType,
      [mediaType]: { id: mediaId },
    };

    if (opts.caption && mediaType !== 'audio') {
      payload[mediaType].caption = opts.caption;
    }
    if (opts.sendMediaAsDocument) {
      payload.type = 'document';
      payload.document = { id: mediaId };
      if (opts.caption) payload.document.caption = opts.caption;
      payload.document.filename = path.basename(filePath);
    }

    await this._graphPost(`/${this.phoneNumberId}/messages`, payload);
  }

  async replyWithMedia(originalMsg, filePath, opts = {}) {
    // Cloud API doesn't support reply-to for media in the same way — just send
    await this.sendMedia(originalMsg.chatId, filePath, opts);
  }

  /**
   * Polls are not supported in Cloud API.
   * Fall back to a numbered text list.
   */
  async sendPoll(chatId, question, options) {
    let text = `*${question}*\n\n`;
    options.forEach((opt, i) => {
      text += `${i + 1}. ${opt}\n`;
    });
    text += `\n_Reply with a number (1-${options.length}) to choose._`;
    await this.sendMessage(chatId, text);
    logger.info(`Poll (as text) sent: "${question}" with ${options.length} options`);
  }

  async sendTyping(chatId) {
    // Cloud API doesn't have a typing indicator endpoint
  }

  async clearTyping(chatId) {
    // No-op
  }

  async getChatName(chatId) {
    // Cloud API doesn't provide chat names — just return the number
    return chatId.replace('@c.us', '');
  }

  async getContactName(senderId) {
    return senderId.replace('@c.us', '');
  }

  /**
   * Download media from a Cloud API message.
   * Two-step: GET media URL from Graph API, then download the binary.
   */
  async downloadMedia(normalizedMsg) {
    try {
      const raw = normalizedMsg._raw;
      let mediaId = null;

      if (raw.image && raw.image.id) mediaId = raw.image.id;
      else if (raw.document && raw.document.id) mediaId = raw.document.id;
      else if (raw.audio && raw.audio.id) mediaId = raw.audio.id;
      else if (raw.video && raw.video.id) mediaId = raw.video.id;
      else if (raw.voice && raw.voice.id) mediaId = raw.voice.id;

      if (!mediaId) {
        logger.warn('No media ID found in message');
        return null;
      }

      // Step 1: Get media URL
      const mediaInfo = await this._graphGet(`/${mediaId}`);
      if (!mediaInfo || !mediaInfo.url) {
        logger.error('Could not get media URL from Graph API');
        return null;
      }

      // Step 2: Download the binary
      const ext = this._mimeToExt(mediaInfo.mime_type);
      const filename = `wa_${Date.now()}${ext}`;
      const filepath = path.join(MEDIA_DIR, filename);

      await this._downloadFile(mediaInfo.url, filepath);
      logger.info(`Cloud API media saved: ${filepath} (${mediaInfo.mime_type})`);
      return filepath;
    } catch (e) {
      logger.error('Failed to download Cloud API media:', e.message);
      return null;
    }
  }

  /**
   * Cloud API: all DMs are allowed, no group name check needed.
   */
  async isClaudeGroup() {
    return false;
  }

  async getContactFromMessage(normalizedMsg) {
    return {
      pushname: normalizedMsg.pushName || null,
      shortName: null,
      name: null,
    };
  }

  // ---------- Graph API helpers ----------

  _graphPost(endpoint, payload) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const url = new URL(GRAPH_API_BASE + endpoint);

      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Length': Buffer.byteLength(data),
        },
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode >= 400) {
              const errMsg = parsed.error
                ? `${parsed.error.message} (code ${parsed.error.code})`
                : `HTTP ${res.statusCode}`;
              logger.error(`Graph API error: ${errMsg}`);
              reject(new Error(errMsg));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject(new Error(`Failed to parse Graph API response: ${body.slice(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  _graphGet(endpoint) {
    return new Promise((resolve, reject) => {
      const url = new URL(GRAPH_API_BASE + endpoint);

      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`Failed to parse Graph API response: ${body.slice(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  async _uploadMedia(filePath) {
    return new Promise((resolve, reject) => {
      const filename = path.basename(filePath);
      const fileData = fs.readFileSync(filePath);
      const mimeType = this._extToMime(path.extname(filePath).toLowerCase());

      const boundary = '----FormBoundary' + crypto.randomBytes(16).toString('hex');

      let bodyParts = [];
      // messaging_product field
      bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp`);
      // type field
      bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\n${mimeType}`);
      // file field
      bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`);

      const header = Buffer.from(bodyParts.join('\r\n') + '\r\n');
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([header, fileData, footer]);

      const url = new URL(`${GRAPH_API_BASE}/${this.phoneNumberId}/media`);

      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      };

      const req = https.request(options, (res) => {
        let resBody = '';
        res.on('data', (chunk) => { resBody += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(resBody);
            resolve(parsed.id || null);
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', (e) => {
        logger.error('Media upload failed:', e.message);
        resolve(null);
      });
      req.write(body);
      req.end();
    });
  }

  _downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
        },
      };

      const req = https.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow redirect
          this._downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
          return;
        }
        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
        fileStream.on('error', reject);
      });

      req.on('error', reject);
      req.end();
    });
  }

  _mimeToExt(mime) {
    const map = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'application/pdf': '.pdf',
      'video/mp4': '.mp4',
      'audio/ogg; codecs=opus': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/aac': '.aac',
    };
    return map[mime] || '.bin';
  }

  _extToMime(ext) {
    const map = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
      '.ogg': 'audio/ogg',
      '.mp3': 'audio/mpeg',
      '.aac': 'audio/aac',
    };
    return map[ext] || 'application/octet-stream';
  }

  /**
   * Mark a message as "read" — sends the blue ticks.
   */
  async markAsRead(messageId) {
    try {
      await this._graphPost(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      });
    } catch {
      // Non-critical — ignore
    }
  }
}

module.exports = CloudAPIProvider;
