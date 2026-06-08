// Mock claude.js dependencies so scheduler can be imported without side effects
jest.mock('../../src/claude', () => ({
  runClaude: jest.fn(),
  isGroupChat: (id) => !!(id && id.endsWith('@g.us')),
  STATE_FILE: '/tmp/bot_state_test.json',
  withSharedStateLock: (fn) => fn(),
  loadSharedState: jest.fn(() => ({ sessions: {}, projectDirs: {}, scheduledTasks: [] })),
  saveSharedState: jest.fn(),
}));

const { parseNaturalTime } = require('../../src/scheduler');

// ── parseNaturalTime ──

describe('parseNaturalTime', () => {
  test('parses "daily 18:00"', () => {
    const r = parseNaturalTime('daily 18:00');
    expect(r).not.toBeNull();
    expect(r.cron).toBe('0 18 * * *');
    expect(r.friendly).toBe('daily at 6:00 PM');
  });

  test('parses "daily at 6pm"', () => {
    const r = parseNaturalTime('daily at 6pm');
    expect(r.cron).toBe('0 18 * * *');
  });

  test('parses "daily at 6:30pm"', () => {
    const r = parseNaturalTime('daily at 6:30pm');
    expect(r.cron).toBe('30 18 * * *');
    expect(r.friendly).toBe('daily at 6:30 PM');
  });

  test('parses "daily at 6:30 PM"', () => {
    const r = parseNaturalTime('daily at 6:30 PM');
    expect(r.cron).toBe('30 18 * * *');
  });

  test('parses "daily 9:00"', () => {
    const r = parseNaturalTime('daily 9:00');
    expect(r.cron).toBe('0 9 * * *');
    expect(r.friendly).toBe('daily at 9:00 AM');
  });

  test('parses "daily at 12pm" (noon)', () => {
    const r = parseNaturalTime('daily at 12pm');
    expect(r.cron).toBe('0 12 * * *');
  });

  test('parses "daily at 12am" (midnight)', () => {
    const r = parseNaturalTime('daily at 12am');
    expect(r.cron).toBe('0 0 * * *');
  });

  test('parses "weekdays 9:00"', () => {
    const r = parseNaturalTime('weekdays 9:00');
    expect(r.cron).toBe('0 9 * * 1-5');
    expect(r.friendly).toBe('weekdays at 9:00 AM');
  });

  test('parses "weekday at 8am"', () => {
    const r = parseNaturalTime('weekday at 8am');
    expect(r.cron).toBe('0 8 * * 1-5');
  });

  test('parses "weekends 10:00"', () => {
    const r = parseNaturalTime('weekends 10:00');
    expect(r.cron).toBe('0 10 * * 0,6');
    expect(r.friendly).toBe('weekends at 10:00 AM');
  });

  test('parses "weekend at 11am"', () => {
    const r = parseNaturalTime('weekend at 11am');
    expect(r.cron).toBe('0 11 * * 0,6');
  });

  test('parses "every monday 10:00"', () => {
    const r = parseNaturalTime('every monday 10:00');
    expect(r.cron).toBe('0 10 * * 1');
    expect(r.friendly).toMatch(/every Monday at 10:00 AM/i);
  });

  test('parses "every friday at 5pm"', () => {
    const r = parseNaturalTime('every friday at 5pm');
    expect(r.cron).toBe('0 17 * * 5');
  });

  test('parses "every sunday at 9:30am"', () => {
    const r = parseNaturalTime('every sunday at 9:30am');
    expect(r.cron).toBe('30 9 * * 0');
  });

  test('parses short day names: "every mon 8:00"', () => {
    const r = parseNaturalTime('every mon 8:00');
    expect(r.cron).toBe('0 8 * * 1');
  });

  test('parses "every 2h"', () => {
    const r = parseNaturalTime('every 2h');
    expect(r).not.toBeNull();
    expect(r.cron).toBe('0 */2 * * *');
  });

  test('parses "every 30m"', () => {
    const r = parseNaturalTime('every 30m');
    expect(r.cron).toBe('*/30 * * * *');
  });

  test('parses "hourly"', () => {
    const r = parseNaturalTime('hourly');
    expect(r.cron).toBe('0 * * * *');
    expect(r.friendly).toBe('hourly');
  });

  test('parses raw cron "0 18 * * *"', () => {
    const r = parseNaturalTime('0 18 * * *');
    expect(r.cron).toBe('0 18 * * *');
  });

  test('is case-insensitive', () => {
    expect(parseNaturalTime('Daily At 6PM').cron).toBe('0 18 * * *');
    expect(parseNaturalTime('WEEKDAYS 9:00').cron).toBe('0 9 * * 1-5');
    expect(parseNaturalTime('Every MONDAY 10:00').cron).toBe('0 10 * * 1');
  });

  test('returns null for invalid input', () => {
    expect(parseNaturalTime('tomorrow at 5pm')).toBeNull();
    expect(parseNaturalTime('next week')).toBeNull();
    expect(parseNaturalTime('')).toBeNull();
    expect(parseNaturalTime('gibberish')).toBeNull();
  });
});

