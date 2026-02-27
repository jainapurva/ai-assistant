// Mock claude.js dependencies so scheduler can be imported without side effects
jest.mock('../../src/claude', () => ({
  runClaude: jest.fn(),
  isGroupChat: (id) => !!(id && id.endsWith('@g.us')),
  STATE_FILE: '/tmp/bot_state_test.json',
  withSharedStateLock: (fn) => fn(),
  loadSharedState: jest.fn(() => ({ sessions: {}, projectDirs: {}, scheduledTasks: [] })),
  saveSharedState: jest.fn(),
}));

const { parseScheduleCommand } = require('../../src/scheduler');

describe('parseScheduleCommand - friendly interval syntax', () => {
  test('parses "every 30m <prompt>"', () => {
    const result = parseScheduleCommand('every 30m send daily report');
    expect(result).not.toBeNull();
    expect(result.cron).toBe('*/30 * * * *');
    expect(result.friendly).toBe('every 30m');
    expect(result.prompt).toBe('send daily report');
  });

  test('parses "every 1h <prompt>"', () => {
    const result = parseScheduleCommand('every 1h check server status');
    expect(result).not.toBeNull();
    expect(result.cron).toBe('0 */1 * * *');
    expect(result.prompt).toBe('check server status');
  });

  test('parses "every 2h <prompt>"', () => {
    const result = parseScheduleCommand('every 2h fetch news');
    expect(result).not.toBeNull();
    expect(result.cron).toBe('0 */2 * * *');
    expect(result.friendly).toBe('every 2h');
  });

  test('parses "every 1d <prompt>"', () => {
    const result = parseScheduleCommand('every 1d backup files');
    expect(result).not.toBeNull();
    expect(result.cron).toBe('0 0 */1 * *');
    expect(result.prompt).toBe('backup files');
  });

  test('parses "every 5 min <prompt>"', () => {
    const result = parseScheduleCommand('every 5 min do something');
    expect(result).not.toBeNull();
    expect(result.cron).toBe('*/5 * * * *');
    expect(result.prompt).toBe('do something');
  });

  test('parses "every 5 mins <prompt>"', () => {
    const result = parseScheduleCommand('every 5 mins do something');
    expect(result).not.toBeNull();
    expect(result.cron).toBe('*/5 * * * *');
    expect(result.prompt).toBe('do something');
  });

  test('parses "every 3 hrs <prompt>"', () => {
    const result = parseScheduleCommand('every 3 hrs summarize activity');
    expect(result).not.toBeNull();
    expect(result.cron).toBe('0 */3 * * *');
  });

  test('parses "every 2 days <prompt>"', () => {
    const result = parseScheduleCommand('every 2 days weekly report');
    expect(result).not.toBeNull();
    expect(result.cron).toBe('0 0 */2 * *');
  });

  test('is case-insensitive for unit', () => {
    const result = parseScheduleCommand('every 15 MIN check logs');
    expect(result).not.toBeNull();
    expect(result.cron).toBe('*/15 * * * *');
  });

  test('returns null for invalid interval', () => {
    expect(parseScheduleCommand('every 0m do something')).toBeNull();
    expect(parseScheduleCommand('every -1h bad')).toBeNull();
  });

  test('returns null for missing prompt', () => {
    // "every 5m" alone with no prompt — text after interval is empty
    const result = parseScheduleCommand('every 5m');
    // prompt would be undefined/empty — should fail gracefully
    // The scheduler regex requires at least one char after the interval
    expect(result).toBeNull();
  });
});

describe('parseScheduleCommand - cron syntax', () => {
  test('parses standard 5-field cron expression', () => {
    const result = parseScheduleCommand('*/30 * * * * send report');
    expect(result).not.toBeNull();
    expect(result.cron).toBe('*/30 * * * *');
    expect(result.prompt).toBe('send report');
  });

  test('parses specific time cron', () => {
    const result = parseScheduleCommand('0 9 * * * morning briefing');
    expect(result).not.toBeNull();
    expect(result.cron).toBe('0 9 * * *');
    expect(result.prompt).toBe('morning briefing');
  });

  test('returns null for invalid cron expression', () => {
    expect(parseScheduleCommand('not a cron at all')).toBeNull();
    expect(parseScheduleCommand('99 99 99 99 99 broken')).toBeNull();
  });

  test('cron friendly interval equals the expression itself', () => {
    const result = parseScheduleCommand('0 8 * * * good morning');
    expect(result.friendly).toBe('0 8 * * *');
  });
});
