// Regex covers standard ANSI escape sequences (SGR, OSC, charset selectors)
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b[()][AB012]|\x1b\[\?[0-9;]*[hlm]/g;

function stripAnsi(text) {
  return text.replace(ANSI_RE, '');
}

function chunkMessage(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Prefer splitting at newlines, then spaces, then hard-split
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf(' ', maxLen);
    if (splitAt < maxLen * 0.3) splitAt = maxLen;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

module.exports = { stripAnsi, chunkMessage };
