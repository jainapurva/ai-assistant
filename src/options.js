/**
 * Detects numbered options/choices in Claude's response text.
 * Returns { textBefore, pollQuestion, options[], textAfter } or null if no options found.
 *
 * Matches patterns like:
 *   1. Option one
 *   2. Option two
 *   3. Option three
 *
 *   1) Option one
 *   2) Option two
 *
 * Also detects question lines ending with "?" before the options list.
 */

function detectOptions(text) {
  // Match a block of numbered options: "1. ...", "2. ...", etc. or "1) ...", "2) ..."
  const optionBlockRegex = /(?:^|\n)([ \t]*[1-9][0-9]?[.)]\s+.+(?:\n[ \t]*[1-9][0-9]?[.)]\s+.+){1,})/m;
  const match = text.match(optionBlockRegex);

  if (!match) return null;

  const blockStart = text.indexOf(match[1]);
  const blockEnd = blockStart + match[1].length;

  // Extract individual options
  const optionLines = match[1].trim().split('\n');
  const options = [];

  for (const line of optionLines) {
    const optMatch = line.trim().match(/^[1-9][0-9]?[.)]\s+(.+)/);
    if (optMatch) {
      // Trim to 100 chars (WhatsApp poll option limit)
      let optText = optMatch[1].trim();
      if (optText.length > 100) optText = optText.slice(0, 97) + '...';
      options.push(optText);
    }
  }

  // Need at least 2 options
  if (options.length < 2) return null;

  // Look for a question line before the options
  const textBefore = text.slice(0, blockStart).trim();
  const textAfter = text.slice(blockEnd).trim();

  // Try to find the question — last line ending with "?" or ":" before options
  let pollQuestion = 'Choose an option:';
  const beforeLines = textBefore.split('\n');
  for (let i = beforeLines.length - 1; i >= 0; i--) {
    const line = beforeLines[i].trim();
    if (line.endsWith('?') || line.endsWith(':')) {
      pollQuestion = line;
      break;
    }
    // Also check for lines with keywords suggesting a choice
    if (/which|choose|select|pick|prefer|option|approach/i.test(line)) {
      pollQuestion = line;
      break;
    }
  }

  // Trim poll question to 256 chars (WhatsApp limit)
  if (pollQuestion.length > 256) pollQuestion = pollQuestion.slice(0, 253) + '...';

  return {
    textBefore,
    pollQuestion,
    options,
    textAfter,
  };
}

module.exports = { detectOptions };
