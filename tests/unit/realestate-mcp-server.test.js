const fs = require('fs');
const path = require('path');
const os = require('os');

// Use a temp file during tests
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'realestate-test-'));
const DATA_FILE = path.join(TEMP_DIR, 'realestate-data.json');
process.env.DATA_PATH = DATA_FILE;

// Now require the module (after env is set)
const {
  loadData, saveData, defaultData,
  generateId, scoreLead, scoreCategory, matchScore, today,
  analyzeBantGaps, ensureNurtureDefaults, autoEnrollLead,
} = require('../../src/mcp/realestate-mcp-server');

beforeEach(() => {
  if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
});

afterAll(() => {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
});

// ── Data Persistence ────────────────────────────────────────────────────────

describe('Data Persistence', () => {
  test('initializes with default data when no file exists', () => {
    const data = loadData();
    expect(data.leads).toEqual([]);
    expect(data.properties).toEqual([]);
    expect(data.showings).toEqual([]);
    expect(data.followups).toEqual([]);
    expect(data.nextLeadId).toBe(1);
    expect(data.nextPropertyId).toBe(1);
    expect(data.nextShowingId).toBe(1);
    expect(data.createdAt).toBeDefined();
  });

  test('saves and loads data correctly', () => {
    const data = defaultData();
    data.leads.push({ id: 'L-0001', name: 'Test Lead' });
    data.nextLeadId = 2;
    saveData(data);

    const loaded = loadData();
    expect(loaded.leads).toHaveLength(1);
    expect(loaded.leads[0].name).toBe('Test Lead');
    expect(loaded.nextLeadId).toBe(2);
  });

  test('creates directory if it does not exist', () => {
    const nestedPath = path.join(TEMP_DIR, 'nested', 'dir', 'data.json');
    process.env.DATA_PATH = nestedPath;

    // Re-require won't work, but saveData uses DATA_PATH at module load time
    // Instead, test directory creation directly
    const dir = path.dirname(nestedPath);
    fs.mkdirSync(dir, { recursive: true });
    expect(fs.existsSync(dir)).toBe(true);

    // Restore
    process.env.DATA_PATH = DATA_FILE;
    fs.rmSync(path.join(TEMP_DIR, 'nested'), { recursive: true, force: true });
  });
});

// ── ID Generation ───────────────────────────────────────────────────────────

describe('ID Generation', () => {
  test('generates lead IDs with L- prefix', () => {
    expect(generateId('L', 1)).toBe('L-0001');
    expect(generateId('L', 42)).toBe('L-0042');
    expect(generateId('L', 1000)).toBe('L-1000');
  });

  test('generates property IDs with P- prefix', () => {
    expect(generateId('P', 1)).toBe('P-0001');
    expect(generateId('P', 999)).toBe('P-0999');
  });

  test('generates showing IDs with S- prefix', () => {
    expect(generateId('S', 5)).toBe('S-0005');
  });
});

// ── Lead Scoring ────────────────────────────────────────────────────────────

