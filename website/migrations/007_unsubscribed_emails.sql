-- Email suppression list for unsubscribes
CREATE TABLE IF NOT EXISTS unsubscribed_emails (
  email TEXT PRIMARY KEY,
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
