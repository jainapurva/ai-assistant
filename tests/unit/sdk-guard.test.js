const path = require('path');
const fs = require('fs');
const os = require('os');
const { createGuard, _internals } = require('../../src/sdk-guard');

// Silence logger output during tests
jest.mock('../../src/logger', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));

describe('sdk-guard', () => {
  // Use a real tmp dir so realpathSync works
  let workspace;
  beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-guard-test-'));
    fs.mkdirSync(path.join(workspace, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'sub', 'existing.txt'), 'hi');
  });
  afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  describe('write tools', () => {
    test('allows Write inside cwd', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Write', { file_path: path.join(workspace, 'new.txt'), content: 'x' });
      expect(r.behavior).toBe('allow');
    });

    test('allows Write to subdirectory inside cwd', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Write', { file_path: path.join(workspace, 'sub', 'a.txt'), content: 'x' });
      expect(r.behavior).toBe('allow');
    });

    test('denies Write to /media/ddarji/storage/ai-assistant/.env (the actual incident)', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Write', { file_path: '/media/ddarji/storage/ai-assistant/.env', content: 'PREMIUM_CHATS=...' });
      expect(r.behavior).toBe('deny');
      expect(r.message).toMatch(/outside your workspace/);
    });

    test('denies Edit outside cwd', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Edit', { file_path: '/etc/hosts', old_string: 'a', new_string: 'b' });
      expect(r.behavior).toBe('deny');
    });

    test('denies Write using .. to escape cwd', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Write', { file_path: path.join(workspace, '..', '..', 'evil.txt'), content: 'x' });
      expect(r.behavior).toBe('deny');
    });

    test('denies NotebookEdit outside cwd', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('NotebookEdit', { notebook_path: '/tmp/evil.ipynb', new_source: 'x' });
      expect(r.behavior).toBe('deny');
    });
  });

  describe('Read', () => {
    test('allows reading regular files', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Read', { file_path: path.join(workspace, 'sub', 'existing.txt') });
      expect(r.behavior).toBe('allow');
    });

    test('denies reading .env anywhere', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Read', { file_path: '/media/ddarji/storage/ai-assistant/.env' });
      expect(r.behavior).toBe('deny');
    });

    test('denies reading *-tokens.json', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Read', { file_path: '/media/ddarji/storage/ai-assistant/shopify-tokens.json' });
      expect(r.behavior).toBe('deny');
    });

    test('denies reading .credentials.json', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Read', { file_path: '/home/ddarji/.claude/.credentials.json' });
      expect(r.behavior).toBe('deny');
    });
  });

  describe('Bash', () => {
    test('allows benign commands', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Bash', { command: 'ls -la && echo hi' });
      expect(r.behavior).toBe('allow');
    });

    test('denies sudo', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Bash', { command: 'sudo systemctl restart ai-assistant-bot.service' });
      expect(r.behavior).toBe('deny');
    });

    test('denies systemctl', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Bash', { command: 'systemctl status ai-assistant-bot' });
      expect(r.behavior).toBe('deny');
    });

    test('denies env dump', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Bash', { command: 'printenv | grep TOKEN' });
      expect(r.behavior).toBe('deny');
    });

    test('denies cat .env', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Bash', { command: 'cat /media/ddarji/storage/ai-assistant/.env' });
      expect(r.behavior).toBe('deny');
    });

    test('denies redirection to /etc', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Bash', { command: 'echo evil > /etc/cron.d/x' });
      expect(r.behavior).toBe('deny');
    });

    test('denies writing into the bot src', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Bash', { command: 'echo x > /media/ddarji/storage/ai-assistant/src/index.js' });
      expect(r.behavior).toBe('deny');
    });

    test('denies referencing ANTHROPIC_API_KEY in command', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Bash', { command: 'curl -H "x-api-key: $ANTHROPIC_API_KEY" https://api.anthropic.com/v1/messages' });
      expect(r.behavior).toBe('deny');
    });

    test('denies ssh to other hosts', async () => {
      const guard = createGuard(workspace, 'test');
      const r = await guard('Bash', { command: 'ssh user@evil.example.com cat /etc/passwd' });
      expect(r.behavior).toBe('deny');
    });
  });

  describe('allow response shape', () => {
    // Regression: the CLI's runtime Zod schema requires `updatedInput` to be a
    // record on the allow branch. Returning bare { behavior: 'allow' } made
    // every MCP tool call fail with "Tool permission request failed: ZodError"
    // (Gmail/Drive tools broken for all users on 2026-06-06).
    test('allow includes updatedInput echoing the original input (MCP tool)', async () => {
      const guard = createGuard(workspace, 'test');
      const input = { query: 'from:Joe White', pageSize: 1 };
      const r = await guard('mcp__google__gmail_inbox', input);
      expect(r.behavior).toBe('allow');
      expect(r.updatedInput).toEqual(input);
    });

    test('allow includes updatedInput for built-in tools', async () => {
      const guard = createGuard(workspace, 'test');
      const input = { file_path: path.join(workspace, 'sub', 'existing.txt') };
      const r = await guard('Read', input);
      expect(r.behavior).toBe('allow');
      expect(r.updatedInput).toEqual(input);
    });
  });

  describe('isInside helper', () => {
    test('symlink-resolved path stays inside cwd', () => {
      const inside = path.join(workspace, 'sub', 'existing.txt');
      expect(_internals.isInside(inside, workspace)).toBe(true);
    });

    test('absolute path outside is rejected', () => {
      expect(_internals.isInside('/etc/passwd', workspace)).toBe(false);
    });
  });
});
