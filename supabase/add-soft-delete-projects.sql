-- Soft-delete for projects: set deleted_at instead of hard-deleting
-- Time entries referencing deleted projects keep their data intact
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
