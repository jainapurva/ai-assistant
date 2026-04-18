-- Add password_hash column to users table for email/password sign-in
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
