-- Add name and email columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(320);
