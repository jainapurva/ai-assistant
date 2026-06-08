// Admin session tokens for admin.swayat.com — HMAC-signed, cookie-based.
// Uses WebCrypto so the same code runs in both the Edge middleware and
// Node.js route handlers.

const COOKIE_NAME = "swayat_admin";
const SESSION_DAYS = 7;

function secret(): string {
  return process.env.JWT_SECRET || "swayat-default-secret-change-me";
}

async function hmacHex(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Create a signed admin session token valid for SESSION_DAYS. */
export async function createAdminToken(): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const sig = await hmacHex(`admin:${exp}`);
  return `${exp}.${sig}`;
}

/** Verify a token from the admin cookie. */
export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  if (!expStr || !sig) return false;
  const exp = parseInt(expStr, 10);
  if (!exp || exp < Date.now()) return false;
  const expected = await hmacHex(`admin:${exp}`);
  // Constant-time-ish compare
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const ADMIN_COOKIE = COOKIE_NAME;
export const ADMIN_SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
