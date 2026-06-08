// Data layer for the admin dashboard (admin.swayat.com).
// All queries are read-only aggregations over users, user_analytics,
// usage_daily, promo_codes and bot_health.
import pool from "./db";

// A user counts as "active" on a day if they sent a message or ran a task.
const ACTIVE = "(messages_in > 0 OR tasks > 0)";

export interface OverviewStats {
  totalUsers: number;
  activeStatusUsers: number;
  dau: number;
  wau: number;
  mau: number;
  newToday: number;
  newThisWeek: number;
  newThisMonth: number;
  newThisQuarter: number;
  costToday: number;
  costThisMonth: number;
  costAllTime: number;
  tokensThisMonth: number;
  tasksToday: number;
  messagesToday: number;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const [users, activity, costs] = await Promise.all([
    pool.query(`
      SELECT
        count(*)::int AS total_users,
        count(*) FILTER (WHERE status = 'active')::int AS active_status_users,
        count(*) FILTER (WHERE signup_date >= (now() AT TIME ZONE 'UTC')::date)::int AS new_today,
        count(*) FILTER (WHERE signup_date >= now() - interval '7 days')::int AS new_week,
        count(*) FILTER (WHERE signup_date >= date_trunc('month', now()))::int AS new_month,
        count(*) FILTER (WHERE signup_date >= date_trunc('quarter', now()))::int AS new_quarter
      FROM users`),
    pool.query(`
      SELECT
        count(DISTINCT phone) FILTER (WHERE date = (now() AT TIME ZONE 'UTC')::date AND ${ACTIVE})::int AS dau,
        count(DISTINCT phone) FILTER (WHERE date > (now() AT TIME ZONE 'UTC')::date - 7 AND ${ACTIVE})::int AS wau,
        count(DISTINCT phone) FILTER (WHERE date > (now() AT TIME ZONE 'UTC')::date - 30 AND ${ACTIVE})::int AS mau,
        coalesce(sum(cost_usd) FILTER (WHERE date = (now() AT TIME ZONE 'UTC')::date), 0)::float AS cost_today,
        coalesce(sum(cost_usd) FILTER (WHERE date >= date_trunc('month', now())::date), 0)::float AS cost_month,
        coalesce(sum(input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens)
          FILTER (WHERE date >= date_trunc('month', now())::date), 0)::float AS tokens_month,
        coalesce(sum(tasks) FILTER (WHERE date = (now() AT TIME ZONE 'UTC')::date), 0)::int AS tasks_today,
        coalesce(sum(messages_in) FILTER (WHERE date = (now() AT TIME ZONE 'UTC')::date), 0)::int AS messages_today
      FROM usage_daily`),
    pool.query(
      `SELECT coalesce(sum(total_cost_usd), 0)::float AS cost_all_time FROM user_analytics`
    ),
  ]);

  const u = users.rows[0];
  const a = activity.rows[0];
  return {
    totalUsers: u.total_users,
    activeStatusUsers: u.active_status_users,
    newToday: u.new_today,
    newThisWeek: u.new_week,
    newThisMonth: u.new_month,
    newThisQuarter: u.new_quarter,
    dau: a.dau,
    wau: a.wau,
    mau: a.mau,
    costToday: a.cost_today,
    costThisMonth: a.cost_month,
    tokensThisMonth: a.tokens_month,
    tasksToday: a.tasks_today,
    messagesToday: a.messages_today,
    costAllTime: costs.rows[0].cost_all_time,
  };
}

export interface DailyPoint {
  date: string;
  activeUsers: number;
  messagesIn: number;
  tasks: number;
  costUsd: number;
  tokens: number;
  signups: number;
}

/** Daily time series for the last N days (calendar-complete, zero-filled). */
export async function getDailySeries(days: number): Promise<DailyPoint[]> {
  const result = await pool.query(
    `WITH series AS (
      SELECT generate_series(
        (now() AT TIME ZONE 'UTC')::date - ($1::int - 1),
        (now() AT TIME ZONE 'UTC')::date,
        '1 day'
      )::date AS date
    ),
    usage AS (
      SELECT date,
        count(DISTINCT phone) FILTER (WHERE ${ACTIVE})::int AS active_users,
        sum(messages_in)::int AS messages_in,
        sum(tasks)::int AS tasks,
        sum(cost_usd)::float AS cost_usd,
        sum(input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens)::float AS tokens
      FROM usage_daily
      WHERE date > (now() AT TIME ZONE 'UTC')::date - $1::int
      GROUP BY date
    ),
    signups AS (
      SELECT signup_date::date AS date, count(*)::int AS signups
      FROM users
      WHERE signup_date > now() - ($1::int || ' days')::interval
      GROUP BY signup_date::date
    )
    SELECT
      to_char(s.date, 'YYYY-MM-DD') AS date,
      coalesce(u.active_users, 0) AS active_users,
      coalesce(u.messages_in, 0) AS messages_in,
      coalesce(u.tasks, 0) AS tasks,
      coalesce(u.cost_usd, 0) AS cost_usd,
      coalesce(u.tokens, 0) AS tokens,
      coalesce(g.signups, 0) AS signups
    FROM series s
    LEFT JOIN usage u ON u.date = s.date
    LEFT JOIN signups g ON g.date = s.date
    ORDER BY s.date`,
    [days]
  );
  return result.rows.map((r) => ({
    date: r.date,
    activeUsers: r.active_users,
    messagesIn: r.messages_in,
    tasks: r.tasks,
    costUsd: r.cost_usd,
    tokens: r.tokens,
    signups: r.signups,
  }));
}

