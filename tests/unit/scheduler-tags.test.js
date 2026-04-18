// Mock claude.js dependencies so scheduler can be imported without side effects
jest.mock('../../src/claude', () => ({
  runClaude: jest.fn(),
  isGroupChat: (id) => !!(id && id.endsWith('@g.us')),
  STATE_FILE: '/tmp/bot_state_test.json',
  withSharedStateLock: (fn) => fn(),
  loadSharedState: jest.fn(() => ({ sessions: {}, projectDirs: {}, scheduledTasks: [] })),
  saveSharedState: jest.fn(),
}));

const { parseNaturalTime, extractScheduleTags, stripScheduleTags } = require('../../src/scheduler');

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

// ── extractScheduleTags ──

describe('extractScheduleTags', () => {
  test('extracts REMIND tag', () => {
    const text = 'Done! I\'ll remind you.\n<<REMIND|daily 18:00|Time to exercise!>>';
    const { schedules, cleaned } = extractScheduleTags(text);
    expect(schedules).toHaveLength(1);
    expect(schedules[0].type).toBe('remind');
    expect(schedules[0].cron).toBe('0 18 * * *');
    expect(schedules[0].friendly).toBe('daily at 6:00 PM');
    expect(schedules[0].prompt).toBe('Time to exercise!');
    expect(cleaned).toBe('Done! I\'ll remind you.');
  });

  test('extracts SCHEDULE tag', () => {
    const text = 'I\'ll check your emails!\n<<SCHEDULE|weekdays 9:00|Check emails and summarize>>';
    const { schedules, cleaned } = extractScheduleTags(text);
    expect(schedules).toHaveLength(1);
    expect(schedules[0].type).toBe('task');
    expect(schedules[0].cron).toBe('0 9 * * 1-5');
    expect(schedules[0].prompt).toBe('Check emails and summarize');
    expect(cleaned).toBe('I\'ll check your emails!');
  });

  test('extracts multiple tags', () => {
    const text = 'Set up both!\n<<REMIND|daily 8:00|Good morning!>>\n<<SCHEDULE|every 2h|Check server status>>';
    const { schedules, cleaned } = extractScheduleTags(text);
    expect(schedules).toHaveLength(2);
    expect(schedules[0].type).toBe('remind');
    expect(schedules[0].cron).toBe('0 8 * * *');
    expect(schedules[1].type).toBe('task');
    expect(schedules[1].cron).toBe('0 */2 * * *');
    expect(cleaned).toBe('Set up both!');
  });

  test('returns text unchanged when no tags', () => {
    const text = 'Just a normal response with no schedule tags.';
    const { schedules, cleaned } = extractScheduleTags(text);
    expect(schedules).toHaveLength(0);
    expect(cleaned).toBe(text);
  });

  test('handles invalid time expression gracefully', () => {
    const text = 'Oops\n<<REMIND|next tuesday maybe|do something>>';
    const { schedules, cleaned } = extractScheduleTags(text);
    expect(schedules).toHaveLength(0);
    expect(cleaned).toBe('Oops');
  });

  test('collapses excessive newlines after tag removal', () => {
    const text = 'Hello\n\n\n<<REMIND|daily 9:00|Hi>>\n\n\nGoodbye';
    const { schedules, cleaned } = extractScheduleTags(text);
    expect(schedules).toHaveLength(1);
    expect(cleaned).not.toMatch(/\n{3,}/);
  });
});

// ── stripScheduleTags ──

describe('stripScheduleTags', () => {
  test('strips REMIND tag', () => {
    const text = 'Hello!\n<<REMIND|daily 18:00|Exercise>>';
    expect(stripScheduleTags(text)).toBe('Hello!');
  });

  test('strips SCHEDULE tag', () => {
    const text = 'Working on it\n<<SCHEDULE|every 1h|check logs>>';
    expect(stripScheduleTags(text)).toBe('Working on it');
  });

  test('strips multiple tags', () => {
    const text = 'Done\n<<REMIND|daily 9:00|Morning>>\n<<SCHEDULE|every 2h|Check>>';
    expect(stripScheduleTags(text)).toBe('Done');
  });

  test('returns text unchanged when no tags', () => {
    const text = 'No tags here';
    expect(stripScheduleTags(text)).toBe(text);
  });

  test('handles tag in middle of text', () => {
    const text = 'Before\n<<REMIND|daily 12:00|Lunch>>\nAfter';
    const result = stripScheduleTags(text);
    expect(result).toContain('Before');
    expect(result).toContain('After');
    expect(result).not.toContain('REMIND');
  });
});
