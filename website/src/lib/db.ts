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
  full_name: string | null;
  email: string | null;
  promo_code_used: string | null;
  trial_expires_at: string | null;
  signup_date: string;
  status: string;
  square_customer_id: string | null;
  square_subscription_id: string | null;
  subscription_status: string;
  last_payment_at: string | null;
  default_agent: string;
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
  opts: { defaultAgent?: string; fullName?: string; email?: string } = {}
): Promise<{ success: boolean; error?: string; user?: User }> {
  const existing = await getUser(phone);
  if (existing) {
    return { success: false, error: "This phone number is already registered" };
  }

  const result = await pool.query<User>(
    `INSERT INTO users (phone, full_name, email, status, subscription_status, default_agent)
     VALUES ($1, $2, $3, 'active', 'active', $4)
     RETURNING *`,
    [phone, opts.fullName || null, opts.email || null, opts.defaultAgent || "general"]
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

// --- User analytics ---

export interface UserAnalytics {
  phone: string;
  total_messages_in: number;
  total_messages_out: number;
  total_commands: number;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  stopped_tasks: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  total_cost_usd: number;
  total_duration_secs: number;
  total_session_secs: number;
  total_media_sent: number;
  total_errors: number;
  activity_log_hash: string | null;
  first_activity_at: string | null;
  last_activity_at: string | null;
  updated_at: string;
}

export async function upsertUserAnalytics(
  phone: string,
  data: {
    messagesIn?: number;
    messagesOut?: number;
    commands?: number;
    tasks?: number;
    completedTasks?: number;
    failedTasks?: number;
    stoppedTasks?: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    costUsd?: number;
    durationSecs?: number;
    sessionSecs?: number;
    mediaSent?: number;
    errors?: number;
    activityLogHash?: string;
    lastActivityAt?: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  // Incremental upsert: INSERT initial values, or ADD deltas to existing row
  await pool.query(
    `INSERT INTO user_analytics (
      phone, total_messages_in, total_messages_out, total_commands,
      total_tasks, completed_tasks, failed_tasks, stopped_tasks,
      total_input_tokens, total_output_tokens,
      total_cache_creation_tokens, total_cache_read_tokens,
      total_cost_usd, total_duration_secs, total_session_secs,
      total_media_sent, total_errors, activity_log_hash,
      first_activity_at, last_activity_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $19, $19
    )
    ON CONFLICT (phone) DO UPDATE SET
      total_messages_in = user_analytics.total_messages_in + $2,
      total_messages_out = user_analytics.total_messages_out + $3,
      total_commands = user_analytics.total_commands + $4,
      total_tasks = user_analytics.total_tasks + $5,
      completed_tasks = user_analytics.completed_tasks + $6,
      failed_tasks = user_analytics.failed_tasks + $7,
      stopped_tasks = user_analytics.stopped_tasks + $8,
      total_input_tokens = user_analytics.total_input_tokens + $9,
      total_output_tokens = user_analytics.total_output_tokens + $10,
      total_cache_creation_tokens = user_analytics.total_cache_creation_tokens + $11,
      total_cache_read_tokens = user_analytics.total_cache_read_tokens + $12,
      total_cost_usd = user_analytics.total_cost_usd + $13,
      total_duration_secs = user_analytics.total_duration_secs + $14,
      total_session_secs = user_analytics.total_session_secs + $15,
      total_media_sent = user_analytics.total_media_sent + $16,
      total_errors = user_analytics.total_errors + $17,
      activity_log_hash = COALESCE($18, user_analytics.activity_log_hash),
      last_activity_at = $19,
      updated_at = $19`,
    [
      phone,
      data.messagesIn || 0,
      data.messagesOut || 0,
      data.commands || 0,
      data.tasks || 0,
      data.completedTasks || 0,
      data.failedTasks || 0,
      data.stoppedTasks || 0,
      data.inputTokens || 0,
      data.outputTokens || 0,
      data.cacheCreationTokens || 0,
      data.cacheReadTokens || 0,
      data.costUsd || 0,
      data.durationSecs || 0,
      data.sessionSecs || 0,
      data.mediaSent || 0,
      data.errors || 0,
      data.activityLogHash || null,
      now,
    ]
  );
}

export async function getUserAnalytics(
  phone: string
): Promise<UserAnalytics | null> {
  const result = await pool.query<UserAnalytics>(
    "SELECT * FROM user_analytics WHERE phone = $1",
    [phone]
  );
  return result.rows[0] || null;
}

export async function getAllUserAnalytics(): Promise<UserAnalytics[]> {
  const result = await pool.query<UserAnalytics>(
    "SELECT * FROM user_analytics ORDER BY last_activity_at DESC"
  );
  return result.rows;
}