export interface MonthlyPoint {
  month: string; // YYYY-MM
  signups: number;
  activeUsers: number;
  costUsd: number;
}

/** Monthly rollup for the last N months (signups, MAU, cost). */
export async function getMonthlySeries(months: number): Promise<MonthlyPoint[]> {
  const result = await pool.query(
    `WITH series AS (
      SELECT generate_series(
        date_trunc('month', now()) - (($1::int - 1) || ' months')::interval,
        date_trunc('month', now()),
        '1 month'
      )::date AS month
    ),
    signups AS (
      SELECT date_trunc('month', signup_date)::date AS month, count(*)::int AS signups
      FROM users GROUP BY 1
    ),
    usage AS (
      SELECT date_trunc('month', date)::date AS month,
        count(DISTINCT phone) FILTER (WHERE ${ACTIVE})::int AS active_users,
        sum(cost_usd)::float AS cost_usd
      FROM usage_daily GROUP BY 1
    )
    SELECT to_char(s.month, 'YYYY-MM') AS month,
      coalesce(g.signups, 0) AS signups,
      coalesce(u.active_users, 0) AS active_users,
      coalesce(u.cost_usd, 0) AS cost_usd
    FROM series s
    LEFT JOIN signups g ON g.month = s.month
    LEFT JOIN usage u ON u.month = s.month
    ORDER BY s.month`,
    [months]
  );
  return result.rows.map((r) => ({
    month: r.month,
    signups: r.signups,
    activeUsers: r.active_users,
    costUsd: r.cost_usd,
  }));
}

export interface AdminUserRow {
  phone: string;
  fullName: string | null;
  status: string | null;
  signupDate: string | null;
  trialExpiresAt: string | null;
  promoCode: string | null;
  subscriptionStatus: string | null;
  messagesIn: number;
  tasks: number;
  totalTokens: number;
  costUsd: number;
  cost7d: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  activeDays: number;
}

/** Full user list: signups joined with bot usage (includes bot-only users). */
export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const result = await pool.query(`
    SELECT
      coalesce(u.phone, a.phone) AS phone,
      u.full_name,
      u.status,
      u.signup_date,
      u.trial_expires_at,
      u.promo_code_used,
      u.subscription_status,
      coalesce(a.total_messages_in, 0)::int AS messages_in,
      coalesce(a.total_tasks, 0)::int AS tasks,
      coalesce(a.total_input_tokens + a.total_output_tokens
        + a.total_cache_creation_tokens + a.total_cache_read_tokens, 0)::float AS total_tokens,
      coalesce(a.total_cost_usd, 0)::float AS cost_usd,
      coalesce(d.cost_7d, 0)::float AS cost_7d,
      coalesce(d.active_days, 0)::int AS active_days,
      a.first_activity_at,
      a.last_activity_at
    FROM users u
    FULL OUTER JOIN user_analytics a ON a.phone = u.phone
    LEFT JOIN LATERAL (
      SELECT
        sum(cost_usd) FILTER (WHERE date > (now() AT TIME ZONE 'UTC')::date - 7) AS cost_7d,
        count(*) FILTER (WHERE ${ACTIVE}) AS active_days
      FROM usage_daily ud
      WHERE ud.phone = coalesce(u.phone, a.phone)
    ) d ON true
    ORDER BY coalesce(a.total_cost_usd, 0) DESC NULLS LAST`);

  return result.rows.map((r) => ({
    phone: r.phone,
    fullName: r.full_name,
    status: r.status,
    signupDate: r.signup_date,
    trialExpiresAt: r.trial_expires_at,
    promoCode: r.promo_code_used,
    subscriptionStatus: r.subscription_status,
    messagesIn: r.messages_in,
    tasks: r.tasks,
    totalTokens: r.total_tokens,
    costUsd: r.cost_usd,
    cost7d: r.cost_7d,
    activeDays: r.active_days,
    firstActivityAt: r.first_activity_at,
    lastActivityAt: r.last_activity_at,
  }));
}

export interface AdminUserDetail {
  user: Record<string, unknown> | null;
  analytics: Record<string, unknown> | null;
  daily: DailyPoint[];
}

