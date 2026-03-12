-- User analytics: tracks usage stats synced from the WhatsApp bot
CREATE TABLE IF NOT EXISTS user_analytics (
  phone            TEXT PRIMARY KEY REFERENCES users(phone),

  -- Message counts
  total_messages_in   INTEGER DEFAULT 0,
  total_messages_out  INTEGER DEFAULT 0,
  total_commands      INTEGER DEFAULT 0,

  -- Task counts
  total_tasks         INTEGER DEFAULT 0,
  completed_tasks     INTEGER DEFAULT 0,
  failed_tasks        INTEGER DEFAULT 0,
  stopped_tasks       INTEGER DEFAULT 0,

  -- Token usage
  total_input_tokens         BIGINT DEFAULT 0,
  total_output_tokens        BIGINT DEFAULT 0,
  total_cache_creation_tokens BIGINT DEFAULT 0,
  total_cache_read_tokens    BIGINT DEFAULT 0,

  -- Cost
  total_cost_usd     NUMERIC(12, 6) DEFAULT 0,

  -- Time
  total_duration_secs   INTEGER DEFAULT 0,       -- total time Claude spent processing
  total_session_secs    INTEGER DEFAULT 0,        -- total time user spent chatting (first msg to last msg per day)

  -- Media
  total_media_sent     INTEGER DEFAULT 0,
  total_errors         INTEGER DEFAULT 0,

  -- Activity log reference
  activity_log_hash    TEXT,                      -- sandbox hash for locating JSONL file

  -- Timestamps
  first_activity_at    TIMESTAMP WITH TIME ZONE,
  last_activity_at     TIMESTAMP WITH TIME ZONE,
  updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
