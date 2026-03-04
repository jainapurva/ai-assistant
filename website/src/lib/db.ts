import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:abcd@localhost:5432/swayat",
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
  square_customer_id: string | null;
  square_subscription_id: string | null;
  subscription_status: string;
  last_payment_at: string | null;
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
  opts?: {
    promoCode?: string;
    squareCustomerId?: string;
    squareSubscriptionId?: string;
  }
): Promise<{ success: boolean; error?: string; user?: User }> {
  const existing = await getUser(phone);
  if (existing) {
    return { success: false, error: "This phone number is already registered" };
  }

  let trialDays = 90; // default 3-month trial for everyone
  let promoCodeUsed: string | null = null;

  if (opts?.promoCode) {
    const validation = await validatePromoCode(opts.promoCode);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Atomically decrement uses_remaining
    const updateResult = await pool.query(
      "UPDATE promo_codes SET uses_remaining = uses_remaining - 1 WHERE code = $1 AND uses_remaining > 0 RETURNING *",
      [opts.promoCode.toUpperCase()]
    );

    if (updateResult.rowCount === 0) {
      return {
        success: false,
        error: "This promo code has been fully redeemed",
      };
    }

    trialDays = validation.trialDays || 90;
    promoCodeUsed = opts.promoCode.toUpperCase();
  }

  const trialExpiresAt = new Date();
  trialExpiresAt.setDate(trialExpiresAt.getDate() + trialDays);

  const result = await pool.query<User>(
    `INSERT INTO users (phone, promo_code_used, trial_expires_at, status, square_customer_id, square_subscription_id, subscription_status)
     VALUES ($1, $2, $3, 'active', $4, $5, 'trialing')
     RETURNING *`,
    [
      phone,
      promoCodeUsed,
      trialExpiresAt,
      opts?.squareCustomerId || null,
      opts?.squareSubscriptionId || null,
    ]
  );

  return { success: true, user: result.rows[0] };
}

// --- Subscription lookups ---

export async function getUserBySubscriptionId(
  subscriptionId: string
): Promise<User | null> {
  const result = await pool.query<User>(
    "SELECT * FROM users WHERE square_subscription_id = $1",
    [subscriptionId]
  );
  return result.rows[0] || null;
}

export async function getUserByCustomerId(
  customerId: string
): Promise<User | null> {
  const result = await pool.query<User>(
    "SELECT * FROM users WHERE square_customer_id = $1",
    [customerId]
  );
  return result.rows[0] || null;
}

export async function updateUserSubscriptionStatus(
  subscriptionId: string,
  status: string,
  lastPaymentAt?: Date
): Promise<void> {
  if (lastPaymentAt) {
    await pool.query(
      "UPDATE users SET subscription_status = $1, last_payment_at = $2 WHERE square_subscription_id = $3",
      [status, lastPaymentAt, subscriptionId]
    );
  } else {
    await pool.query(
      "UPDATE users SET subscription_status = $1 WHERE square_subscription_id = $2",
      [status, subscriptionId]
    );
  }
}

// --- Webhook idempotency ---

export async function isWebhookProcessed(eventId: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM webhook_events WHERE event_id = $1",
    [eventId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markWebhookProcessed(
  eventId: string,
  eventType: string
): Promise<void> {
  await pool.query(
    "INSERT INTO webhook_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING",
    [eventId, eventType]
  );
}
