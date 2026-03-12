-- Add default_agent column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_agent VARCHAR(50) DEFAULT 'general';
