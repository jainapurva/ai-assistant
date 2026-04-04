const fs = require('fs');
const path = require('path');
const os = require('os');

// Use a temp file for tracker during tests
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jobhunter-test-'));
const TRACKER_FILE = path.join(TEMP_DIR, 'tracker.json');
process.env.TRACKER_PATH = TRACKER_FILE;
process.env.BOT_API_URL = 'http://localhost:9999';
process.env.CHAT_ID = 'test-user';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Now require the module (after env is set)
const {
  loadTracker, saveTracker, defaultTracker,
  APPLICATION_STATUSES,
} = require('../../src/mcp/job-hunter-mcp-server');

beforeEach(() => {
  if (fs.existsSync(TRACKER_FILE)) fs.unlinkSync(TRACKER_FILE);
  mockFetch.mockReset();
});

afterAll(() => {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
});

describe('Tracker Persistence', () => {
  test('initializes with empty applications when no file exists', () => {
    const tracker = loadTracker();
    expect(tracker.applications).toEqual([]);
    expect(tracker.createdAt).toBeDefined();
  });

  test('saves and loads tracker correctly', () => {
    const tracker = defaultTracker();
    tracker.applications.push({
      id: 'app_123',
      company: 'Google',
      role: 'Software Engineer',
      status: 'applied',
      appliedAt: new Date().toISOString(),
    });
    saveTracker(tracker);

    const loaded = loadTracker();
    expect(loaded.applications).toHaveLength(1);
    expect(loaded.applications[0].company).toBe('Google');
    expect(loaded.applications[0].role).toBe('Software Engineer');
  });

  test('handles corrupted file gracefully', () => {
    fs.writeFileSync(TRACKER_FILE, 'not json');
    const tracker = loadTracker();
    expect(tracker.applications).toEqual([]);
  });
});

describe('Application Statuses', () => {
  test('defines expected statuses', () => {
    expect(APPLICATION_STATUSES).toContain('saved');
    expect(APPLICATION_STATUSES).toContain('applied');
    expect(APPLICATION_STATUSES).toContain('screen');
    expect(APPLICATION_STATUSES).toContain('interview');
    expect(APPLICATION_STATUSES).toContain('offer');
    expect(APPLICATION_STATUSES).toContain('rejected');
    expect(APPLICATION_STATUSES).toContain('withdrawn');
  });
});

describe('Tracker Operations', () => {
  test('add multiple applications and load them', () => {
    const tracker = defaultTracker();

    tracker.applications.push({
      id: 'app_1',
      company: 'Google',
      role: 'SWE',
      status: 'applied',
      url: 'https://google.com/careers/123',
      notes: null,
      salary: '$150K-$200K',
      location: 'Mountain View, CA',
      appliedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [{ status: 'applied', date: new Date().toISOString() }],
    });

    tracker.applications.push({
      id: 'app_2',
      company: 'Meta',
      role: 'Product Manager',
      status: 'screen',
      url: null,
      notes: 'Recruiter reached out on LinkedIn',
      salary: null,
      location: 'Remote',
      appliedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [
        { status: 'applied', date: new Date().toISOString() },
        { status: 'screen', date: new Date().toISOString() },
      ],
    });

    saveTracker(tracker);

    const loaded = loadTracker();
    expect(loaded.applications).toHaveLength(2);
    expect(loaded.applications[0].company).toBe('Google');
    expect(loaded.applications[1].status).toBe('screen');
    expect(loaded.applications[1].history).toHaveLength(2);
  });

  test('update application status', () => {
    const tracker = defaultTracker();
    tracker.applications.push({
      id: 'app_1',
      company: 'Stripe',
      role: 'Backend Engineer',
      status: 'applied',
      notes: null,
      history: [{ status: 'applied', date: new Date().toISOString() }],
    });
    saveTracker(tracker);

    // Simulate status update
    const loaded = loadTracker();
    const app = loaded.applications.find(a => a.id === 'app_1');
    app.status = 'interview';
    app.notes = 'Phone screen went well';
    app.history.push({ status: 'interview', date: new Date().toISOString() });
    saveTracker(loaded);

    const reloaded = loadTracker();
    expect(reloaded.applications[0].status).toBe('interview');
    expect(reloaded.applications[0].notes).toBe('Phone screen went well');
    expect(reloaded.applications[0].history).toHaveLength(2);
  });

  test('filter applications by status', () => {
    const tracker = defaultTracker();
    tracker.applications.push(
      { id: 'app_1', company: 'A', role: 'R1', status: 'applied', history: [] },
      { id: 'app_2', company: 'B', role: 'R2', status: 'interview', history: [] },
      { id: 'app_3', company: 'C', role: 'R3', status: 'applied', history: [] },
      { id: 'app_4', company: 'D', role: 'R4', status: 'rejected', history: [] },
    );
    saveTracker(tracker);

    const loaded = loadTracker();
    const applied = loaded.applications.filter(a => a.status === 'applied');
    expect(applied).toHaveLength(2);

    const interview = loaded.applications.filter(a => a.status === 'interview');
    expect(interview).toHaveLength(1);
    expect(interview[0].company).toBe('B');
  });

  test('compute funnel stats', () => {
    const tracker = defaultTracker();
    tracker.applications.push(
      { id: 'app_1', status: 'applied', history: [] },
      { id: 'app_2', status: 'applied', history: [] },
      { id: 'app_3', status: 'screen', history: [] },
      { id: 'app_4', status: 'interview', history: [] },
      { id: 'app_5', status: 'offer', history: [] },
      { id: 'app_6', status: 'rejected', history: [] },
    );
    saveTracker(tracker);

    const loaded = loadTracker();
    const stats = {};
    for (const s of APPLICATION_STATUSES) {
      stats[s] = loaded.applications.filter(a => a.status === s).length;
    }

    expect(stats.applied).toBe(2);
    expect(stats.screen).toBe(1);
    expect(stats.interview).toBe(1);
    expect(stats.offer).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.saved).toBe(0);

    // Response rate: (screen + interview + offer + rejected) / (applied + screen + interview + offer + rejected)
    const totalApplied = stats.applied + stats.screen + stats.interview + stats.offer + stats.rejected;
    const responded = stats.screen + stats.interview + stats.offer + stats.rejected;
    const responseRate = Math.round((responded / totalApplied) * 100);
    expect(responseRate).toBe(67); // 4/6 = 66.67 → 67
  });
});
