jest.mock('../../src/claude', () => ({
  runClaude: jest.fn(),
  isGroupChat: (id) => !!(id && id.endsWith('@g.us')),
  STATE_FILE: '/tmp/bot_state_scheduler_oneshot_test.json',
}));

const fs = require('fs');
const { STATE_FILE } = require('../../src/claude');
const { resolveWhen, isoToOneShotCron } = require('../../src/scheduler');

afterEach(() => {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
});

describe('isoToOneShotCron', () => {
  test('converts a future ISO datetime to a 5-field cron', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000); // +1h
    const cron = isoToOneShotCron(future.toISOString());
    expect(cron).not.toBeNull();
    const parts = cron.split(' ');
    expect(parts).toHaveLength(5);
    expect(Number(parts[0])).toBe(future.getMinutes());
    expect(Number(parts[1])).toBe(future.getHours());
    expect(Number(parts[2])).toBe(future.getDate());
    expect(Number(parts[3])).toBe(future.getMonth() + 1);
    expect(parts[4]).toBe('*');
  });

  test('returns null for past datetimes', () => {
    expect(isoToOneShotCron('2020-01-01T00:00:00Z')).toBeNull();
  });

  test('returns null for unparseable input', () => {
    expect(isoToOneShotCron('not a date')).toBeNull();
  });
});

describe('resolveWhen', () => {
  test('parses natural recurrence', () => {
    expect(resolveWhen('hourly')).toEqual({ cron: '0 * * * *', friendly: 'hourly', oneShot: false });
    expect(resolveWhen('daily 6pm')).toEqual({ cron: '0 18 * * *', friendly: 'daily at 6:00 PM', oneShot: false });
  });

  test('parses raw cron expressions', () => {
    expect(resolveWhen('0 18 * * *')).toEqual({ cron: '0 18 * * *', friendly: '0 18 * * *', oneShot: false });
  });

  test('parses ISO datetime as one-shot', () => {
    const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const r = resolveWhen(future);
    expect(r).not.toBeNull();
    expect(r.oneShot).toBe(true);
    expect(r.cron.split(' ')).toHaveLength(5);
  });

  test('returns null for past ISO datetime', () => {
    expect(resolveWhen('2020-01-01T00:00:00Z')).toBeNull();
  });

  test('returns null for unparseable when', () => {
    expect(resolveWhen('whenever I feel like it')).toBeNull();
    expect(resolveWhen('')).toBeNull();
    expect(resolveWhen(null)).toBeNull();
  });
});
