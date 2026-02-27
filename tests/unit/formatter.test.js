const { stripAnsi, chunkMessage } = require('../../src/formatter');

describe('stripAnsi', () => {
  test('removes SGR color codes', () => {
    expect(stripAnsi('\x1b[31mred text\x1b[0m')).toBe('red text');
  });

  test('removes bold codes', () => {
    expect(stripAnsi('\x1b[1mbolded\x1b[22m')).toBe('bolded');
  });

  test('removes multiple codes', () => {
    expect(stripAnsi('\x1b[1;32mgreen bold\x1b[0m normal')).toBe('green bold normal');
  });

  test('passes through plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  test('removes OSC sequences', () => {
    expect(stripAnsi('\x1b]0;title\x07text')).toBe('text');
  });

  test('removes cursor codes', () => {
    expect(stripAnsi('\x1b[?25l\x1b[?25h')).toBe('');
  });

  test('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });

  test('removes charset selectors', () => {
    expect(stripAnsi('\x1b(Btext\x1b)0')).toBe('text');
  });
});

describe('chunkMessage', () => {
  test('returns single-element array for short text', () => {
    const result = chunkMessage('hello', 100);
    expect(result).toEqual(['hello']);
  });

  test('returns full text when exactly at limit', () => {
    const text = 'a'.repeat(100);
    expect(chunkMessage(text, 100)).toEqual([text]);
  });

  test('splits at newline when possible', () => {
    const line1 = 'first line';
    const line2 = 'second line';
    const text = line1 + '\n' + line2;
    // maxLen = 15 forces split, last newline at index 10
    const chunks = chunkMessage(text, 15);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(line1);
    expect(chunks[1]).toBe(line2);
  });

  test('splits at space when no good newline', () => {
    const text = 'hello world and more text here for splitting';
    const chunks = chunkMessage(text, 15);
    // Each chunk should be ≤ 15 chars
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(15);
    }
    // Reassembled should cover all words
    expect(chunks.join(' ')).toBe(text);
  });

  test('hard-splits when no spaces or newlines', () => {
    const text = 'a'.repeat(250);
    const chunks = chunkMessage(text, 100);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(100);
    expect(chunks[1].length).toBe(100);
    expect(chunks[2].length).toBe(50);
  });

  test('uses default maxLen of 4000', () => {
    const short = 'hello';
    expect(chunkMessage(short)).toEqual(['hello']);
  });

  test('long text split into multiple chunks preserves content', () => {
    const word = 'word ';
    const text = word.repeat(1000).trim(); // ~4999 chars
    const chunks = chunkMessage(text, 4000);
    expect(chunks.length).toBeGreaterThan(1);
    const rejoined = chunks.join(' ');
    // All original words should be present
    expect(rejoined.split(' ').length).toBe(text.split(' ').length);
  });
});
