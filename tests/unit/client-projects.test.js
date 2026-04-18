const fs = require('fs');
const path = require('path');

// Mock logger before requiring module
jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const CONFIG_PATH = path.resolve(__dirname, '..', '..', 'client-projects.json');

// Save original config and restore after tests
let originalConfig;
beforeAll(() => {
  if (fs.existsSync(CONFIG_PATH)) {
    originalConfig = fs.readFileSync(CONFIG_PATH, 'utf8');
  }
});

afterAll(() => {
  if (originalConfig) {
    fs.writeFileSync(CONFIG_PATH, originalConfig);
  } else if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
});

function writeTestConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

const cp = require('../../src/client-projects');

describe('normalizePhone', () => {
  test('strips + prefix', () => {
    expect(cp.normalizePhone('+918979484010')).toBe('918979484010');
  });

  test('strips @c.us suffix', () => {
    expect(cp.normalizePhone('918979484010@c.us')).toBe('918979484010');
  });

  test('passes through clean digits', () => {
    expect(cp.normalizePhone('14243937267')).toBe('14243937267');
  });

  test('strips dashes and spaces', () => {
    expect(cp.normalizePhone('+1-424-393-7267')).toBe('14243937267');
  });
});

describe('getProjectForPhone', () => {
  test('returns project for mapped phone number', () => {
    writeTestConfig({
      projects: {
        'test-project': {
          name: 'Test Project',
          path: __dirname, // use a path that exists
          deploy: './deploy.sh',
          url: 'https://test.example.com',
          description: 'Test project',
          clients: ['+918979484010', '+14243937267'],
        },
      },
    });
    cp.load();

    const result = cp.getProjectForPhone('+918979484010');
    expect(result).not.toBeNull();
    expect(result.id).toBe('test-project');
    expect(result.name).toBe('Test Project');
    expect(result.path).toBe(__dirname);
  });

  test('resolves from chatId format (digits@c.us)', () => {
    writeTestConfig({
      projects: {
        'test-project': {
          name: 'Test',
          path: __dirname,
          clients: ['+918979484010'],
        },
      },
    });
    cp.load();

    const result = cp.getProjectForPhone('918979484010@c.us');
    expect(result).not.toBeNull();
    expect(result.id).toBe('test-project');
  });

  test('resolves from bare digits', () => {
    writeTestConfig({
      projects: {
        'test-project': {
          name: 'Test',
          path: __dirname,
          clients: ['+918979484010'],
        },
      },
    });
    cp.load();

    const result = cp.getProjectForPhone('918979484010');
    expect(result).not.toBeNull();
  });

  test('returns null for unmapped phone', () => {
    writeTestConfig({
      projects: {
        'test-project': {
          name: 'Test',
          path: __dirname,
          clients: ['+918979484010'],
        },
      },
    });
    cp.load();

    expect(cp.getProjectForPhone('+10000000000')).toBeNull();
  });
});

describe('multiple projects', () => {
  test('maps different clients to different projects', () => {
    writeTestConfig({
      projects: {
        'project-a': {
          name: 'Project A',
          path: __dirname,
          clients: ['+918979484010'],
        },
        'project-b': {
          name: 'Project B',
          path: path.resolve(__dirname, '..'),
          clients: ['+14243937267'],
        },
      },
    });
    cp.load();

    expect(cp.getProjectForPhone('+918979484010').id).toBe('project-a');
    expect(cp.getProjectForPhone('+14243937267').id).toBe('project-b');
  });
});

describe('addClient', () => {
  test('adds a new client to a project', () => {
    writeTestConfig({
      projects: {
        'test-project': {
          name: 'Test',
          path: __dirname,
          clients: ['+918979484010'],
        },
      },
    });
    cp.load();

    expect(cp.getProjectForPhone('+19999999999')).toBeNull();
    const added = cp.addClient('test-project', '+19999999999');
    expect(added).toBe(true);
    expect(cp.getProjectForPhone('+19999999999')).not.toBeNull();

    // Verify persisted to disk
    const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    expect(saved.projects['test-project'].clients).toContain('+19999999999');
  });

  test('returns false for duplicate client', () => {
    writeTestConfig({
      projects: {
        'test-project': {
          name: 'Test',
          path: __dirname,
          clients: ['+918979484010'],
        },
      },
    });
    cp.load();

    expect(cp.addClient('test-project', '+918979484010')).toBe(false);
  });

  test('throws for nonexistent project', () => {
    writeTestConfig({ projects: {} });
    cp.load();

    expect(() => cp.addClient('nonexistent', '+19999999999')).toThrow('not found');
  });
});

describe('removeClient', () => {
  test('removes a client from a project', () => {
    writeTestConfig({
      projects: {
        'test-project': {
          name: 'Test',
          path: __dirname,
          clients: ['+918979484010', '+14243937267'],
        },
      },
    });
    cp.load();

    expect(cp.getProjectForPhone('+918979484010')).not.toBeNull();
    const removed = cp.removeClient('test-project', '+918979484010');
    expect(removed).toBe(true);
    expect(cp.getProjectForPhone('+918979484010')).toBeNull();
    // Other client unaffected
    expect(cp.getProjectForPhone('+14243937267')).not.toBeNull();
  });

  test('returns false for client not in project', () => {
    writeTestConfig({
      projects: {
        'test-project': {
          name: 'Test',
          path: __dirname,
          clients: ['+918979484010'],
        },
      },
    });
    cp.load();

    expect(cp.removeClient('test-project', '+10000000000')).toBe(false);
  });
});

describe('getAllProjects', () => {
  test('returns all projects', () => {
    writeTestConfig({
      projects: {
        'project-a': { name: 'A', path: __dirname, clients: [] },
        'project-b': { name: 'B', path: path.resolve(__dirname, '..'), clients: [] },
      },
    });
    cp.load();

    const all = cp.getAllProjects();
    expect(Object.keys(all).sort()).toEqual(['project-a', 'project-b']);
  });
});

describe('addProject', () => {
  test('adds a new project with clients', () => {
    writeTestConfig({ projects: {} });
    cp.load();

    cp.addProject('new-project', {
      name: 'New Project',
      path: __dirname,
      deploy: './deploy.sh',
      url: 'https://new.example.com',
      description: 'A new project',
      clients: ['+19999999999'],
    });

    expect(cp.getProject('new-project')).not.toBeNull();
    expect(cp.getProjectForPhone('+19999999999').id).toBe('new-project');
  });

  test('throws for duplicate project id', () => {
    writeTestConfig({
      projects: {
        existing: { name: 'Existing', path: __dirname, clients: [] },
      },
    });
    cp.load();

    expect(() => cp.addProject('existing', { path: __dirname })).toThrow('already exists');
  });
});

describe('missing config file', () => {
  test('loads gracefully when config file is missing', () => {
    // Temporarily remove the config file
    const backup = fs.readFileSync(CONFIG_PATH, 'utf8');
    fs.unlinkSync(CONFIG_PATH);

    try {
      cp.load();
      expect(cp.getProjectForPhone('+918979484010')).toBeNull();
      expect(cp.getAllProjects()).toEqual({});
    } finally {
      // Restore
      fs.writeFileSync(CONFIG_PATH, backup);
    }
  });
});
