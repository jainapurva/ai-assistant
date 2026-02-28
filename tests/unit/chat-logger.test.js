const fs = require('fs');
const path = require('path');

// Use a temp dir for tests
const TEST_LOGS_DIR = path.join(__dirname, '..', 'tmp-logs');

// Mock the LOGS_DIR before requiring the module
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    mkdirSync: jest.fn(),
    appendFileSync: jest.fn(),
  };
});

// Override LOGS_DIR via direct manipulation after require
const chatLogger = require('../../src/chat-logger');

describe('chat-logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('logUserMessage writes USER tag with timestamp', () => {
    chatLogger.logUserMessage('16262300167@c.us', '16262300167@c.us', 'Hello world');

    expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
    const [filePath, content] = fs.appendFileSync.mock.calls[0];
    expect(filePath).toContain('16262300167.log');
    expect(content).toMatch(/\[USER\]/);
    expect(content).toContain('Hello world');
    expect(content).toMatch(/^\[.*\] \[USER\]/);
  });

  test('logAIResponse writes AI tag', () => {
    chatLogger.logAIResponse('16262300167@c.us', '16262300167@c.us', 'Hi there!');

    expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
    const [filePath, content] = fs.appendFileSync.mock.calls[0];
    expect(filePath).toContain('16262300167.log');
    expect(content).toMatch(/\[AI\]/);
    expect(content).toContain('Hi there!');
  });

  test('logError writes ERR tag', () => {
    chatLogger.logError('16262300167@c.us', '16262300167@c.us', 'Something broke');

    expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
    const [, content] = fs.appendFileSync.mock.calls[0];
    expect(content).toMatch(/\[ERR\]/);
    expect(content).toContain('Something broke');
  });

  test('uses phone number (without @c.us) as filename', () => {
    chatLogger.logUserMessage('14243937267@c.us', 'somechat@g.us', 'test');

    const [filePath] = fs.appendFileSync.mock.calls[0];
    expect(filePath).toContain('14243937267.log');
    expect(filePath).not.toContain('@c.us');
  });

  test('includes chatId in log line', () => {
    chatLogger.logUserMessage('16262300167@c.us', 'mygroup@g.us', 'group msg');

    const [, content] = fs.appendFileSync.mock.calls[0];
    expect(content).toContain('[chat:mygroup@g.us]');
  });

  test('does not throw if appendFileSync fails', () => {
    fs.appendFileSync.mockImplementation(() => { throw new Error('disk full'); });

    // Should not throw
    expect(() => {
      chatLogger.logUserMessage('16262300167@c.us', '16262300167@c.us', 'test');
    }).not.toThrow();
  });
});
