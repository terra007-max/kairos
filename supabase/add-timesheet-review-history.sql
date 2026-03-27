-- Append-only review history on timesheets
-- Each review action is stored, so rejection reasons are never overwritten
ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS review_history jsonb NOT NULL DEFAULT '[]'::jsonb;
