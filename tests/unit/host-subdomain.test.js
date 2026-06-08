const { validateSubdomain, parseRepoUrl } = require('../../src/host-subdomain');

describe('host-subdomain validation', () => {
  describe('validateSubdomain', () => {
    test('accepts valid subdomain', () => {
      expect(validateSubdomain('alice')).toBeNull();
      expect(validateSubdomain('alice-bob')).toBeNull();
      expect(validateSubdomain('site123')).toBeNull();
      expect(validateSubdomain('a')).toBeNull();
    });

    test('rejects empty', () => {
      expect(validateSubdomain('')).toMatch(/required/);
      expect(validateSubdomain(null)).toMatch(/required/);
    });

    test('rejects bad chars', () => {
      expect(validateSubdomain('Alice')).toMatch(/lowercase/);
      expect(validateSubdomain('alice_bob')).toMatch(/lowercase/);
      expect(validateSubdomain('-alice')).toMatch(/lowercase/);
      expect(validateSubdomain('alice.bob')).toMatch(/lowercase/);
    });

    test('rejects too long', () => {
      expect(validateSubdomain('a'.repeat(64))).toMatch(/lowercase/);
    });

    test('rejects reserved', () => {
      expect(validateSubdomain('www')).toMatch(/reserved/);
      expect(validateSubdomain('api')).toMatch(/reserved/);
      expect(validateSubdomain('admin')).toMatch(/reserved/);
      expect(validateSubdomain('mail')).toMatch(/reserved/);
    });

    test('rejects founder domains', () => {
      expect(validateSubdomain('apurva')).toMatch(/reserved/);
      expect(validateSubdomain('dhruvil')).toMatch(/reserved/);
    });
  });

  describe('parseRepoUrl', () => {
    test('accepts owner/repo', () => {
      expect(parseRepoUrl('owner/repo')).toBe('owner/repo');
      expect(parseRepoUrl('jainapurva/remix-of-sharma-group-landing')).toBe('jainapurva/remix-of-sharma-group-landing');
    });

    test('accepts https github URL', () => {
      expect(parseRepoUrl('https://github.com/owner/repo')).toBe('owner/repo');
      expect(parseRepoUrl('https://github.com/owner/repo.git')).toBe('owner/repo');
      expect(parseRepoUrl('https://github.com/owner/repo/')).toBe('owner/repo');
    });

    test('accepts ssh form', () => {
      expect(parseRepoUrl('git@github.com:owner/repo.git')).toBe('owner/repo');
    });

    test('rejects garbage', () => {
      expect(parseRepoUrl('not a repo')).toBeNull();
      expect(parseRepoUrl('https://gitlab.com/owner/repo')).toBeNull();
      expect(parseRepoUrl('')).toBeNull();
    });
  });
});
