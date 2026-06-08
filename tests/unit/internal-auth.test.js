/**
 * Tests for internal API per-chat token auth (src/internal-auth.js).
 */

jest.mock('../../src/config', () => ({ internalApiSecret: 'test-secret-abc123', serviceApiSecret: 'svc-secret-xyz789' }));

const config = require('../../src/config');
const auth = require('../../src/internal-auth');

describe('isProtectedPath', () => {
  test.each([
    ['/gmail/inbox', true],
    ['/drive/list', true],
    ['/sheets/read', true],
    ['/docs/read', true],
    ['/outlook/send', true],
    ['/github/repos', true],
    ['/shopify/orders', true],
    ['/freetools/list-posts', true],
    ['/jobs/search', true],
    ['/schedule/create', true],
    ['/heartbeat/trigger', true],
    ['/sheets/read?x=1', true],
    ['/send', false],
    ['/health', false],
    ['/setup-agent', false],
    ['/', false],
  ])('%s -> %s', (url, expected) => {
    expect(auth.isProtectedPath(url)).toBe(expected);
  });
});

describe('tokenFor / verify', () => {
  test('a token verifies for its own chatId', () => {
    const t = auth.tokenFor('14243937267@c.us');
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(auth.verify('14243937267@c.us', t)).toBe(true);
  });

  test('a token for one chat does NOT verify for another (cross-user block)', () => {
    const dhruvil = auth.tokenFor('14243937267@c.us');
    expect(auth.verify('16262300167@c.us', dhruvil)).toBe(false);
  });

  test('missing / empty / wrong token is rejected', () => {
    expect(auth.verify('14243937267@c.us', undefined)).toBe(false);
    expect(auth.verify('14243937267@c.us', '')).toBe(false);
    expect(auth.verify('14243937267@c.us', 'deadbeef')).toBe(false);
  });

  test('missing chatId is rejected', () => {
    const t = auth.tokenFor('14243937267@c.us');
    expect(auth.verify(undefined, t)).toBe(false);
  });

  test('verify is constant-time-safe against different-length tokens', () => {
    expect(auth.verify('14243937267@c.us', 'short')).toBe(false);
  });
});

describe('secret configuration', () => {
  afterEach(() => { config.internalApiSecret = 'test-secret-abc123'; });

  test('no secret -> tokenFor returns empty, verify fails open', () => {
    config.internalApiSecret = '';
    expect(auth.tokenFor('x@c.us')).toBe('');
    expect(auth.isConfigured()).toBe(false);
    expect(auth.verify('x@c.us', 'anything')).toBe(true); // fail-open documented
  });

  test('changing the secret invalidates old tokens', () => {
    const t = auth.tokenFor('14243937267@c.us');
    config.internalApiSecret = 'a-different-secret';
    expect(auth.verify('14243937267@c.us', t)).toBe(false);
  });
});

describe('service auth (port-3000 routes)', () => {
  afterEach(() => { config.serviceApiSecret = 'svc-secret-xyz789'; });

  test.each([
    ['/setup-agent', true],
    ['/send', true],
    ['/send-template', true],
    ['/host-subdomain', true],
    ['/send?x=1', true],
    ['/webhook', false],
    ['/auth/google/callback', false],
    ['/auth/send-otp', false],
    ['/shopify/webhooks', false],
    ['/realestate/dashboard', false],
    ['/sender', false],
  ])('isServiceProtectedPath %s -> %s', (url, expected) => {
    expect(auth.isServiceProtectedPath(url)).toBe(expected);
  });

  test('correct key passes, wrong/missing key fails', () => {
    expect(auth.verifyService('svc-secret-xyz789')).toBe(true);
    expect(auth.verifyService('wrong')).toBe(false);
    expect(auth.verifyService('')).toBe(false);
    expect(auth.verifyService(undefined)).toBe(false);
  });

  test('no service secret configured -> fails open', () => {
    config.serviceApiSecret = '';
    expect(auth.isServiceConfigured()).toBe(false);
    expect(auth.verifyService('anything')).toBe(true);
  });
});
