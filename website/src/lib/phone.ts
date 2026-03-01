const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * Normalize a phone input to E.164 format.
 * Accepts: +1234567890, 1234567890 (assumes +1 US), etc.
 */
export function normalizePhone(raw: string): string | null {
  let cleaned = raw.replace(/[\s\-().]/g, "");

  if (!cleaned.startsWith("+")) {
    // If it starts with a country code digit (not 0), prepend +
    if (/^[1-9]/.test(cleaned)) {
      cleaned = "+" + cleaned;
    } else {
      return null;
    }
  }

  return E164_REGEX.test(cleaned) ? cleaned : null;
}

export function isValidPhone(phone: string): boolean {
  return normalizePhone(phone) !== null;
}