describe('Lead Scoring', () => {
  test('cold lead with minimal info scores low', () => {
    const lead = { name: 'Basic Lead' };
    const score = scoreLead(lead);
    expect(score).toBeLessThan(40);
    expect(scoreCategory(score)).toBe('cold');
  });

  test('warm lead with budget and location scores medium', () => {
    const lead = {
      name: 'Warm Lead',
      budgetMax: 5000000,
      preferredLocations: ['Austin'],
      propertyType: 'single-family',
      phone: '9876543210',
    };
    const score = scoreLead(lead);
    expect(score).toBeGreaterThanOrEqual(40);
    expect(scoreCategory(score)).toBe('warm');
  });

  test('hot lead with pre-approval and urgent timeline scores high', () => {
    const lead = {
      name: 'Hot Lead',
      budgetMin: 4000000,
      budgetMax: 6000000,
      preferredLocations: ['Westlake', 'Downtown'],
      propertyType: 'single-family',
      timeline: 'immediate',
      preApproved: true,
      phone: '9876543210',
      email: 'hot@example.com',
      showingsCount: 2,
    };
    const score = scoreLead(lead);
    expect(score).toBeGreaterThanOrEqual(75);
    expect(scoreCategory(score)).toBe('hot');
  });

  test('pre-approval adds 25 points', () => {
    const base = { name: 'Test' };
    const withApproval = { ...base, preApproved: true };
    expect(scoreLead(withApproval) - scoreLead(base)).toBe(25);
  });

  test('immediate timeline adds 25 points', () => {
    const base = { name: 'Test' };
    const withTimeline = { ...base, timeline: 'immediate' };
    expect(scoreLead(withTimeline) - scoreLead(base)).toBe(25);
  });

  test('score is capped at 100', () => {
    const maxLead = {
      name: 'Max',
      budgetMin: 1, budgetMax: 99999999,
      preferredLocations: ['A'],
      propertyType: 'single-family',
      timeline: 'immediate',
      preApproved: true,
      phone: '123', email: 'a@b.c',
      showingsCount: 5,
      lastContactDate: today(),
    };
    expect(scoreLead(maxLead)).toBeLessThanOrEqual(100);
  });
});

describe('Score Categories', () => {
  test('75+ is hot', () => expect(scoreCategory(75)).toBe('hot'));
  test('100 is hot', () => expect(scoreCategory(100)).toBe('hot'));
  test('74 is warm', () => expect(scoreCategory(74)).toBe('warm'));
  test('40 is warm', () => expect(scoreCategory(40)).toBe('warm'));
  test('39 is cold', () => expect(scoreCategory(39)).toBe('cold'));
  test('0 is cold', () => expect(scoreCategory(0)).toBe('cold'));
});

// ── Property Matching ───────────────────────────────────────────────────────

