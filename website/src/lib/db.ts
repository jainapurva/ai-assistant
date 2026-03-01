import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:abcd@localhost:5432/readwithme",
});

export default pool;

// --- Promo codes ---

export interface PromoCode {
  code: string;
  description: string;
  trial_days: number;
  uses_remaining: number;
  max_uses: number;
  expires_at: string | null;
}

export async function validatePromoCode(
  code: string
): Promise<{ valid: boolean; trialDays?: number; error?: string }> {
  const result = await pool.query<PromoCode>(
    "SELECT * FROM promo_codes WHERE code = $1",
    [code.toUpperCase()]
  );

  if (result.rows.length === 0) {
    return { valid: false, error: "Invalid promo code" };
  }

  const promo = result.rows[0];

  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return { valid: false, error: "This promo code has expired" };
  }

  if (promo.uses_remaining <= 0) {
    return { valid: false, error: "This promo code has been fully redeemed" };
  }

  return { valid: true, trialDays: promo.trial_days };
}

// --- Users ---

export interface User {
  phone: string;
  promo_code_used: string | null;
  trial_expires_at: string | null;
  signup_date: string;
  status: string;
}

export async function getUser(phone: string): Promise<User | null> {
  const result = await pool.query<User>(
    "SELECT * FROM users WHERE phone = $1",
    [phone]
  );
  return result.rows[0] || null;
}

export async function createUser(
  phone: string,
  promoCode?: string
): Promise<{ success: boolean; error?: string; user?: User }> {
  const existing = await getUser(phone);
  if (existing) {
    return { success: false, error: "This phone number is already registered" };
  }

  let trialExpiresAt: Date | null = null;
  let promoCodeUsed: string | null = null;

  if (promoCode) {
    const validation = await validatePromoCode(promoCode);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Atomically decrement uses_remaining
    const updateResult = await pool.query(
      "UPDATE promo_codes SET uses_remaining = uses_remaining - 1 WHERE code = $1 AND uses_remaining > 0 RETURNING *",
      [promoCode.toUpperCase()]
    );

    if (updateResult.rowCount === 0) {
      return {
        success: false,
        error: "This promo code has been fully redeemed",
      };
    }

    const trialDays = validation.trialDays || 90;
    trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + trialDays);
    promoCodeUsed = promoCode.toUpperCase();
  }

  const result = await pool.query<User>(
    `INSERT INTO users (phone, promo_code_used, trial_expires_at, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING *`,
    [phone, promoCodeUsed, trialExpiresAt]
  );

  return { success: true, user: result.rows[0] };
}
