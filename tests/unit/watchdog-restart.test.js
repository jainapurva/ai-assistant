'use strict';

const fs = require('fs');

jest.mock('../../src/watchdog/config', () => ({
  pidFile: '/tmp/test-wd-bot.pid',
  botDir: '/tmp/test-bot',
  botEntry: '/tmp/test-bot/src/index.js',
  botLogFile: '/tmp/test-bot/bot.log',
  nodeBinary: process.execPath, // Use current Node binary for testing
  webhookPort: 39125,
  apiPort: 39126,
  shutdownWaitMs: 100,
  postStartWaitMs: 100,
  resetFile: '/tmp/test-wd-reset',
  circuitBreaker: {
    maxRestarts: 3,
    windowMs: 10 * 60_000,
    cooldownMs: 30 * 60_000,
  },
}));

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
  execFile: jest.fn(),
  spawn: jest.fn(() => ({
    unref: jest.fn(),
    pid: 12345,
  })),
}));

const restart = require('../../src/watchdog/restart');

describe('isCircuitOpen', () => {
  beforeEach(() => restart._resetState());

  test('returns false initially', () => {
    expect(restart.isCircuitOpen()).toBe(false);
  });
});

describe('recordRestart', () => {
  beforeEach(() => restart._resetState());

  test('does not trip on first restart', () => {
    expect(restart.recordRestart()).toBe(false);
  });

  test('does not trip on second restart', () => {
    restart.recordRestart();
    expect(restart.recordRestart()).toBe(false);
  });

  test('trips on third restart within window', () => {
    restart.recordRestart();
    restart.recordRestart();
    expect(restart.recordRestart()).toBe(true);
  });

  test('circuit is open after tripping', () => {
    restart.recordRestart();
    restart.recordRestart();
    restart.recordRestart();
    expect(restart.isCircuitOpen()).toBe(true);
  });
});

describe('preflight', () => {
  afterEach(() => jest.restoreAllMocks());

  test('returns ok when all files exist', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const result = restart.preflight();
    expect(result.ok).toBe(true);
  });

  test('returns not ok when node binary is missing', () => {
    jest.spyOn(fs, 'existsSync').mockImplementation((path) => {
      return !path.includes('node');
    });
    const result = restart.preflight();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Node binary/);
  });

  test('returns not ok when bot entry is missing', () => {
    jest.spyOn(fs, 'existsSync').mockImplementation((path) => {
      if (path.endsWith('index.js')) return false;
      return true;
    });
    const result = restart.preflight();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Bot entry/);
  });

  test('returns not ok when .env is missing', () => {
    jest.spyOn(fs, 'existsSync').mockImplementation((path) => {
      if (path.endsWith('.env')) return false;
      return true;
    });
    const result = restart.preflight();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/\.env/);
  });
});

describe('killExisting', () => {
  afterEach(() => jest.restoreAllMocks());

  test('handles missing PID file gracefully', () => {
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

    expect(() => restart.killExisting()).not.toThrow();
  });

  test('handles stale PID gracefully', () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue('999999999');
    jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

    expect(() => restart.killExisting()).not.toThrow();
  });
});

describe('circuit breaker manual reset', () => {
  beforeEach(() => restart._resetState());
  afterEach(() => jest.restoreAllMocks());

  test('resets circuit when reset file exists', () => {
    // Trip the circuit
    restart.recordRestart();
    restart.recordRestart();
    restart.recordRestart();
    expect(restart.isCircuitOpen()).toBe(true);

    // Create reset file
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

    expect(restart.isCircuitOpen()).toBe(false);
  });
});
