-- Add password_hash column to users table for dual-mode auth
-- Run this once: psql -U <user> -d <db> -f add_password_hash.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
