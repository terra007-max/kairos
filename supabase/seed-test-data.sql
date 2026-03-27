-- ================================================================
-- KAIROS — Full Test Data Seed
-- Run in: Supabase Dashboard → SQL Editor
-- Requires: all migrations already applied (deleted_at, hourly_rate,
--           review_history, workspace_id on projects/clients/time_entries)
-- ================================================================

DO $$
DECLARE
  v_ws      uuid;
  v_admin   uuid; v_tom    uuid; v_fritz  uuid;
  v_jaha    uuid; v_moritz uuid; v_jd     uuid; v_michael uuid;
  v_jr      uuid; v_sr     uuid; v_lead   uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_p6 uuid;
  v_wk  int;
  v_s   timestamptz;
BEGIN

  -- ── WORKSPACE ────────────────────────────────────────────────────
  SELECT id INTO v_ws FROM workspaces LIMIT 1;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'No workspace found'; END IF;

  -- ── USER IDs (looked up by email) ────────────────────────────────
  SELECT id INTO v_admin   FROM profiles WHERE email = 'maximilian.stubhan@gmx.at';
  SELECT id INTO v_tom     FROM profiles WHERE email = 'tom.turbo@kairos-consulting.com';
  SELECT id INTO v_fritz   FROM profiles WHERE email = 'fritz.phantom@kairos-consulting.com';
  SELECT id INTO v_jaha    FROM profiles WHERE email = 'jahametedi@sharebot.net';
  SELECT id INTO v_moritz  FROM profiles WHERE email = 'moritz.stubhan@gmail.com';
  SELECT id INTO v_jd      FROM profiles WHERE email = 'jdonesch@gmail.com';
  SELECT id INTO v_michael FROM profiles WHERE email = 'skyline.michael@gmx.at';

  -- ── CONSULTANT LEVELS ────────────────────────────────────────────
  v_jr   := gen_random_uuid();
  v_sr   := gen_random_uuid();
  v_lead := gen_random_uuid();

  INSERT INTO consultant_levels (id, workspace_id, user_id, name, sort_order) VALUES
    (v_jr,   v_ws, v_admin, 'Junior Consultant',  0),
    (v_sr,   v_ws, v_admin, 'Senior Consultant',  1),
    (v_lead, v_ws, v_admin, 'Lead Consultant',    2);

  -- ── ASSIGN LEVELS & CONTRACTED HOURS TO MEMBERS ─────────────────
  UPDATE workspace_members SET level_id = v_lead, weekly_hours = 40 WHERE workspace_id = v_ws AND user_id = v_admin;
  UPDATE workspace_members SET level_id = v_sr,   weekly_hours = 40 WHERE workspace_id = v_ws AND user_id = v_tom;
  UPDATE workspace_members SET level_id = v_lead, weekly_hours = 40 WHERE workspace_id = v_ws AND user_id = v_fritz;
  UPDATE workspace_members SET level_id = v_jr,   weekly_hours = 32 WHERE workspace_id = v_ws AND user_id = v_jaha;
  UPDATE workspace_members SET level_id = v_sr,   weekly_hours = 40 WHERE workspace_id = v_ws AND user_id = v_moritz;
  UPDATE workspace_members SET level_id = v_jr,   weekly_hours = 20 WHERE workspace_id = v_ws AND user_id = v_jd;
  UPDATE workspace_members SET level_id = v_sr,   weekly_hours = 40 WHERE workspace_id = v_ws AND user_id = v_michael;

  -- ── CLIENTS ──────────────────────────────────────────────────────
  v_c1 := gen_random_uuid(); v_c2 := gen_random_uuid();
  v_c3 := gen_random_uuid(); v_c4 := gen_random_uuid();

  INSERT INTO clients (id, user_id, workspace_id, name, color) VALUES
    (v_c1, v_admin, v_ws, 'TechCorp GmbH',        '#6366f1'),
    (v_c2, v_admin, v_ws, 'Alpine Solutions AG',   '#10b981'),
    (v_c3, v_admin, v_ws, 'Meridian Capital',      '#f59e0b'),
    (v_c4, v_admin, v_ws, 'BrightPath Consulting', '#ef4444');

  -- ── PROJECTS ─────────────────────────────────────────────────────
  v_p1 := gen_random_uuid(); v_p2 := gen_random_uuid(); v_p3 := gen_random_uuid();
  v_p4 := gen_random_uuid(); v_p5 := gen_random_uuid(); v_p6 := gen_random_uuid();

  INSERT INTO projects (id, user_id, workspace_id, client_id, name, color, status,
    budget_hours, budget_amount, rounding_minutes, start_date, end_date) VALUES
    (v_p1, v_admin, v_ws, v_c1, 'Digital Transformation',  '#6366f1', 'active', 500, 150000, 15, '2024-01-15', '2024-12-31'),
    (v_p2, v_admin, v_ws, v_c1, 'Client Portal v2',         '#8b5cf6', 'active', 200,  60000, 15, '2024-03-01', '2024-09-30'),
    (v_p3, v_admin, v_ws, v_c2, 'ESG Reporting Framework',  '#10b981', 'active', 300,  90000,  0, '2024-02-01', '2024-11-30'),
    (v_p4, v_admin, v_ws, v_c3, 'Due Diligence Q2',         '#f59e0b', 'active', 150,  45000, 30, '2024-04-01', '2024-08-31'),
    (v_p5, v_admin, v_ws, v_c4, 'Strategy Roadmap 2025',    '#ef4444', 'active', 250,  75000,  0, '2024-05-01', '2025-03-31'),
    (v_p6, v_admin, v_ws, v_c2, 'Process Optimization',     '#14b8a6', 'active', 180,  54000, 15, '2024-06-01', '2024-12-31');

  -- ── PROJECT LEVEL RATES ──────────────────────────────────────────
  INSERT INTO project_level_rates (id, project_id, level_id, hourly_rate, rate_type) VALUES
    -- Digital Transformation (p1)
    (gen_random_uuid(), v_p1, v_jr,    95, 'hourly'),
    (gen_random_uuid(), v_p1, v_sr,   145, 'hourly'),
    (gen_random_uuid(), v_p1, v_lead, 195, 'hourly'),
    -- Client Portal v2 (p2)
    (gen_random_uuid(), v_p2, v_jr,    90, 'hourly'),
    (gen_random_uuid(), v_p2, v_sr,   135, 'hourly'),
    (gen_random_uuid(), v_p2, v_lead, 185, 'hourly'),
    -- ESG Reporting Framework (p3)
    (gen_random_uuid(), v_p3, v_jr,    85, 'hourly'),
    (gen_random_uuid(), v_p3, v_sr,   130, 'hourly'),
    (gen_random_uuid(), v_p3, v_lead, 175, 'hourly'),
    -- Due Diligence Q2 (p4)
    (gen_random_uuid(), v_p4, v_jr,   100, 'hourly'),
    (gen_random_uuid(), v_p4, v_sr,   155, 'hourly'),
    (gen_random_uuid(), v_p4, v_lead, 210, 'hourly'),
    -- Strategy Roadmap 2025 (p5)
    (gen_random_uuid(), v_p5, v_jr,    90, 'hourly'),
    (gen_random_uuid(), v_p5, v_sr,   140, 'hourly'),
    (gen_random_uuid(), v_p5, v_lead, 190, 'hourly'),
    -- Process Optimization (p6)
    (gen_random_uuid(), v_p6, v_jr,    85, 'hourly'),
    (gen_random_uuid(), v_p6, v_sr,   125, 'hourly'),
    (gen_random_uuid(), v_p6, v_lead, 170, 'hourly');

  -- ── PROJECT MEMBERS (staffing) ───────────────────────────────────
  -- admin: all projects
  -- tom:     p1, p2, p4     (Senior)
  -- fritz:   p1, p3, p5     (Lead)
  -- jaha:    p2, p3, p6     (Junior)
  -- moritz:  p1, p4, p5     (Senior)
  -- jd:      p3, p5, p6     (Junior)
  -- michael: p2, p4, p6     (Senior)
  INSERT INTO project_members (project_id, user_id, workspace_id) VALUES
    (v_p1, v_admin,   v_ws), (v_p2, v_admin,   v_ws), (v_p3, v_admin,   v_ws),
    (v_p4, v_admin,   v_ws), (v_p5, v_admin,   v_ws), (v_p6, v_admin,   v_ws),
    (v_p1, v_tom,     v_ws), (v_p2, v_tom,     v_ws), (v_p4, v_tom,     v_ws),
    (v_p1, v_fritz,   v_ws), (v_p3, v_fritz,   v_ws), (v_p5, v_fritz,   v_ws),
    (v_p2, v_jaha,    v_ws), (v_p3, v_jaha,    v_ws), (v_p6, v_jaha,    v_ws),
    (v_p1, v_moritz,  v_ws), (v_p4, v_moritz,  v_ws), (v_p5, v_moritz,  v_ws),
    (v_p3, v_jd,      v_ws), (v_p5, v_jd,      v_ws), (v_p6, v_jd,      v_ws),
    (v_p2, v_michael, v_ws), (v_p4, v_michael, v_ws), (v_p6, v_michael, v_ws);

  -- ── TIME ENTRIES: 6 completed weeks + current week ───────────────
  -- v_wk=1 → last week, v_wk=6 → 6 weeks ago, v_wk=0 → this week

  FOR v_wk IN 0..6 LOOP

    -- ADMIN (Lead Consultant) — all projects, ~17h/week billable
    v_s := date_trunc('week', NOW()) - (v_wk * INTERVAL '1 week') + INTERVAL '8 hours';
    INSERT INTO time_entries (user_id, workspace_id, project_id, level_id, description, start_time, end_time, billable, hourly_rate) VALUES
      (v_admin, v_ws, v_p1, v_lead, 'Stakeholder governance & steering committee',         v_s,                          v_s + INTERVAL '3 hours',         TRUE,  195),
      (v_admin, v_ws, v_p3, v_lead, 'Executive ESG reporting review',                      v_s + INTERVAL '1 day 1 hour', v_s + INTERVAL '1 day 5 hours',   TRUE,  175),
      (v_admin, v_ws, v_p5, v_lead, 'Strategy workshop facilitation',                      v_s + INTERVAL '2 days',       v_s + INTERVAL '2 days 3 hours 30 min', TRUE, 190),
      (v_admin, v_ws, v_p2, v_lead, 'Architecture decision & tech governance',              v_s + INTERVAL '3 days 1 hour',v_s + INTERVAL '3 days 3 hours 30 min', TRUE, 185),
      (v_admin, v_ws, v_p4, v_lead, 'Due diligence lead coordination',                     v_s + INTERVAL '4 days',       v_s + INTERVAL '4 days 4 hours',  TRUE,  210);

    -- TOM (Senior) — p1, p2, p4 — ~20h/week billable
    v_s := date_trunc('week', NOW()) - (v_wk * INTERVAL '1 week') + INTERVAL '9 hours';
    INSERT INTO time_entries (user_id, workspace_id, project_id, level_id, description, start_time, end_time, billable, hourly_rate) VALUES
      (v_tom, v_ws, v_p1, v_sr, 'Sprint planning & backlog refinement',   v_s,                           v_s + INTERVAL '4 hours',         TRUE,  145),
      (v_tom, v_ws, v_p2, v_sr, 'Frontend development & UI components',   v_s + INTERVAL '1 day',        v_s + INTERVAL '1 day 6 hours',   TRUE,  135),
      (v_tom, v_ws, v_p4, v_sr, 'Financial data room analysis',           v_s + INTERVAL '2 days',       v_s + INTERVAL '2 days 5 hours',  TRUE,  155),
      (v_tom, v_ws, v_p1, v_sr, 'Code review & integration testing',      v_s + INTERVAL '3 days',       v_s + INTERVAL '3 days 3 hours',  TRUE,  145),
      (v_tom, v_ws, v_p2, v_sr, 'Weekly client sync',                     v_s + INTERVAL '4 days 1 hour',v_s + INTERVAL '4 days 3 hours',  FALSE, 135);

    -- FRITZ (Lead) — p1, p3, p5 — ~21h/week billable
    v_s := date_trunc('week', NOW()) - (v_wk * INTERVAL '1 week') + INTERVAL '8 hours 30 min';
    INSERT INTO time_entries (user_id, workspace_id, project_id, level_id, description, start_time, end_time, billable, hourly_rate) VALUES
      (v_fritz, v_ws, v_p1, v_lead, 'Digital maturity assessment',              v_s,                           v_s + INTERVAL '4 hours',           TRUE, 195),
      (v_fritz, v_ws, v_p3, v_lead, 'ESG data collection & methodology',        v_s + INTERVAL '1 day',        v_s + INTERVAL '1 day 5 hours',     TRUE, 175),
      (v_fritz, v_ws, v_p5, v_lead, 'Market analysis & competitive landscape',  v_s + INTERVAL '2 days',       v_s + INTERVAL '2 days 6 hours',    TRUE, 190),
      (v_fritz, v_ws, v_p3, v_lead, 'Regulatory compliance review',             v_s + INTERVAL '3 days',       v_s + INTERVAL '3 days 3 hours 30 min', TRUE, 175),
      (v_fritz, v_ws, v_p1, v_lead, 'Project status report',                    v_s + INTERVAL '4 days 30 min',v_s + INTERVAL '4 days 2 hours 30 min', TRUE, 195);

    -- JAHA (Junior) — p2, p3, p6 — ~21h/week, mix billable/non
    v_s := date_trunc('week', NOW()) - (v_wk * INTERVAL '1 week') + INTERVAL '8 hours';
    INSERT INTO time_entries (user_id, workspace_id, project_id, level_id, description, start_time, end_time, billable, hourly_rate) VALUES
      (v_jaha, v_ws, v_p2, v_jr, 'API integration & automated testing',  v_s,                           v_s + INTERVAL '5 hours',        TRUE,  90),
      (v_jaha, v_ws, v_p3, v_jr, 'Data gathering & survey preparation',  v_s + INTERVAL '1 day',        v_s + INTERVAL '1 day 4 hours',  TRUE,  85),
      (v_jaha, v_ws, v_p6, v_jr, 'Process mapping & documentation',      v_s + INTERVAL '2 days',       v_s + INTERVAL '2 days 6 hours', TRUE,  85),
      (v_jaha, v_ws, v_p2, v_jr, 'Bug fixes & QA testing',               v_s + INTERVAL '3 days',       v_s + INTERVAL '3 days 4 hours', TRUE,  90),
      (v_jaha, v_ws, v_p3, v_jr, 'Team sync & onboarding training',      v_s + INTERVAL '4 days 1 hour',v_s + INTERVAL '4 days 3 hours', FALSE, 85);

    -- MORITZ (Senior) — p1, p4, p5 — ~21h/week billable
    v_s := date_trunc('week', NOW()) - (v_wk * INTERVAL '1 week') + INTERVAL '9 hours';
    INSERT INTO time_entries (user_id, workspace_id, project_id, level_id, description, start_time, end_time, billable, hourly_rate) VALUES
      (v_moritz, v_ws, v_p1, v_sr, 'Change management & training design',       v_s,                           v_s + INTERVAL '5 hours',           TRUE, 145),
      (v_moritz, v_ws, v_p4, v_sr, 'Target company analysis & benchmarking',    v_s + INTERVAL '1 day',        v_s + INTERVAL '1 day 4 hours',     TRUE, 155),
      (v_moritz, v_ws, v_p5, v_sr, 'Scenario planning & financial modelling',   v_s + INTERVAL '2 days',       v_s + INTERVAL '2 days 6 hours',    TRUE, 140),
      (v_moritz, v_ws, v_p1, v_sr, 'Stakeholder workshop facilitation',         v_s + INTERVAL '3 days',       v_s + INTERVAL '3 days 3 hours',    TRUE, 145),
      (v_moritz, v_ws, v_p4, v_sr, 'Due diligence report writing',              v_s + INTERVAL '4 days',       v_s + INTERVAL '4 days 3 hours 30 min', TRUE, 155);

    -- JD (Junior) — p3, p5, p6 — ~19h/week, some non-billable
    v_s := date_trunc('week', NOW()) - (v_wk * INTERVAL '1 week') + INTERVAL '8 hours';
    INSERT INTO time_entries (user_id, workspace_id, project_id, level_id, description, start_time, end_time, billable, hourly_rate) VALUES
      (v_jd, v_ws, v_p3, v_jr, 'Sustainability reporting research',   v_s,                           v_s + INTERVAL '4 hours',        TRUE,  85),
      (v_jd, v_ws, v_p5, v_jr, 'Competitor benchmarking analysis',    v_s + INTERVAL '1 day',        v_s + INTERVAL '1 day 5 hours',  TRUE,  90),
      (v_jd, v_ws, v_p6, v_jr, 'As-is process documentation',         v_s + INTERVAL '2 days',       v_s + INTERVAL '2 days 6 hours', TRUE,  85),
      (v_jd, v_ws, v_p3, v_jr, 'KPI framework development',           v_s + INTERVAL '3 days',       v_s + INTERVAL '3 days 3 hours', TRUE,  85),
      (v_jd, v_ws, v_p6, v_jr, 'Knowledge sharing session',           v_s + INTERVAL '4 days 1 hour',v_s + INTERVAL '4 days 3 hours', FALSE, 85);

    -- MICHAEL (Senior) — p2, p4, p6 — ~21h/week billable
    v_s := date_trunc('week', NOW()) - (v_wk * INTERVAL '1 week') + INTERVAL '8 hours 30 min';
    INSERT INTO time_entries (user_id, workspace_id, project_id, level_id, description, start_time, end_time, billable, hourly_rate) VALUES
      (v_michael, v_ws, v_p2, v_sr, 'UX design & user research sessions',   v_s,                           v_s + INTERVAL '4 hours',          TRUE, 135),
      (v_michael, v_ws, v_p4, v_sr, 'Legal & compliance due diligence',     v_s + INTERVAL '1 day',        v_s + INTERVAL '1 day 5 hours',    TRUE, 155),
      (v_michael, v_ws, v_p6, v_sr, 'To-be process design workshop',        v_s + INTERVAL '2 days',       v_s + INTERVAL '2 days 6 hours',   TRUE, 125),
      (v_michael, v_ws, v_p2, v_sr, 'Sprint demo & client presentation',    v_s + INTERVAL '3 days',       v_s + INTERVAL '3 days 2 hours',   TRUE, 135),
      (v_michael, v_ws, v_p4, v_sr, 'Due diligence report finalisation',    v_s + INTERVAL '4 days',       v_s + INTERVAL '4 days 4 hours',   TRUE, 155);

  END LOOP;

  -- ── TIMESHEETS ───────────────────────────────────────────────────
  -- Weeks 1-4: approved
  -- Week 5:    submitted (pending review)
  -- Week 6:    draft
  -- Week 0 (current): no timesheet yet

  INSERT INTO timesheets (
    user_id, workspace_id, week_start, status,
    note, submitted_at, reviewer_note, reviewed_at, review_history
  )
  SELECT
    uid,
    v_ws,
    (date_trunc('week', NOW()) - (wk * INTERVAL '1 week'))::date,
    CASE
      WHEN wk BETWEEN 1 AND 4 THEN 'approved'
      WHEN wk = 5 THEN 'submitted'
      ELSE 'draft'
    END,
    CASE WHEN wk >= 5 THEN 'All hours tracked and billable.' ELSE NULL END,
    CASE WHEN wk >= 5 THEN date_trunc('week', NOW()) - (wk * INTERVAL '1 week') + INTERVAL '4 days 17 hours' ELSE NULL END,
    CASE WHEN wk BETWEEN 1 AND 4 THEN 'Reviewed and approved. Good work.' ELSE NULL END,
    CASE WHEN wk BETWEEN 1 AND 4 THEN date_trunc('week', NOW()) - ((wk - 1) * INTERVAL '1 week') + INTERVAL '1 day 10 hours' ELSE NULL END,
    CASE
      WHEN wk BETWEEN 1 AND 4 THEN
        jsonb_build_array(jsonb_build_object(
          'status', 'approved',
          'note', 'Reviewed and approved. Good work.',
          'reviewed_at', (date_trunc('week', NOW()) - ((wk - 1) * INTERVAL '1 week') + INTERVAL '1 day 10 hours')::text
        ))
      ELSE '[]'::jsonb
    END
  FROM
    (VALUES
      (v_admin), (v_tom), (v_fritz), (v_jaha),
      (v_moritz), (v_jd), (v_michael)
    ) AS u(uid),
    generate_series(1, 6) AS wk;

END $$;
