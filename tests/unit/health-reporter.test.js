// Unit tests for src/health-reporter.js — bot heartbeat pushed to the admin
// dashboard. Mocks fetch; no real network calls.

jest.mock('../../src/config', () => ({
  analyticsBaseUrl: 'https://example.test',
  serviceApiSecret: 'test-secret',
}));

describe('health-reporter', () => {
  let healthReporter;
  let logger;

  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    logger = require('../../src/logger');
    healthReporter = require('../../src/health-reporter');
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('buildSnapshot includes core fields', () => {
    healthReporter.init({
      getQueuedMessages: () => 3,
      getActiveTasks: () => 2,
    });
    const snap = healthReporter.buildSnapshot();
    expect(snap.queuedMessages).toBe(3);
    expect(snap.activeTasks).toBe(2);
    expect(snap.metaTokenOk).toBe(true);
    expect(typeof snap.uptimeSecs).toBe('number');
    expect(snap.startedAt).toMatch(/^\d{4}-/);
    expect(snap.nodeVersion).toBe(process.version);
  });

  test('getter errors do not break snapshot', () => {
    healthReporter.init({
      getQueuedMessages: () => { throw new Error('boom'); },
    });
    const snap = healthReporter.buildSnapshot();
    expect(snap.queuedMessages).toBeNull();
  });

  test('meta token flag flips on auth error and recovers on success', () => {
    expect(healthReporter.buildSnapshot().metaTokenOk).toBe(true);
    healthReporter.recordMetaAuthError();
    expect(healthReporter.buildSnapshot().metaTokenOk).toBe(false);
    healthReporter.recordMetaOk();
    expect(healthReporter.buildSnapshot().metaTokenOk).toBe(true);
  });

  test('push POSTs snapshot with x-api-key', async () => {
    await healthReporter.push();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.test/api/admin/health',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'test-secret' }),
      })
    );
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toHaveProperty('reportedAt');
    expect(body).toHaveProperty('errorsLastHour');
  });

  test('push failure never throws', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));
    await expect(healthReporter.push()).resolves.toBeUndefined();
  });

  test('logger error counter feeds errorsLastHour', () => {
    const before = healthReporter.buildSnapshot().errorsLastHour;
    logger.error('test error');
    logger.error('another');
    const after = healthReporter.buildSnapshot().errorsLastHour;
    expect(after - before).toBe(2);
  });
});
