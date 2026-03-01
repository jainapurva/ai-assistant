const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * Normalize a phone input to E.164 format.
 * Expects the country code to already be included (e.g. +14155551234).
 */
export function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-().]/g, "");

  if (!cleaned.startsWith("+")) {
    return null;
  }

  return E164_REGEX.test(cleaned) ? cleaned : null;
}

export function isValidPhone(phone: string): boolean {
  return normalizePhone(phone) !== null;
}
