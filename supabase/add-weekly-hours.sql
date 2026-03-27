-- Add contracted weekly hours to workspace members
-- Default 40 (full-time), admin can set lower for part-time consultants
ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS weekly_hours integer NOT NULL DEFAULT 40
    CONSTRAINT weekly_hours_range CHECK (weekly_hours >= 0 AND weekly_hours <= 40);
