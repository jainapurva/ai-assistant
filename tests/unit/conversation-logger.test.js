const fs = require('fs');
const path = require('path');
const os = require('os');

// Create a real temp dir for each test
let tmpDir;

// Mock sandbox.getSandboxDir to return our temp dir
jest.mock('../../src/sandbox', () => ({
  getSandboxDir: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
}));

const sandbox = require('../../src/sandbox');
const conversation = require('../../src/conversation-logger');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-test-'));
  sandbox.getSandboxDir.mockReturnValue(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('conversation-logger', () => {
  describe('logEntry', () => {
    test('creates JSONL file and appends user entry', () => {
      conversation.logEntry('test-key', 'general', 'user', 'Hello');

      const logPath = conversation.getConversationLogPath('test-key', 'general');
      expect(fs.existsSync(logPath)).toBe(true);

      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(1);

      const entry = JSON.parse(lines[0]);
      expect(entry.role).toBe('user');
      expect(entry.content).toBe('Hello');
      expect(entry.ts).toBeDefined();
    });

    test('appends multiple entries', () => {
      conversation.logEntry('test-key', 'general', 'user', 'Hi');
      conversation.logEntry('test-key', 'general', 'assistant', 'Hello!');
      conversation.logEntry('test-key', 'general', 'user', 'How are you?');

      const logPath = conversation.getConversationLogPath('test-key', 'general');
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(3);
      expect(JSON.parse(lines[0]).role).toBe('user');
      expect(JSON.parse(lines[1]).role).toBe('assistant');
      expect(JSON.parse(lines[2]).role).toBe('user');
    });

    test('truncates long assistant responses', () => {
      const longContent = 'x'.repeat(10000);
      conversation.logEntry('test-key', 'general', 'assistant', longContent);

      const logPath = conversation.getConversationLogPath('test-key', 'general');
      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8').trim());
      expect(entry.content.length).toBeLessThan(longContent.length);
      expect(entry.content).toContain('[truncated]');
    });

    test('does not truncate user messages', () => {
      const longContent = 'x'.repeat(10000);
      conversation.logEntry('test-key', 'general', 'user', longContent);

      const logPath = conversation.getConversationLogPath('test-key', 'general');
      const entry = JSON.parse(fs.readFileSync(logPath, 'utf8').trim());
      expect(entry.content).toBe(longContent);
    });

    test('creates agent directory if it does not exist', () => {
      conversation.logEntry('test-key', 'my-agent', 'user', 'test');

      const logPath = conversation.getConversationLogPath('test-key', 'my-agent');
      expect(fs.existsSync(logPath)).toBe(true);
    });
  });

  describe('loadHistory', () => {
    test('returns empty array for missing file', () => {
      const result = conversation.loadHistory('nonexistent', 'general');
      expect(result).toEqual([]);
    });

    test('returns last N entries', () => {
      for (let i = 0; i < 30; i++) {
        conversation.logEntry('test-key', 'general', 'user', `msg ${i}`);
      }

      const result = conversation.loadHistory('test-key', 'general', 5);
      expect(result).toHaveLength(5);
      expect(result[0].content).toBe('msg 25');
      expect(result[4].content).toBe('msg 29');
    });

    test('returns all entries when fewer than max', () => {
      conversation.logEntry('test-key', 'general', 'user', 'one');
      conversation.logEntry('test-key', 'general', 'assistant', 'two');

      const result = conversation.loadHistory('test-key', 'general');
      expect(result).toHaveLength(2);
    });

    test('skips corrupt JSON lines', () => {
      const logPath = conversation.getConversationLogPath('test-key', 'general');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.writeFileSync(logPath, [
        '{"ts":"2026-01-01","role":"user","content":"good"}',
        'this is not json',
        '{"ts":"2026-01-02","role":"assistant","content":"also good"}',
      ].join('\n') + '\n');

      const result = conversation.loadHistory('test-key', 'general');
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('good');
      expect(result[1].content).toBe('also good');
    });
  });

  describe('formatHistoryAsContext', () => {
    test('returns empty string for no entries', () => {
      expect(conversation.formatHistoryAsContext([])).toBe('');
      expect(conversation.formatHistoryAsContext(null)).toBe('');
    });

    test('formats user and assistant messages', () => {
      const entries = [
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: '4' },
      ];

      const result = conversation.formatHistoryAsContext(entries);
      expect(result).toContain('<conversation_history>');
      expect(result).toContain('</conversation_history>');
      expect(result).toContain('[User]: What is 2+2?');
      expect(result).toContain('[Assistant]: 4');
    });
  });

  describe('clearHistory', () => {
    test('deletes the conversation file', () => {
      conversation.logEntry('test-key', 'general', 'user', 'hello');
      const logPath = conversation.getConversationLogPath('test-key', 'general');
      expect(fs.existsSync(logPath)).toBe(true);

      conversation.clearHistory('test-key', 'general');
      expect(fs.existsSync(logPath)).toBe(false);
    });

    test('does not throw for missing file', () => {
      expect(() => {
        conversation.clearHistory('nonexistent', 'general');
      }).not.toThrow();
    });
  });

  describe('getConversationLogPath', () => {
    test('returns path under agent directory', () => {
      const result = conversation.getConversationLogPath('key', 'general');
      expect(result).toContain('agents');
      expect(result).toContain('general');
      expect(result).toContain('conversation.jsonl');
    });
  });
});
