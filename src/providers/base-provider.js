const EventEmitter = require('events');

/**
 * Abstract base class for WhatsApp transport providers.
 *
 * Cloud API provider extends this class so bot logic in index.js stays
 * provider-agnostic.
 *
 * Events emitted:
 *   'ready'                — Provider connected and operational
 *   'message' (NormalizedMessage) — Incoming message
 *
 * NormalizedMessage shape:
 *   { id, chatId, senderId, type, body, fromMe, isGroup, hasMedia, author, pushName, _raw }
 */
class BaseProvider extends EventEmitter {

  constructor(config) {
    super();
    this.config = config;
    this.name = 'base';
  }

  /** Start the provider (connect / launch webhook server) */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /** Graceful shutdown */
  async destroy() {
    throw new Error('destroy() must be implemented by subclass');
  }

  /** @returns {'CONNECTED'|'DISCONNECTED'} */
  async getState() {
    throw new Error('getState() must be implemented by subclass');
  }

  /** Send a text message to a chat */
  async sendMessage(chatId, text) {
    throw new Error('sendMessage() must be implemented by subclass');
  }

  /** Reply to an original message with text */
  async replyToMessage(originalMsg, text) {
    throw new Error('replyToMessage() must be implemented by subclass');
  }

  /** Send a file/media to a chat */
  async sendMedia(chatId, filePath, opts = {}) {
    throw new Error('sendMedia() must be implemented by subclass');
  }

  /** Reply to an original message with a file/media */
  async replyWithMedia(originalMsg, filePath, opts = {}) {
    throw new Error('replyWithMedia() must be implemented by subclass');
  }

  /** Send a poll (providers that don't support polls should fall back to numbered list) */
  async sendPoll(chatId, question, options) {
    throw new Error('sendPoll() must be implemented by subclass');
  }

  /** Show typing indicator */
  async sendTyping(chatId) {
    // Optional — no-op by default
  }

  /** Clear typing indicator */
  async clearTyping(chatId) {
    // Optional — no-op by default
  }

  /** Get the display name of a chat */
  async getChatName(chatId) {
    return chatId;
  }

  /** Get the display name of a contact/sender */
  async getContactName(senderId) {
    return senderId;
  }

  /** Download media from a message, returns local file path or null */
  async downloadMedia(originalMsg) {
    return null;
  }
}

module.exports = BaseProvider;
