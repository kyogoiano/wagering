-- 004_add_pending_reference_fields.sql
-- Add fields for PENDING_REFERENCE retry tracking

ALTER TABLE wager_transactions
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NULL;
