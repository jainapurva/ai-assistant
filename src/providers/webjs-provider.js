const { Client, LocalAuth, MessageMedia, Poll } = require('whatsapp-web.js');
const qrTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const BaseProvider = require('./base-provider');
const logger = require('../logger');

const MEDIA_DIR = path.join(__dirname, '..', '..', 'media_tmp');
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// Map MIME types to file extensions
const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'audio/ogg; codecs=opus': '.ogg',
  'audio/mpeg': '.mp3',
};

class WebJSProvider extends BaseProvider {

  constructor(config) {
    super(config);
    this.name = 'webjs';
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: config.instanceId,
        dataPath: config.authDir,
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });
    this._setupEvents();
  }

  _setupEvents() {
    const client = this.client;

    client.on('qr', async (qr) => {
      const qrPath = path.join(__dirname, '..', '..', 'qrcode.png');
      try {
        await QRCode.toFile(qrPath, qr, { width: 300, margin: 2 });
        logger.info(`QR code saved to: ${qrPath}`);
      } catch (e) {
        logger.error('Failed to save QR image:', e.message);
      }
      qrTerminal.generate(qr, { small: true });
    });

    client.on('ready', () => {
      logger.info('WhatsApp client is ready! Bot is now listening for messages.');
      logger.info(`Whitelisted number: ${this.config.whitelistedNumber}`);
      this.emit('ready');
    });

    client.on('auth_failure', (msg) => {
      logger.error('Authentication failed:', msg);
      process.exit(1);
    });

    client.on('disconnected', (reason) => {
      logger.warn('Client disconnected:', reason);
      logger.info('Attempting to reconnect...');
      client.initialize();
    });

    // Normalize message_create events
    client.on('message_create', (msg) => {
      const chatId = msg.fromMe ? msg.to : msg.from;
      const isGroup = chatId.endsWith('@g.us');

      const normalized = {
        id: msg.id._serialized,
        chatId,
        senderId: msg.fromMe
          ? this.config.whitelistedNumber
          : (msg.author || msg.from),
        type: msg.type,   // 'chat', 'image', 'document', etc.
        body: (msg.body || '').trim(),
        fromMe: msg.fromMe,
        isGroup,
        hasMedia: msg.hasMedia,
        author: msg.author || null,
        pushName: msg.pushName || null,
        _raw: msg,  // Keep raw message for provider-specific ops
      };

      this.emit('message', normalized);
    });

    // Normalize vote_update events
    client.on('vote_update', (vote) => {
      if (!vote.selectedOptions || vote.selectedOptions.length === 0) return;
      const selectedName = vote.selectedOptions[0].name;
      if (!selectedName) return;
      const parentMsg = vote.parentMessage;
      if (!parentMsg) return;
      const chatId = (parentMsg.id && parentMsg.id.remote)
        || parentMsg.to
        || parentMsg.from;

      this.emit('poll_vote', {
        chatId,
        selectedOption: selectedName,
        voter: vote.voter,
        _raw: vote,
      });
    });
  }

  async initialize() {
    logger.info('Initializing WhatsApp web.js client...');
    await this.client.initialize();
  }

  async destroy() {
    await this.client.destroy();
  }

  async getState() {
    try {
      const state = await this.client.getState();
      return state === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED';
    } catch {
      return 'DISCONNECTED';
    }
  }

  async sendMessage(chatId, text) {
    const sent = await this.client.sendMessage(chatId, text);
    return sent && sent.id ? sent.id._serialized : null;
  }

  async replyToMessage(originalMsg, text) {
    // originalMsg is the NormalizedMessage — use _raw for the actual whatsapp-web.js Message
    const raw = originalMsg._raw || originalMsg;
    await raw.reply(text);
  }

  async sendMedia(chatId, filePath, opts = {}) {
    const media = MessageMedia.fromFilePath(filePath);
    await this.client.sendMessage(chatId, media, opts);
  }

  async replyWithMedia(originalMsg, filePath, opts = {}) {
    const raw = originalMsg._raw || originalMsg;
    const media = MessageMedia.fromFilePath(filePath);
    await raw.reply(media, undefined, opts);
  }

  async sendPoll(chatId, question, options) {
    const poll = new Poll(question, options, { allowMultipleAnswers: false });
    await this.client.sendMessage(chatId, poll);
    logger.info(`Poll sent: "${question}" with ${options.length} options`);
  }

  async sendTyping(chatId) {
    try {
      const chat = await this.client.getChatById(chatId);
      await chat.sendStateTyping();
    } catch {}
  }

  async clearTyping(chatId) {
    try {
      const chat = await this.client.getChatById(chatId);
      await chat.clearState();
    } catch {}
  }

  async getChatName(chatId) {
    try {
      const chat = await this.client.getChatById(chatId);
      return chat.name || chatId;
    } catch {
      return chatId;
    }
  }

  async getContactName(senderId) {
    try {
      const contact = await this.client.getContactById(senderId);
      return contact.pushname || contact.shortName || contact.name || senderId;
    } catch {
      return senderId;
    }
  }

  async downloadMedia(originalMsg) {
    try {
      const raw = originalMsg._raw || originalMsg;
      const media = await raw.downloadMedia();
      if (!media) return null;

      const ext = MIME_TO_EXT[media.mimetype] || '.bin';
      const filename = `wa_${Date.now()}${ext}`;
      const filepath = path.join(MEDIA_DIR, filename);

      fs.writeFileSync(filepath, Buffer.from(media.data, 'base64'));
      logger.info(`Media saved: ${filepath} (${media.mimetype})`);
      return filepath;
    } catch (e) {
      logger.error('Failed to download media:', e.message);
      return null;
    }
  }

  /**
   * Check if a group chat name contains "claude".
   * Used by isAllowedChat in index.js for webjs-specific group validation.
   */
  async isClaudeGroup(chatId) {
    try {
      const chat = await this.client.getChatById(chatId);
      return chat.isGroup && /claude/i.test(chat.name);
    } catch {
      return false;
    }
  }

  /**
   * Get contact info from a raw message — used for sender name resolution.
   */
  async getContactFromMessage(normalizedMsg) {
    try {
      const raw = normalizedMsg._raw || normalizedMsg;
      const contact = await raw.getContact();
      return {
        pushname: contact.pushname || null,
        shortName: contact.shortName || null,
        name: contact.name || null,
      };
    } catch {
      return null;
    }
  }
}

module.exports = WebJSProvider;
