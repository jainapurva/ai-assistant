/**
 * Tests for Claude CLI stdout JSON extraction logic.
 * The bot must handle stdout that contains warning lines before the JSON result.
 */

describe('Claude stdout JSON extraction', () => {
  // This mirrors the extraction logic in claude.js runClaude()
  function extractResult(stdout) {
    let jsonToParse = stdout;
    const jsonMatch = stdout.match(/(\{[^\n]*"type"\s*:\s*"result"[^\n]*\})\s*$/);
    if (jsonMatch) {
      jsonToParse = jsonMatch[1];
    }

    try {
      const json = JSON.parse(jsonToParse);
      return { result: json.result || stdout, sessionId: json.session_id, tokens: json.usage ? { input: json.usage.input_tokens || 0, output: json.usage.output_tokens || 0 } : null };
    } catch (e) {
      const lines = stdout.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      try {
        const fallback = JSON.parse(lastLine);
        return { result: fallback.result || lastLine, sessionId: fallback.session_id, tokens: null };
      } catch {
        return { result: stdout, sessionId: null, tokens: null };
      }
    }
  }

  test('parses clean JSON output', () => {
    const stdout = '{"type":"result","result":"Hello!","session_id":"abc-123","usage":{"input_tokens":10,"output_tokens":5}}';
    const parsed = extractResult(stdout);
    expect(parsed.result).toBe('Hello!');
    expect(parsed.sessionId).toBe('abc-123');
    expect(parsed.tokens).toEqual({ input: 10, output: 5 });
  });

  test('extracts JSON from stdout with warning lines before it', () => {
    const stdout = `Claude configuration file not found at: /home/claude/.claude.json
A backup file exists at: /home/claude/.claude/backups/.claude.json.backup.123

Claude configuration file not found at: /home/claude/.claude.json
A backup file exists at: /home/claude/.claude/backups/.claude.json.backup.123

{"type":"result","subtype":"success","result":"Hello! How can I help?","session_id":"sess-456","usage":{"input_tokens":100,"output_tokens":20}}
`;
    const parsed = extractResult(stdout);
    expect(parsed.result).toBe('Hello! How can I help?');
    expect(parsed.sessionId).toBe('sess-456');
    expect(parsed.tokens).toEqual({ input: 100, output: 20 });
  });

  test('handles multiple warning blocks before JSON', () => {
    const stdout = `Warning line 1
Warning line 2

Warning line 3

{"type":"result","result":"Works fine","session_id":"s1"}
`;
    const parsed = extractResult(stdout);
    expect(parsed.result).toBe('Works fine');
    expect(parsed.sessionId).toBe('s1');
  });

  test('falls back to raw stdout when no JSON present', () => {
    const stdout = 'Just plain text output with no JSON';
    const parsed = extractResult(stdout);
    expect(parsed.result).toBe(stdout);
    expect(parsed.sessionId).toBeNull();
  });

  test('handles empty stdout', () => {
    const parsed = extractResult('');
    expect(parsed.result).toBe('');
    expect(parsed.sessionId).toBeNull();
  });

  test('handles JSON without result field', () => {
    const stdout = '{"type":"result","session_id":"x","usage":{"input_tokens":5,"output_tokens":3}}';
    const parsed = extractResult(stdout);
    // Falls back to full stdout since json.result is falsy
    expect(parsed.sessionId).toBe('x');
  });

  test('handles real-world Claude CLI output format', () => {
    const stdout = `Claude configuration file not found at: /home/claude/.claude.json
A backup file exists at: /home/claude/.claude/backups/.claude.json.backup.1772237365051
You can manually restore it by running: cp "/home/claude/.claude/backups/.claude.json.backup.1772237365051" "/home/claude/.claude.json"


Claude configuration file not found at: /home/claude/.claude.json
A backup file exists at: /home/claude/.claude/backups/.claude.json.backup.1772237365051
You can manually restore it by running: cp "/home/claude/.claude/backups/.claude.json.backup.1772237365051" "/home/claude/.claude.json"


Claude configuration file not found at: /home/claude/.claude.json
A backup file exists at: /home/claude/.claude/backups/.claude.json.backup.1772237365051
You can manually restore it by running: cp "/home/claude/.claude/backups/.claude.json.backup.1772237365051" "/home/claude/.claude.json"

{"type":"result","subtype":"success","is_error":false,"duration_ms":2537,"duration_api_ms":1827,"num_turns":1,"result":"Hello! How can I help you today?","stop_reason":null,"session_id":"2eb03577-199d-455b-b66d-8268f59e10c8","total_cost_usd":0.042,"usage":{"input_tokens":3,"cache_creation_input_tokens":5562,"cache_read_input_tokens":13948,"output_tokens":12}}
`;
    const parsed = extractResult(stdout);
    expect(parsed.result).toBe('Hello! How can I help you today?');
    expect(parsed.sessionId).toBe('2eb03577-199d-455b-b66d-8268f59e10c8');
    expect(parsed.tokens).toEqual({ input: 3, output: 12 });
  });
});