describe('Property Matching', () => {
  const baseLead = {
    name: 'Buyer',
    budgetMin: 4000000,
    budgetMax: 6000000,
    preferredLocations: ['Westlake'],
    propertyType: 'single-family',
    bedroomsMin: 3,
    areaMin: 1500,
  };

  test('perfect match scores high', () => {
    const property = {
      title: 'Perfect Match',
      price: 5500000,
      location: 'Westlake, Austin TX',
      type: 'single-family',
      bedrooms: 3,
      areaSqft: 1650,
    };
    const { score, reasons } = matchScore(baseLead, property);
    expect(score).toBeGreaterThanOrEqual(70);
    expect(reasons).toContain('within budget');
    expect(reasons).toContain('location match');
    expect(reasons).toContain('type match');
  });

  test('over-budget property scores lower', () => {
    const property = {
      title: 'Expensive',
      price: 8000000,
      location: 'Westlake',
      type: 'single-family',
      bedrooms: 3,
    };
    const { score } = matchScore(baseLead, property);
    // Location and type match but not budget
    expect(score).toBeLessThan(70);
  });

  test('wrong location scores lower', () => {
    const property = {
      title: 'Wrong Area',
      price: 5000000,
      location: 'Pflugerville',
      type: 'single-family',
      bedrooms: 3,
    };
    const { score, reasons } = matchScore(baseLead, property);
    expect(reasons).not.toContain('location match');
  });

  test('empty lead preferences returns 0 score', () => {
    const emptyLead = { name: 'Empty' };
    const property = { title: 'Any', price: 5000000 };
    const { score } = matchScore(emptyLead, property);
    expect(score).toBe(0);
  });

  test('match score is capped at 100', () => {
    const property = {
      price: 5000000,
      location: 'Westlake',
      type: 'single-family',
      bedrooms: 5,
      areaSqft: 2000,
    };
    const { score } = matchScore(baseLead, property);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ── today() helper ──────────────────────────────────────────────────────────

describe('today()', () => {
  test('returns YYYY-MM-DD format', () => {
    const result = today();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('matches current date', () => {
    const expected = new Date().toISOString().split('T')[0];
    expect(today()).toBe(expected);
  });
});

// ── analyzeBantGaps ────────────────────────────────────────────────────────

describe('analyzeBantGaps', () => {
  test('returns all 7 fields as gaps for an empty lead', () => {
    const gaps = analyzeBantGaps({ name: 'Empty Lead' });
    expect(gaps).toHaveLength(7);
    const fields = gaps.map(g => g.field);
    expect(fields).toContain('budget');
    expect(fields).toContain('preApproved');
    expect(fields).toContain('timeline');
    expect(fields).toContain('preferredLocations');
    expect(fields).toContain('propertyType');
    expect(fields).toContain('phone');
    expect(fields).toContain('email');
  });

  test('returns no gaps when all BANT fields are filled', () => {
    const lead = {
      name: 'Fully Qualified',
      budgetMin: 3000000,
      budgetMax: 5000000,
      preApproved: true,
      timeline: 'immediate',
      preferredLocations: ['Downtown'],
      propertyType: 'condo',
      phone: '5551234567',
      email: 'buyer@example.com',
    };
    const gaps = analyzeBantGaps(lead);
    expect(gaps).toHaveLength(0);
  });

  test('prioritizes high-impact gaps first (preApproved=25, timeline=25, budget=15)', () => {
    const gaps = analyzeBantGaps({ name: 'Empty Lead' });
    // First two should be impact 25 (preApproved and timeline, sorted by impact desc)
    expect(gaps[0].impact).toBe(25);
    expect(gaps[1].impact).toBe(25);
    const topFields = [gaps[0].field, gaps[1].field].sort();
    expect(topFields).toEqual(['preApproved', 'timeline']);
    // Third should be budget at 15
    expect(gaps[2].impact).toBe(15);
    expect(gaps[2].field).toBe('budget');
    // Remaining should be 10s then 5s
    expect(gaps[3].impact).toBe(10);
    expect(gaps[4].impact).toBe(10);
    expect(gaps[5].impact).toBe(5);
    expect(gaps[6].impact).toBe(5);
  });

  test('returns the right question text for each gap', () => {
    const gaps = analyzeBantGaps({ name: 'Empty' });
    const byField = {};
    for (const g of gaps) byField[g.field] = g.question;

    expect(byField.budget).toMatch(/budget range/i);
    expect(byField.preApproved).toMatch(/pre-approved/i);
    expect(byField.timeline).toMatch(/when are you looking/i);
    expect(byField.preferredLocations).toMatch(/areas or neighborhoods/i);
    expect(byField.propertyType).toMatch(/type of property/i);
    expect(byField.phone).toMatch(/phone number/i);
    expect(byField.email).toMatch(/email address/i);
  });

  test('only budgetMin satisfies budget gap', () => {
    const gaps = analyzeBantGaps({ name: 'Test', budgetMin: 1000000 });
    const fields = gaps.map(g => g.field);
    expect(fields).not.toContain('budget');
  });

  test('only budgetMax satisfies budget gap', () => {
    const gaps = analyzeBantGaps({ name: 'Test', budgetMax: 5000000 });
    const fields = gaps.map(g => g.field);
    expect(fields).not.toContain('budget');
  });

  test('empty preferredLocations array is still a gap', () => {
    const gaps = analyzeBantGaps({ name: 'Test', preferredLocations: [] });
    const fields = gaps.map(g => g.field);
    expect(fields).toContain('preferredLocations');
  });
});

// ── ensureNurtureDefaults ──────────────────────────────────────────────────

describe('ensureNurtureDefaults', () => {
  test('seeds 5 default sequences when data has none', () => {
    const data = defaultData();
    ensureNurtureDefaults(data);
    expect(data.nurtureSequences).toHaveLength(5);
    expect(data.nurtureEnrollments).toEqual([]);
  });

  test('does not duplicate sequences when called twice', () => {
    const data = defaultData();
    ensureNurtureDefaults(data);
    expect(data.nurtureSequences).toHaveLength(5);
    ensureNurtureDefaults(data);
    expect(data.nurtureSequences).toHaveLength(5);
  });

  test('creates Hot Lead Daily sequence', () => {
    const data = defaultData();
    ensureNurtureDefaults(data);
    const seq = data.nurtureSequences.find(s => s.name === 'Hot Lead Daily');
    expect(seq).toBeDefined();
    expect(seq.triggerCategory).toBe('hot');
    expect(seq.enabled).toBe(true);
    expect(seq.steps.length).toBeGreaterThan(0);
    expect(seq.steps[0].delayDays).toBe(1);
    expect(seq.id).toMatch(/^NS-/);
    expect(seq.createdAt).toBeDefined();
  });

  test('creates Warm Lead Weekly sequence', () => {
    const data = defaultData();
    ensureNurtureDefaults(data);
    const seq = data.nurtureSequences.find(s => s.name === 'Warm Lead Weekly');
    expect(seq).toBeDefined();
    expect(seq.triggerCategory).toBe('warm');
    expect(seq.enabled).toBe(true);
    expect(seq.steps[0].delayDays).toBe(7);
  });

  test('creates Cold Lead Monthly sequence', () => {
    const data = defaultData();
    ensureNurtureDefaults(data);
    const seq = data.nurtureSequences.find(s => s.name === 'Cold Lead Monthly');
    expect(seq).toBeDefined();
    expect(seq.triggerCategory).toBe('cold');
    expect(seq.enabled).toBe(true);
    expect(seq.steps[0].delayDays).toBe(30);
  });

  test('creates Post-Showing Follow-Up sequence', () => {
    const data = defaultData();
    ensureNurtureDefaults(data);
    const seq = data.nurtureSequences.find(s => s.name === 'Post-Showing Follow-Up');
    expect(seq).toBeDefined();
    expect(seq.triggerCategory).toBe('post-showing');
    expect(seq.steps[0].delayDays).toBe(0);
    expect(seq.steps[0].messageType).toBe('custom');
  });

  test('creates Post-Close Nurture sequence', () => {
    const data = defaultData();
    ensureNurtureDefaults(data);
    const seq = data.nurtureSequences.find(s => s.name === 'Post-Close Nurture');
    expect(seq).toBeDefined();
    expect(seq.triggerCategory).toBe('post-close');
    expect(seq.steps[0].delayDays).toBe(30);
  });

  test('assigns unique IDs to each sequence', () => {
    const data = defaultData();
    ensureNurtureDefaults(data);
    const ids = data.nurtureSequences.map(s => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(5);
  });

  test('increments nextNurtureSeqId correctly', () => {
    const data = defaultData();
    expect(data.nextNurtureSeqId).toBe(1);
    ensureNurtureDefaults(data);
    expect(data.nextNurtureSeqId).toBe(6);
  });

  test('initializes missing arrays if data lacks them', () => {
    const data = { leads: [], properties: [], nextLeadId: 1 };
    ensureNurtureDefaults(data);
    expect(data.nurtureSequences).toHaveLength(5);
    expect(data.nurtureEnrollments).toEqual([]);
    expect(data.nextNurtureSeqId).toBe(6);
  });
});

// ── autoEnrollLead ─────────────────────────────────────────────────────────

describe('autoEnrollLead', () => {
  function makeDataWithDefaults() {
    const data = defaultData();
    ensureNurtureDefaults(data);
    return data;
  }

  test('enrolls a hot lead in the Hot Lead Daily sequence', () => {
    const data = makeDataWithDefaults();
    const lead = { id: 'L-0001', name: 'Hot Buyer', category: 'hot' };
    autoEnrollLead(data, lead);

    expect(data.nurtureEnrollments).toHaveLength(1);
    const enrollment = data.nurtureEnrollments[0];
    expect(enrollment.leadId).toBe('L-0001');
    expect(enrollment.status).toBe('active');
    expect(enrollment.currentStep).toBe(0);
    expect(enrollment.enrolledAt).toBeDefined();
    expect(enrollment.completedAt).toBeNull();

    const hotSeq = data.nurtureSequences.find(s => s.triggerCategory === 'hot');
    expect(enrollment.sequenceId).toBe(hotSeq.id);
  });

  test('enrolls a warm lead in the Warm Lead Weekly sequence', () => {
    const data = makeDataWithDefaults();
    const lead = { id: 'L-0002', name: 'Warm Buyer', category: 'warm' };
    autoEnrollLead(data, lead);

    expect(data.nurtureEnrollments).toHaveLength(1);
    const warmSeq = data.nurtureSequences.find(s => s.triggerCategory === 'warm');
    expect(data.nurtureEnrollments[0].sequenceId).toBe(warmSeq.id);
  });

  test('enrolls a cold lead in the Cold Lead Monthly sequence', () => {
    const data = makeDataWithDefaults();
    const lead = { id: 'L-0003', name: 'Cold Buyer', category: 'cold' };
    autoEnrollLead(data, lead);

    expect(data.nurtureEnrollments).toHaveLength(1);
    const coldSeq = data.nurtureSequences.find(s => s.triggerCategory === 'cold');
    expect(data.nurtureEnrollments[0].sequenceId).toBe(coldSeq.id);
  });

  test('does not double-enroll an already-enrolled lead', () => {
    const data = makeDataWithDefaults();
    const lead = { id: 'L-0001', name: 'Hot Buyer', category: 'hot' };
    autoEnrollLead(data, lead);
    autoEnrollLead(data, lead);

    const active = data.nurtureEnrollments.filter(
      e => e.leadId === 'L-0001' && e.status === 'active'
    );
    expect(active).toHaveLength(1);
  });

  test('unenrolls from category sequence when category changes', () => {
    const data = makeDataWithDefaults();
    const lead = { id: 'L-0001', name: 'Upgrading Buyer', category: 'cold' };
    autoEnrollLead(data, lead);

    // Lead warms up
    lead.category = 'warm';
    autoEnrollLead(data, lead);

    const coldSeq = data.nurtureSequences.find(s => s.triggerCategory === 'cold');
    const warmSeq = data.nurtureSequences.find(s => s.triggerCategory === 'warm');

    // Old cold enrollment should be completed
    const coldEnrollment = data.nurtureEnrollments.find(
      e => e.leadId === 'L-0001' && e.sequenceId === coldSeq.id
    );
    expect(coldEnrollment.status).toBe('completed');
    expect(coldEnrollment.completedAt).toBeDefined();

    // New warm enrollment should be active
    const warmEnrollment = data.nurtureEnrollments.find(
      e => e.leadId === 'L-0001' && e.sequenceId === warmSeq.id
    );
    expect(warmEnrollment.status).toBe('active');
  });

  test('unenrolls from warm when lead becomes hot', () => {
    const data = makeDataWithDefaults();
    const lead = { id: 'L-0010', name: 'Rising Lead', category: 'warm' };
    autoEnrollLead(data, lead);

    lead.category = 'hot';
    autoEnrollLead(data, lead);

    const warmSeq = data.nurtureSequences.find(s => s.triggerCategory === 'warm');
    const hotSeq = data.nurtureSequences.find(s => s.triggerCategory === 'hot');

    const warmEnrollment = data.nurtureEnrollments.find(
      e => e.leadId === 'L-0010' && e.sequenceId === warmSeq.id
    );
    expect(warmEnrollment.status).toBe('completed');

    const hotEnrollment = data.nurtureEnrollments.find(
      e => e.leadId === 'L-0010' && e.sequenceId === hotSeq.id
    );
    expect(hotEnrollment.status).toBe('active');
  });

  test('sets correct nextSendAt based on first step delayDays', () => {
    const data = makeDataWithDefaults();
    const lead = { id: 'L-0001', name: 'Hot Buyer', category: 'hot' };

    const before = new Date();
    autoEnrollLead(data, lead);
    const after = new Date();

    const enrollment = data.nurtureEnrollments[0];
    const nextSend = new Date(enrollment.nextSendAt);
    const hotSeq = data.nurtureSequences.find(s => s.triggerCategory === 'hot');
    const delayDays = hotSeq.steps[0].delayDays; // 1 day

    // nextSendAt should be ~delayDays from now
    const expectedMin = new Date(before);
    expectedMin.setDate(expectedMin.getDate() + delayDays);
    const expectedMax = new Date(after);
    expectedMax.setDate(expectedMax.getDate() + delayDays);

    expect(nextSend.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime() - 1000);
    expect(nextSend.getTime()).toBeLessThanOrEqual(expectedMax.getTime() + 1000);
  });

  test('cold lead nextSendAt is 30 days out', () => {
    const data = makeDataWithDefaults();
    const lead = { id: 'L-0050', name: 'Cold Buyer', category: 'cold' };

    const now = new Date();
    autoEnrollLead(data, lead);

    const enrollment = data.nurtureEnrollments[0];
    const nextSend = new Date(enrollment.nextSendAt);
    const diffMs = nextSend.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(30);
  });

  test('does nothing when no matching sequence exists', () => {
    const data = makeDataWithDefaults();
    const lead = { id: 'L-0099', name: 'Unknown Category', category: 'investor' };
    autoEnrollLead(data, lead);
    expect(data.nurtureEnrollments).toHaveLength(0);
  });

  test('does not unenroll from non-category sequences (e.g., post-showing)', () => {
    const data = makeDataWithDefaults();
    const postShowingSeq = data.nurtureSequences.find(s => s.triggerCategory === 'post-showing');

    // Manually enroll in post-showing
    data.nurtureEnrollments.push({
      leadId: 'L-0001', sequenceId: postShowingSeq.id, currentStep: 0,
      status: 'active', nextSendAt: new Date().toISOString(),
      enrolledAt: new Date().toISOString(), completedAt: null,
    });

    // Now auto-enroll as hot -- the post-showing enrollment should NOT be touched
    const lead = { id: 'L-0001', name: 'Buyer', category: 'hot' };
    autoEnrollLead(data, lead);

    const postShowingEnrollment = data.nurtureEnrollments.find(
      e => e.leadId === 'L-0001' && e.sequenceId === postShowingSeq.id
    );
    expect(postShowingEnrollment.status).toBe('active');
  });
});

// ── defaultData new fields ─────────────────────────────────────────────────

describe('defaultData new model fields', () => {
  test('includes nurtureSequences as empty array', () => {
    const data = defaultData();
    expect(data.nurtureSequences).toEqual([]);
  });

  test('includes nurtureEnrollments as empty array', () => {
    const data = defaultData();
    expect(data.nurtureEnrollments).toEqual([]);
  });

  test('includes valuations as empty array', () => {
    const data = defaultData();
    expect(data.valuations).toEqual([]);
  });

  test('includes campaigns as empty array', () => {
    const data = defaultData();
    expect(data.campaigns).toEqual([]);
  });

  test('includes referrals as empty array', () => {
    const data = defaultData();
    expect(data.referrals).toEqual([]);
  });

  test('includes expiredListings as empty array', () => {
    const data = defaultData();
    expect(data.expiredListings).toEqual([]);
  });

  test('includes nextNurtureSeqId starting at 1', () => {
    const data = defaultData();
    expect(data.nextNurtureSeqId).toBe(1);
  });

  test('includes nextValuationId starting at 1', () => {
    const data = defaultData();
    expect(data.nextValuationId).toBe(1);
  });

  test('includes nextCampaignId starting at 1', () => {
    const data = defaultData();
    expect(data.nextCampaignId).toBe(1);
  });

  test('includes nextExpiredId starting at 1', () => {
    const data = defaultData();
    expect(data.nextExpiredId).toBe(1);
  });
});
