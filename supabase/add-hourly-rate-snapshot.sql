-- Snapshot hourly_rate on time_entries at the moment of creation
-- This prevents retroactive rate changes from affecting past earnings
ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS hourly_rate numeric NOT NULL DEFAULT 0;
