-- Add per-project approval tracking to timesheets
-- project_approvals: { "<project_id>": { "status": "approved"|"rejected", "by": "<user_id>", "at": "<iso_timestamp>" } }
ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS project_approvals JSONB NOT NULL DEFAULT '{}';
