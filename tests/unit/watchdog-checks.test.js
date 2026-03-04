'use strict';

const fs = require('fs');
const net = require('net');
const http = require('http');

// Mock config before requiring checks
jest.mock('../../src/watchdog/config', () => ({
  pidFile: '/tmp/test-bot.pid',
  webhookPort: 39123,
  apiPort: 39124,
  tcpTimeoutMs: 1000,
  httpTimeoutMs: 1000,
  credentialsFile: '/tmp/test-credentials.json',
  stateFile: '/tmp/test-state.json',
  stuckTaskAgeMs: 30 * 60_000,
}));

const checks = require('../../src/watchdog/checks');

describe('checkProcessAlive', () => {
  afterEach(() => jest.restoreAllMocks());

  test('returns ok when PID file exists and process is running', () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue(String(process.pid));
    const result = checks.checkProcessAlive();
    expect(result.ok).toBe(true);
    expect(result.pid).toBe(process.pid);
  });

  test('returns not ok when PID file is missing', () => {
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      const err = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    });
    const result = checks.checkProcessAlive();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/PID file not found/);
  });

  test('returns not ok when PID is stale (process not running)', () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue('999999999');
    const result = checks.checkProcessAlive();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not running/);
  });

  test('returns not ok when PID file contains invalid data', () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue('not-a-number');
    const result = checks.checkProcessAlive();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Invalid PID/);
  });
});

describe('checkWebhookPort', () => {
  let server;

  afterEach((done) => {
    if (server) {
      server.close(() => done());
      server = null;
    } else {
      done();
    }
  });

  test('returns ok when port is listening', async () => {
    server = net.createServer();
    await new Promise((resolve) => server.listen(39123, '127.0.0.1', resolve));

    const result = await checks.checkWebhookPort();
    expect(result.ok).toBe(true);
  });

  test('returns not ok when port is not listening', async () => {
    const result = await checks.checkWebhookPort();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/39123/);
  });
});

describe('checkApiHealth', () => {
  let server;

  afterEach((done) => {
    if (server) {
      server.close(() => done());
      server = null;
    } else {
      done();
    }
  });

  test('returns ok when /health responds with {status:"ok"}', async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });
    await new Promise((resolve) => server.listen(39124, '127.0.0.1', resolve));

    const result = await checks.checkApiHealth();
    expect(result.ok).toBe(true);
  });

  test('returns not ok when /health returns non-200', async () => {
    server = http.createServer((req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('error');
    });
    await new Promise((resolve) => server.listen(39124, '127.0.0.1', resolve));

    const result = await checks.checkApiHealth();
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });

  test('returns not ok when port is not listening', async () => {
    const result = await checks.checkApiHealth();
    expect(result.ok).toBe(false);
  });
});

describe('checkClaudeAuth', () => {
  afterEach(() => jest.restoreAllMocks());

  test('returns ok when credentials are valid', () => {
    const futureDate = new Date(Date.now() + 3_600_000).toISOString();
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ expiresAt: futureDate })
    );

    const result = checks.checkClaudeAuth();
    expect(result.ok).toBe(true);
  });

  test('returns not ok when token is expired', () => {
    const pastDate = new Date(Date.now() - 3_600_000).toISOString();
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ expiresAt: pastDate })
    );

    const result = checks.checkClaudeAuth();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/expired/);
  });

  test('returns warning when token expires soon', () => {
    const soonDate = new Date(Date.now() + 15 * 60_000).toISOString();
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ expiresAt: soonDate })
    );

    const result = checks.checkClaudeAuth();
    expect(result.ok).toBe(false);
    expect(result.warning).toBe(true);
    expect(result.reason).toMatch(/expires in/);
  });

  test('returns not ok when credentials file is missing', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = checks.checkClaudeAuth();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not found/);
  });

  test('handles keyed credentials format', () => {
    const futureDate = new Date(Date.now() + 3_600_000).toISOString();
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ default: { expiresAt: futureDate } })
    );

    const result = checks.checkClaudeAuth();
    expect(result.ok).toBe(true);
  });
});

describe('checkStuckTasks', () => {
  afterEach(() => jest.restoreAllMocks());

  test('returns ok when no tasks are stuck', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ pendingTasks: { chat1: { queuedAt: Date.now() } } })
    );

    const result = checks.checkStuckTasks();
    expect(result.ok).toBe(true);
  });

  test('returns not ok when tasks are stuck', () => {
    const oldTime = Date.now() - 45 * 60_000; // 45 min ago
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ pendingTasks: { chat123abc: { queuedAt: oldTime } } })
    );

    const result = checks.checkStuckTasks();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/1 stuck/);
    expect(result.stuck).toHaveLength(1);
  });

  test('returns ok when state file is missing', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = checks.checkStuckTasks();
    expect(result.ok).toBe(true);
  });

  test('returns ok when no pending tasks exist', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({}));

    const result = checks.checkStuckTasks();
    expect(result.ok).toBe(true);
  });
});
