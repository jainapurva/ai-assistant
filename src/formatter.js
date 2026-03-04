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

/**
 * Convert Markdown formatting to WhatsApp-compatible formatting.
 * Applied as a safety net after Claude's output, before sending.
 */
function markdownToWhatsApp(text) {
  if (!text) return text;

  let result = text;

  // 1. Fenced code blocks: ```lang\ncode\n``` → `code`
  result = result.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) => {
    return '`' + code.trim() + '`';
  });

  // 2. Bold: **text** → *text*
  result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');

  // 3. Bold underscore: __text__ → _text_
  result = result.replace(/__(.+?)__/g, '_$1_');

  // 4. Headers: ## Header → *Header*
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

  // 5. Links: [text](url) → text: url
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2');

  // 6. Unordered list bullets: - item or * item → • item
  //    (only * at line start followed by space, to avoid matching *bold*)
  result = result.replace(/^[-]\s+/gm, '• ');
  result = result.replace(/^\*\s+(?![*])/gm, '• ');

  return result;
}

module.exports = { stripAnsi, chunkMessage, markdownToWhatsApp };
