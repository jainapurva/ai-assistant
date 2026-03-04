const { stripAnsi, chunkMessage, markdownToWhatsApp } = require('../../src/formatter');

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

describe('markdownToWhatsApp', () => {
  test('converts **bold** to *bold*', () => {
    expect(markdownToWhatsApp('this is **bold** text')).toBe('this is *bold* text');
  });

  test('converts __text__ to _text_', () => {
    expect(markdownToWhatsApp('this is __underline__ text')).toBe('this is _underline_ text');
  });

  test('converts markdown headers to bold', () => {
    expect(markdownToWhatsApp('## My Header')).toBe('*My Header*');
    expect(markdownToWhatsApp('### Sub Header')).toBe('*Sub Header*');
    expect(markdownToWhatsApp('# Title')).toBe('*Title*');
  });

  test('converts markdown links to text: url', () => {
    expect(markdownToWhatsApp('[Google](https://google.com)')).toBe('Google: https://google.com');
  });

  test('converts fenced code blocks to inline code', () => {
    expect(markdownToWhatsApp('```js\nconsole.log("hi")\n```')).toBe('`console.log("hi")`');
  });

  test('converts multiline fenced code blocks', () => {
    const input = '```\nline1\nline2\nline3\n```';
    expect(markdownToWhatsApp(input)).toBe('`line1\nline2\nline3`');
  });

  test('converts - list items to bullet', () => {
    expect(markdownToWhatsApp('- first item\n- second item')).toBe('• first item\n• second item');
  });

  test('converts * list items to bullet without breaking bold', () => {
    expect(markdownToWhatsApp('* list item')).toBe('• list item');
    // *bold* should NOT be converted to bullet
    expect(markdownToWhatsApp('*bold text*')).toBe('*bold text*');
  });

  test('handles mixed formatting', () => {
    const input = '## Title\n\n**Important**: check [docs](https://example.com)\n\n- item 1\n- item 2';
    const expected = '*Title*\n\n*Important*: check docs: https://example.com\n\n• item 1\n• item 2';
    expect(markdownToWhatsApp(input)).toBe(expected);
  });

  test('passes through plain text unchanged', () => {
    expect(markdownToWhatsApp('hello world')).toBe('hello world');
  });

  test('passes through WhatsApp formatting unchanged', () => {
    expect(markdownToWhatsApp('*bold* _italic_ ~strike~ `code`')).toBe('*bold* _italic_ ~strike~ `code`');
  });

  test('handles null/empty input', () => {
    expect(markdownToWhatsApp(null)).toBe(null);
    expect(markdownToWhatsApp('')).toBe('');
  });
});