export async function getAdminUserDetail(phone: string, days = 90): Promise<AdminUserDetail> {
  const [user, analytics, daily] = await Promise.all([
    pool.query(
      `SELECT phone, full_name, email, status, signup_date, trial_expires_at,
        promo_code_used, subscription_status, business_type, default_agent
       FROM users WHERE phone = $1`,
      [phone]
    ),
    pool.query(`SELECT * FROM user_analytics WHERE phone = $1`, [phone]),
    pool.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date,
        messages_in, tasks, cost_usd::float AS cost_usd,
        (input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens)::float AS tokens
       FROM usage_daily
       WHERE phone = $1 AND date > (now() AT TIME ZONE 'UTC')::date - $2::int
       ORDER BY date`,
      [phone, days]
    ),
  ]);
  return {
    user: user.rows[0] || null,
    analytics: analytics.rows[0] || null,
    daily: daily.rows.map((r) => ({
      date: r.date,
      activeUsers: 0,
      messagesIn: r.messages_in,
      tasks: r.tasks,
      costUsd: r.cost_usd,
      tokens: r.tokens,
      signups: 0,
    })),
  };
}

export interface FunnelStats {
  signedUp: number;
  reachedBot: number; // has any analytics row (sent ≥1 message)
  repeatUsers: number; // active on ≥2 distinct days
  activeLast7d: number;
  trialsExpiringSoon: { phone: string; fullName: string | null; trialExpiresAt: string }[];
  dormantUsers: { phone: string; fullName: string | null; lastActivityAt: string; costUsd: number }[];
  promoCodes: { code: string; trialDays: number; uses: number; maxUses: number | null; usesRemaining: number | null }[];
}

export async function getFunnelStats(): Promise<FunnelStats> {
  const [funnel, trials, dormant, promos] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT count(*) FROM users)::int AS signed_up,
        (SELECT count(*) FROM users u JOIN user_analytics a ON a.phone = u.phone
          WHERE a.total_messages_in > 0)::int AS reached_bot,
        (SELECT count(*) FROM (
          SELECT phone FROM usage_daily WHERE ${ACTIVE} GROUP BY phone HAVING count(*) >= 2
        ) r JOIN users u ON u.phone = r.phone)::int AS repeat_users,
        (SELECT count(DISTINCT ud.phone) FROM usage_daily ud JOIN users u ON u.phone = ud.phone
          WHERE ud.date > (now() AT TIME ZONE 'UTC')::date - 7 AND ${ACTIVE})::int AS active_7d`),
    pool.query(`
      SELECT phone, full_name, trial_expires_at
      FROM users
      WHERE trial_expires_at IS NOT NULL
        AND trial_expires_at BETWEEN now() AND now() + interval '14 days'
      ORDER BY trial_expires_at`),
    pool.query(`
      SELECT u.phone, u.full_name, a.last_activity_at, a.total_cost_usd::float AS cost_usd
      FROM users u
      JOIN user_analytics a ON a.phone = u.phone
      WHERE a.last_activity_at < now() - interval '14 days'
      ORDER BY a.last_activity_at DESC`),
    pool.query(`
      SELECT p.code, p.trial_days, p.max_uses, p.uses_remaining,
        (SELECT count(*) FROM users WHERE promo_code_used = p.code)::int AS uses
      FROM promo_codes p
      ORDER BY uses DESC`),
  ]);

  const f = funnel.rows[0];
  return {
    signedUp: f.signed_up,
    reachedBot: f.reached_bot,
    repeatUsers: f.repeat_users,
    activeLast7d: f.active_7d,
    trialsExpiringSoon: trials.rows.map((r) => ({
      phone: r.phone,
      fullName: r.full_name,
      trialExpiresAt: r.trial_expires_at,
    })),
    dormantUsers: dormant.rows.map((r) => ({
      phone: r.phone,
      fullName: r.full_name,
      lastActivityAt: r.last_activity_at,
      costUsd: r.cost_usd,
    })),
    promoCodes: promos.rows.map((r) => ({
      code: r.code,
      trialDays: r.trial_days,
      uses: r.uses,
      maxUses: r.max_uses,
      usesRemaining: r.uses_remaining,
    })),
  };
}

export interface BotHealth {
  reportedAt: string | null;
  startedAt: string | null;
  uptimeSecs: number | null;
  queuedMessages: number | null;
  activeTasks: number | null;
  errorsLastHour: number | null;
  metaTokenOk: boolean | null;
  payload: Record<string, unknown> | null;
  isStale: boolean;
}

export async function getBotHealth(): Promise<BotHealth | null> {
  const result = await pool.query(`SELECT *, (reported_at < now() - interval '12 minutes') AS is_stale FROM bot_health WHERE id = 1`);
  const r = result.rows[0];
  if (!r) return null;
  return {
    reportedAt: r.reported_at,
    startedAt: r.started_at,
    uptimeSecs: r.uptime_secs != null ? Number(r.uptime_secs) : null,
    queuedMessages: r.queued_messages,
    activeTasks: r.active_tasks,
    errorsLastHour: r.errors_last_hour,
    metaTokenOk: r.meta_token_ok,
    payload: r.payload,
    isStale: r.is_stale,
  };
}
