const { buildSafeEnv, filterSensitiveOutput, SECURITY_SYSTEM_PROMPT } = require('../../src/security');

describe('buildSafeEnv', () => {
  test('always includes TERM=dumb', () => {
    const env = buildSafeEnv();
    expect(env.TERM).toBe('dumb');
  });

  test('never includes CLAUDECODE', () => {
    const env = buildSafeEnv();
    expect(env.CLAUDECODE).toBeUndefined();
  });

  test('includes safe keys that exist in process.env', () => {
    const env = buildSafeEnv();
    if (process.env.HOME) expect(env.HOME).toBe(process.env.HOME);
    if (process.env.PATH) expect(env.PATH).toBe(process.env.PATH);
  });

  test('strips OPENAI_API_KEY even if set', () => {
    process.env.OPENAI_API_KEY = 'sk-test-fake-key-1234567890abcdef';
    const env = buildSafeEnv();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    delete process.env.OPENAI_API_KEY;
  });

  test('strips arbitrary secret vars not in whitelist', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_fakekey123';
    process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop';
    const env = buildSafeEnv();
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.GMAIL_APP_PASSWORD).toBeUndefined();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.GMAIL_APP_PASSWORD;
  });

  test('only contains keys from the whitelist', () => {
    const env = buildSafeEnv();
    const allowedKeys = new Set([
      'PATH', 'HOME', 'USER', 'LOGNAME', 'USERNAME', 'SHELL',
      'TERM', 'COLORTERM', 'COLUMNS', 'LINES',
      'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE', 'LC_MESSAGES',
      'LC_COLLATE', 'LC_NUMERIC', 'LC_TIME', 'LC_MONETARY',
      'TZ', 'NODE_ENV', 'NODE_PATH', 'NODE_VERSION',
      'NVM_DIR', 'NVM_BIN', 'NVM_INC',
      'TMPDIR', 'TEMP', 'TMP',
      'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL',
      'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_EDITOR',
      'PUPPETEER_CACHE_DIR', 'DISPLAY',
    ]);
    for (const key of Object.keys(env)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });
});

describe('filterSensitiveOutput', () => {
  test('passes clean text through unchanged', () => {
    const { text, redacted } = filterSensitiveOutput('Hello, world!');
    expect(text).toBe('Hello, world!');
    expect(redacted).toBe(false);
  });

  test('redacts OpenAI API key', () => {
    const { text, redacted, labels } = filterSensitiveOutput('Use this key: sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(redacted).toBe(true);
    expect(text).toContain('[REDACTED:');
    expect(text).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(labels).toContain('OpenAI API key');
  });

  test('redacts Stripe live key', () => {
    const fakeKey = 'sk_live_' + 'X'.repeat(24);
    const { text, redacted } = filterSensitiveOutput(fakeKey);
    expect(redacted).toBe(true);
    expect(text).not.toContain('sk_live_');
  });

  test('redacts Stripe test key', () => {
    const fakeKey = 'sk_test_' + 'Y'.repeat(24);
    const { text, redacted } = filterSensitiveOutput('key=' + fakeKey);
    expect(redacted).toBe(true);
    expect(text).not.toContain('sk_test_');
  });

  test('redacts JWT token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const { text, redacted } = filterSensitiveOutput(`Token: ${jwt}`);
    expect(redacted).toBe(true);
    expect(text).not.toContain(jwt);
  });

  test('redacts credential value pattern', () => {
    const { text, redacted } = filterSensitiveOutput('api_key = supersecretvalue12345678');
    expect(redacted).toBe(true);
    expect(text).not.toContain('supersecretvalue12345678');
  });

  test('redacts Bearer token', () => {
    const { text, redacted } = filterSensitiveOutput('Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890');
    expect(redacted).toBe(true);
    expect(text).not.toContain('abcdefghijklmnopqrstuvwxyz1234567890');
  });

  test('returns all labels found', () => {
    const input = 'key: sk-openai123456789012345678901234 and sk_live_stripe123456789012345';
    const { labels } = filterSensitiveOutput(input);
    expect(labels.length).toBeGreaterThan(0);
  });

  test('does not false-positive on short strings', () => {
    const { redacted } = filterSensitiveOutput('The result is abc123 or key=short');
    expect(redacted).toBe(false);
  });
});

describe('SECURITY_SYSTEM_PROMPT', () => {
  test('is a non-empty string', () => {
    expect(typeof SECURITY_SYSTEM_PROMPT).toBe('string');
    expect(SECURITY_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  test('mentions API keys', () => {
    expect(SECURITY_SYSTEM_PROMPT.toLowerCase()).toContain('api key');
  });

  test('mentions env/environment variables', () => {
    expect(SECURITY_SYSTEM_PROMPT.toLowerCase()).toMatch(/env|environment/);
  });
});
