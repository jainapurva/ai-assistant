const { detectOptions } = require('../../src/options');

describe('detectOptions', () => {
  test('returns null for plain text without numbered list', () => {
    expect(detectOptions('Hello, how can I help you?')).toBeNull();
  });

  test('returns null for single-item list', () => {
    const text = 'Here is an option:\n1. Only option';
    expect(detectOptions(text)).toBeNull();
  });

  test('detects dot-style numbered list', () => {
    const text = 'Pick one:\n1. First\n2. Second\n3. Third';
    const result = detectOptions(text);
    expect(result).not.toBeNull();
    expect(result.options).toEqual(['First', 'Second', 'Third']);
  });

  test('detects paren-style numbered list', () => {
    const text = 'Choose:\n1) Alpha\n2) Beta\n3) Gamma';
    const result = detectOptions(text);
    expect(result).not.toBeNull();
    expect(result.options).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  test('extracts question before options as pollQuestion', () => {
    const text = 'Which language do you prefer?\n1. Python\n2. JavaScript';
    const result = detectOptions(text);
    expect(result.pollQuestion).toBe('Which language do you prefer?');
  });

  test('uses "Choose an option:" as fallback pollQuestion', () => {
    const text = 'Something.\n1. Option A\n2. Option B';
    const result = detectOptions(text);
    expect(result.pollQuestion).toBe('Choose an option:');
  });

  test('captures text before options as textBefore', () => {
    const text = 'Intro text here.\n1. A\n2. B';
    const result = detectOptions(text);
    expect(result.textBefore).toBe('Intro text here.');
  });

  test('captures text after options as textAfter', () => {
    const text = '1. A\n2. B\n\nSome conclusion.';
    const result = detectOptions(text);
    expect(result.textAfter).toBe('Some conclusion.');
  });

  test('truncates options longer than 100 chars', () => {
    const longOption = 'A'.repeat(120);
    const text = `1. ${longOption}\n2. Short option`;
    const result = detectOptions(text);
    expect(result.options[0].length).toBe(100);
    expect(result.options[0].endsWith('...')).toBe(true);
  });

  test('truncates pollQuestion longer than 256 chars', () => {
    const longQuestion = 'Q'.repeat(300) + '?';
    const text = `${longQuestion}\n1. A\n2. B`;
    const result = detectOptions(text);
    expect(result.pollQuestion.length).toBe(256);
    expect(result.pollQuestion.endsWith('...')).toBe(true);
  });

  test('handles 2-digit option numbers', () => {
    const options = Array.from({ length: 12 }, (_, i) => `${i + 1}. Option ${i + 1}`).join('\n');
    const text = `Pick one:\n${options}`;
    const result = detectOptions(text);
    expect(result.options.length).toBe(12);
  });

  test('detects question with colon ending', () => {
    const text = 'Select approach:\n1. Fast\n2. Slow';
    const result = detectOptions(text);
    expect(result.pollQuestion).toBe('Select approach:');
  });

  test('detects question with keyword matching', () => {
    const text = 'Please choose the best option\n1. A\n2. B';
    const result = detectOptions(text);
    expect(result.pollQuestion).toBe('Please choose the best option');
  });

  test('returns null for text with only one valid option line', () => {
    const text = 'Just one:\n1. Single item\nNot a list item';
    expect(detectOptions(text)).toBeNull();
  });
});
