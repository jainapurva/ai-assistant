-- Admin dashboard schema (admin.swayat.com)
-- Idempotent: safe to re-run.

-- Per-user per-day usage buckets (UTC days). Written live by
-- /api/user/analytics on every bot delta, plus one-time historical backfill.
CREATE TABLE IF NOT EXISTS usage_daily (
  date date NOT NULL,
  phone text NOT NULL,
  messages_in integer NOT NULL DEFAULT 0,
  messages_out integer NOT NULL DEFAULT 0,
  tasks integer NOT NULL DEFAULT 0,
  completed_tasks integer NOT NULL DEFAULT 0,
  failed_tasks integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cache_creation_tokens bigint NOT NULL DEFAULT 0,
  cache_read_tokens bigint NOT NULL DEFAULT 0,
  cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  duration_secs bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (date, phone)
);

CREATE INDEX IF NOT EXISTS usage_daily_phone_date_idx ON usage_daily (phone, date);

-- Single-row bot heartbeat, upserted every 5 minutes by the bot's
-- health-reporter via POST /api/admin/health.
CREATE TABLE IF NOT EXISTS bot_health (
  id integer PRIMARY KEY,
  reported_at timestamptz NOT NULL,
  started_at timestamptz,
  uptime_secs bigint,
  queued_messages integer,
  active_tasks integer,
  errors_last_hour integer,
  meta_token_ok boolean,
  payload jsonb
);
