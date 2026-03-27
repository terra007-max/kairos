-- ================================================================
-- KAIROS — Comprehensive Sample Data (Jan–Mar 2026)
-- Paste into: Supabase Dashboard → SQL Editor → New query
-- Keeps users/workspace/members, replaces all transactional data
-- ================================================================

DO $$
DECLARE
  v_ws   uuid;
  v_admin uuid;
  v_m1   uuid;
  v_m2   uuid;

  c1 uuid := gen_random_uuid();  -- Acme Corp
  c2 uuid := gen_random_uuid();  -- Nova Solutions
  c3 uuid := gen_random_uuid();  -- Pexco Industries

  p1 uuid := gen_random_uuid();  -- CRM Redesign (Acme)
  p2 uuid := gen_random_uuid();  -- Client Portal v2 (Nova)
  p3 uuid := gen_random_uuid();  -- Cloud Migration (Acme)
  p4 uuid := gen_random_uuid();  -- Mobile App (Pexco)
  p5 uuid := gen_random_uuid();  -- Support & Maintenance (Nova)

  lv_jr uuid := gen_random_uuid();
  lv_sr uuid := gen_random_uuid();
  lv_ld uuid := gen_random_uuid();
BEGIN
  -- ── 1. Resolve workspace & members ───────────────────────────────
  SELECT id INTO v_ws FROM public.workspaces WHERE name = 'Kairos Consulting' LIMIT 1;
  IF v_ws IS NULL THEN SELECT id INTO v_ws FROM public.workspaces ORDER BY created_at DESC LIMIT 1; END IF;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'No workspace found'; END IF;

  -- Resolve admin: try role='admin'/active → role='admin'/any → any member → any profile
  SELECT user_id INTO v_admin FROM public.workspace_members
    WHERE workspace_id = v_ws AND role = 'admin' AND status = 'active' AND user_id IS NOT NULL LIMIT 1;
  IF v_admin IS NULL THEN
    SELECT user_id INTO v_admin FROM public.workspace_members
      WHERE workspace_id = v_ws AND role = 'admin' AND user_id IS NOT NULL LIMIT 1;
  END IF;
  IF v_admin IS NULL THEN
    SELECT user_id INTO v_admin FROM public.workspace_members
      WHERE workspace_id = v_ws AND user_id IS NOT NULL LIMIT 1;
  END IF;
  IF v_admin IS NULL THEN
    SELECT id INTO v_admin FROM public.profiles LIMIT 1;
  END IF;
  IF v_admin IS NULL THEN
    SELECT id INTO v_admin FROM auth.users ORDER BY created_at LIMIT 1;
  END IF;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'No user found — make sure you have signed up first'; END IF;
  RAISE NOTICE 'Using admin user_id: %', v_admin;

  SELECT user_id INTO v_m1 FROM public.workspace_members
    WHERE workspace_id = v_ws AND role = 'member'
    ORDER BY created_at LIMIT 1;

  SELECT user_id INTO v_m2 FROM public.workspace_members
    WHERE workspace_id = v_ws AND role = 'member'
    ORDER BY created_at DESC LIMIT 1;

  IF v_m1 IS NULL THEN v_m1 := v_admin; END IF;
  IF v_m2 IS NULL OR v_m2 = v_m1 THEN v_m2 := v_admin; END IF;

  -- ── 2. Clean existing data (all transactional data, keep workspace/members/profiles) ──
  DELETE FROM public.invoices          WHERE workspace_id = v_ws;
  DELETE FROM public.timesheets        WHERE workspace_id = v_ws;
  DELETE FROM public.time_entries      WHERE workspace_id = v_ws;
  DELETE FROM public.project_level_rates WHERE project_id IN (
    SELECT id FROM public.projects WHERE workspace_id = v_ws);
  DELETE FROM public.projects          WHERE workspace_id = v_ws;
  DELETE FROM public.clients           WHERE workspace_id = v_ws;
  DELETE FROM public.consultant_levels WHERE workspace_id = v_ws;

  -- ── 3. Consultant levels ───────────────────────────────────────
  INSERT INTO public.consultant_levels (id, user_id, workspace_id, name, sort_order) VALUES
    (lv_jr, v_admin, v_ws, 'Junior Consultant', 1),
    (lv_sr, v_admin, v_ws, 'Senior Consultant', 2),
    (lv_ld, v_admin, v_ws, 'Lead Consultant',   3);

  UPDATE public.workspace_members SET level_id = lv_ld WHERE user_id = v_admin AND workspace_id = v_ws;
  UPDATE public.workspace_members SET level_id = lv_sr WHERE user_id = v_m1   AND workspace_id = v_ws AND v_m1 <> v_admin;
  UPDATE public.workspace_members SET level_id = lv_jr WHERE user_id = v_m2   AND workspace_id = v_ws AND v_m2 <> v_admin AND v_m2 <> v_m1;

  -- ── 4. Clients ─────────────────────────────────────────────────
  INSERT INTO public.clients (id, user_id, workspace_id, name, email, color, notes) VALUES
    (c1, v_admin, v_ws, 'Acme Corp',        'billing@acme.com',   '#6366f1', 'Flagship enterprise client — ERP & cloud'),
    (c2, v_admin, v_ws, 'Nova Solutions',   'pm@novasol.io',      '#10b981', 'Growing SaaS company — portal & support'),
    (c3, v_admin, v_ws, 'Pexco Industries', 'finance@pexco.com',  '#f97316', 'Manufacturing client — mobile app project');

  -- ── 5. Projects ────────────────────────────────────────────────
  INSERT INTO public.projects (id, user_id, workspace_id, client_id, name, color, status, budget_hours, budget_amount, notes, start_date, end_date) VALUES
    (p1, v_admin, v_ws, c1, 'CRM Redesign',          '#6366f1', 'active', 400, 60000, 'Full CRM overhaul for Acme',                  '2026-01-06', '2026-06-30'),
    (p2, v_admin, v_ws, c2, 'Client Portal v2',      '#10b981', 'active', 200, 26000, 'Self-service portal for Nova customers',      '2026-01-07', '2026-04-30'),
    (p3, v_admin, v_ws, c1, 'Cloud Migration',       '#3b82f6', 'active', 200, 36000, 'AWS migration — monitor budget closely',      '2026-01-06', '2026-03-31'),
    (p4, v_admin, v_ws, c3, 'Mobile App',            '#f97316', 'active', 150, 18000, 'React Native iOS/Android app for Pexco',      '2026-01-07', '2026-05-31'),
    (p5, v_admin, v_ws, c2, 'Support & Maintenance', '#8b5cf6', 'active', 100,  9000, 'Monthly support retainer — 20h/month cap',    '2026-01-01', '2026-12-31');

  -- ── 6. Per-project level rates ─────────────────────────────────
  INSERT INTO public.project_level_rates (id, project_id, level_id, hourly_rate, rate_type) VALUES
    (gen_random_uuid(), p1, lv_jr, 100, 'hourly'), (gen_random_uuid(), p1, lv_sr, 150, 'hourly'), (gen_random_uuid(), p1, lv_ld, 200, 'hourly'),
    (gen_random_uuid(), p2, lv_jr,  85, 'hourly'), (gen_random_uuid(), p2, lv_sr, 130, 'hourly'), (gen_random_uuid(), p2, lv_ld, 175, 'hourly'),
    (gen_random_uuid(), p3, lv_jr, 120, 'hourly'), (gen_random_uuid(), p3, lv_sr, 180, 'hourly'), (gen_random_uuid(), p3, lv_ld, 240, 'hourly'),
    (gen_random_uuid(), p4, lv_jr,  90, 'hourly'), (gen_random_uuid(), p4, lv_sr, 120, 'hourly'), (gen_random_uuid(), p4, lv_ld, 160, 'hourly'),
    (gen_random_uuid(), p5, lv_jr,  70, 'hourly'), (gen_random_uuid(), p5, lv_sr,  90, 'hourly'), (gen_random_uuid(), p5, lv_ld, 110, 'hourly');

  -- ══════════════════════════════════════════════════════════════
  -- TIME ENTRIES — JANUARY 2025
  -- ══════════════════════════════════════════════════════════════

  -- Week Jan 6
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'CRM kickoff — architecture design',         '2026-01-06 08:00:00+00','2026-01-06 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Requirements gathering with Acme team',     '2026-01-06 09:00:00+00','2026-01-06 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'React Native project setup',               '2026-01-06 09:00:00+00','2026-01-06 16:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p3,lv_ld,'AWS account setup & IAM config',            '2026-01-07 08:00:00+00','2026-01-07 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'Portal wireframes & UX review',             '2026-01-07 09:00:00+00','2026-01-07 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Navigation & routing implementation',       '2026-01-07 09:00:00+00','2026-01-07 16:30:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Database schema design',                    '2026-01-08 08:00:00+00','2026-01-08 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Frontend component library setup',          '2026-01-08 09:00:00+00','2026-01-08 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Camera & media picker integration',         '2026-01-08 09:00:00+00','2026-01-08 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p3,lv_ld,'Terraform infrastructure as code',          '2026-01-09 08:00:00+00','2026-01-09 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'Auth module — JWT & session management',    '2026-01-09 09:00:00+00','2026-01-09 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p5,lv_jr,'Support ticket triage & resolution',        '2026-01-09 09:00:00+00','2026-01-09 12:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Sprint 1 planning (internal)',               '2026-01-10 08:00:00+00','2026-01-10 10:00:00+00',false),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'REST API endpoint design',                  '2026-01-10 09:00:00+00','2026-01-10 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Offline data sync mechanism',               '2026-01-10 09:00:00+00','2026-01-10 16:00:00+00',true);

  -- Week Jan 13
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Backend API — contact module',              '2026-01-13 08:00:00+00','2026-01-13 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'User management & RBAC',                   '2026-01-13 09:00:00+00','2026-01-13 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p2,lv_jr,'Dashboard UI components',                  '2026-01-13 09:00:00+00','2026-01-13 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p3,lv_ld,'Network topology & VPC configuration',      '2026-01-14 08:00:00+00','2026-01-14 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'Stripe payment integration',                '2026-01-14 09:00:00+00','2026-01-14 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Push notification service (FCM)',           '2026-01-14 09:00:00+00','2026-01-14 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Code review & architecture feedback',       '2026-01-15 08:00:00+00','2026-01-15 12:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Reporting module — charts & export',        '2026-01-15 09:00:00+00','2026-01-15 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p5,lv_jr,'Bug fixes — Nova support queue',            '2026-01-15 09:00:00+00','2026-01-15 15:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p3,lv_ld,'RDS & ElastiCache setup',                   '2026-01-16 08:00:00+00','2026-01-16 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'API documentation (OpenAPI)',               '2026-01-16 09:00:00+00','2026-01-16 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Biometric auth integration',                '2026-01-16 09:00:00+00','2026-01-16 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Mid-sprint review with Acme',               '2026-01-17 13:00:00+00','2026-01-17 15:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'E2E testing — user flows',                  '2026-01-17 09:00:00+00','2026-01-17 17:00:00+00',true);

  -- Week Jan 20
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Acme CRM demo — Sprint 1 delivery',         '2026-01-20 14:00:00+00','2026-01-20 16:30:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Post-demo bug fixes',                       '2026-01-20 09:00:00+00','2026-01-20 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p2,lv_jr,'Notification center UI',                    '2026-01-20 09:00:00+00','2026-01-20 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p3,lv_ld,'Security audit — pen test review',          '2026-01-21 08:00:00+00','2026-01-21 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'RBAC — fine-grained permissions',           '2026-01-21 09:00:00+00','2026-01-21 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'App store assets & metadata',               '2026-01-21 09:00:00+00','2026-01-21 15:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Sprint 2 planning (internal)',               '2026-01-22 08:00:00+00','2026-01-22 10:00:00+00',false),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Email notification system',                 '2026-01-22 09:00:00+00','2026-01-22 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p5,lv_jr,'Nova client onboarding sessions',           '2026-01-22 10:00:00+00','2026-01-22 13:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p3,lv_ld,'CloudWatch monitoring & alerts',            '2026-01-23 08:00:00+00','2026-01-23 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'CRM-ERP integration layer',                 '2026-01-23 09:00:00+00','2026-01-23 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Performance profiling',                     '2026-01-23 09:00:00+00','2026-01-23 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Architecture review session',               '2026-01-24 09:00:00+00','2026-01-24 12:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'Search & filter functionality',             '2026-01-24 09:00:00+00','2026-01-24 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Crash reporting integration',               '2026-01-24 09:00:00+00','2026-01-24 16:00:00+00',true);

  -- Week Jan 27
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Acme stakeholder review call',              '2026-01-27 13:00:00+00','2026-01-27 15:30:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Data export — CSV/Excel/PDF',               '2026-01-27 09:00:00+00','2026-01-27 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p2,lv_jr,'File upload component with S3',             '2026-01-27 09:00:00+00','2026-01-27 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p3,lv_ld,'CI/CD pipeline (GitHub Actions)',           '2026-01-28 08:00:00+00','2026-01-28 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'Subscription & billing management',         '2026-01-28 09:00:00+00','2026-01-28 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Dark mode & accessibility',                 '2026-01-28 09:00:00+00','2026-01-28 15:30:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Code review — sprint 2 checkpoint',         '2026-01-29 08:00:00+00','2026-01-29 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Performance tuning — query optimization',   '2026-01-29 09:00:00+00','2026-01-29 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p5,lv_jr,'Monthly support report — January',          '2026-01-29 09:00:00+00','2026-01-29 11:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p3,lv_ld,'Backup & disaster recovery testing',        '2026-01-30 08:00:00+00','2026-01-30 12:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Integration testing — full E2E suite',      '2026-01-30 09:00:00+00','2026-01-30 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'App store submission preparation',          '2026-01-30 09:00:00+00','2026-01-30 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'January retrospective (internal)',           '2026-01-31 09:00:00+00','2026-01-31 11:00:00+00',false),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'UAT with Nova team',                        '2026-01-31 09:00:00+00','2026-01-31 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Beta testing feedback implementation',      '2026-01-31 09:00:00+00','2026-01-31 16:00:00+00',true);

  -- ══════════════════════════════════════════════════════════════
  -- TIME ENTRIES — FEBRUARY 2025
  -- ══════════════════════════════════════════════════════════════

  -- Week Feb 3
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p3,lv_ld,'Data migration Phase 1 planning',           '2026-02-03 08:00:00+00','2026-02-03 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Advanced filtering & saved views',          '2026-02-03 09:00:00+00','2026-02-03 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'In-app tutorial & onboarding flow',         '2026-02-03 09:00:00+00','2026-02-03 16:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Sprint 3 planning with Acme PM',            '2026-02-04 09:00:00+00','2026-02-04 11:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'Analytics dashboard — KPI widgets',         '2026-02-04 09:00:00+00','2026-02-04 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p2,lv_jr,'Data visualization components',             '2026-02-04 09:00:00+00','2026-02-04 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p3,lv_ld,'Database migration scripts Phase 1',        '2026-02-05 08:00:00+00','2026-02-05 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Workflow automation engine',                '2026-02-05 09:00:00+00','2026-02-05 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Location services integration',             '2026-02-05 09:00:00+00','2026-02-05 16:30:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Code review & pair programming',            '2026-02-06 08:00:00+00','2026-02-06 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'Multi-tenant data isolation',               '2026-02-06 09:00:00+00','2026-02-06 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p5,lv_jr,'Support — P1 bug resolution',               '2026-02-06 09:00:00+00','2026-02-06 14:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p3,lv_ld,'Load testing & capacity planning',          '2026-02-07 08:00:00+00','2026-02-07 14:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Custom report builder',                    '2026-02-07 09:00:00+00','2026-02-07 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'QR code scanner feature',                  '2026-02-07 09:00:00+00','2026-02-07 16:00:00+00',true);

  -- Week Feb 10
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p3,lv_ld,'Data migration Phase 1 execution',          '2026-02-10 08:00:00+00','2026-02-10 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Calendar & scheduling module',              '2026-02-10 09:00:00+00','2026-02-10 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p2,lv_jr,'Team management UI',                        '2026-02-10 09:00:00+00','2026-02-10 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Client sync — Acme product roadmap',        '2026-02-11 10:00:00+00','2026-02-11 12:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'CSV import with validation',                '2026-02-11 09:00:00+00','2026-02-11 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Inventory management screen',               '2026-02-11 09:00:00+00','2026-02-11 16:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p3,lv_ld,'Post-migration validation & smoke tests',   '2026-02-12 08:00:00+00','2026-02-12 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Webhook system for integrations',           '2026-02-12 09:00:00+00','2026-02-12 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Barcode scanning (inventory)',              '2026-02-12 09:00:00+00','2026-02-12 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Security vulnerability assessment',         '2026-02-13 08:00:00+00','2026-02-13 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'Audit log & compliance module',             '2026-02-13 09:00:00+00','2026-02-13 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p5,lv_jr,'Nova support — 3 ticket resolutions',       '2026-02-13 09:00:00+00','2026-02-13 13:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p3,lv_ld,'Cloud migration — final handover',          '2026-02-14 10:00:00+00','2026-02-14 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Sprint 3 retrospective & planning',         '2026-02-14 09:00:00+00','2026-02-14 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'App review — Store rejection fix',          '2026-02-14 09:00:00+00','2026-02-14 15:00:00+00',true);

  -- Week Feb 17
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Advanced permissions system design',        '2026-02-17 08:00:00+00','2026-02-17 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Drag-and-drop pipeline builder',            '2026-02-17 09:00:00+00','2026-02-17 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Reporting screen — charts',                 '2026-02-17 09:00:00+00','2026-02-17 16:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p2,lv_ld,'Nova Portal launch review meeting',         '2026-02-18 10:00:00+00','2026-02-18 13:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'White-label configuration system',          '2026-02-18 09:00:00+00','2026-02-18 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p2,lv_jr,'Mobile-responsive UI polish',               '2026-02-18 09:00:00+00','2026-02-18 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Code review marathon',                      '2026-02-19 08:00:00+00','2026-02-19 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'AI/ML integration spike',                   '2026-02-19 09:00:00+00','2026-02-19 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p5,lv_jr,'Support incidents — Feb week 3',            '2026-02-19 09:00:00+00','2026-02-19 14:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Capacity planning — Q1 review',             '2026-02-20 08:00:00+00','2026-02-20 10:00:00+00',false),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'i18n / multilingual support',               '2026-02-20 09:00:00+00','2026-02-20 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Export to PDF functionality',               '2026-02-20 09:00:00+00','2026-02-20 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Acme — mid-project review',                 '2026-02-21 14:00:00+00','2026-02-21 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Automated test suite expansion',            '2026-02-21 09:00:00+00','2026-02-21 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Localization — German & French',            '2026-02-21 09:00:00+00','2026-02-21 16:00:00+00',true);

  -- Week Feb 24
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Sprint 4 planning & backlog grooming',      '2026-02-24 08:00:00+00','2026-02-24 10:00:00+00',false),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Custom field builder',                      '2026-02-24 09:00:00+00','2026-02-24 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p2,lv_jr,'Payment history & invoicing UI',            '2026-02-24 09:00:00+00','2026-02-24 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p2,lv_ld,'Nova Portal — pre-launch checklist',        '2026-02-25 10:00:00+00','2026-02-25 14:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'SSO/SAML integration',                      '2026-02-25 09:00:00+00','2026-02-25 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Unit test coverage improvement',            '2026-02-25 09:00:00+00','2026-02-25 16:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Code review & documentation',               '2026-02-26 08:00:00+00','2026-02-26 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Mobile app for CRM (companion)',            '2026-02-26 09:00:00+00','2026-02-26 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p5,lv_jr,'February support summary report',           '2026-02-26 09:00:00+00','2026-02-26 11:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p2,lv_ld,'Nova Portal — go-live support',             '2026-02-27 09:00:00+00','2026-02-27 17:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'Post-launch monitoring & hotfixes',         '2026-02-27 09:00:00+00','2026-02-27 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Pexco mobile — UAT session',               '2026-02-27 09:00:00+00','2026-02-27 15:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p2,lv_ld,'Post-launch retrospective (Nova)',           '2026-02-28 09:00:00+00','2026-02-28 11:00:00+00',false),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,'Performance optimization post-launch',      '2026-02-28 09:00:00+00','2026-02-28 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Pexco mobile — final sign-off prep',        '2026-02-28 09:00:00+00','2026-02-28 16:00:00+00',true);

  -- ══════════════════════════════════════════════════════════════
  -- TIME ENTRIES — MARCH 2025
  -- ══════════════════════════════════════════════════════════════

  -- Week Mar 3
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Sprint 4 kickoff — advanced features',      '2026-03-03 08:00:00+00','2026-03-03 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Document management module',                '2026-03-03 09:00:00+00','2026-03-03 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Pexco Mobile — App Store submission',       '2026-03-03 09:00:00+00','2026-03-03 16:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'CRM — AI lead scoring design',              '2026-03-04 08:00:00+00','2026-03-04 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Template engine for proposals',             '2026-03-04 09:00:00+00','2026-03-04 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p5,lv_jr,'Support — 4 tickets resolved',              '2026-03-04 09:00:00+00','2026-03-04 13:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Code review',                               '2026-03-05 08:00:00+00','2026-03-05 12:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Sales pipeline automation',                 '2026-03-05 09:00:00+00','2026-03-05 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Play Store listing update',                 '2026-03-05 09:00:00+00','2026-03-05 15:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Acme — Q1 status update call',             '2026-03-06 10:00:00+00','2026-03-06 12:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Multi-currency support',                    '2026-03-06 09:00:00+00','2026-03-06 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p2,lv_jr,'Nova Portal v2.1 — minor features',         '2026-03-06 09:00:00+00','2026-03-06 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Sprint 4 review & backlog prep',            '2026-03-07 08:00:00+00','2026-03-07 12:00:00+00',false),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Third-party connector framework',           '2026-03-07 09:00:00+00','2026-03-07 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Post-submission support',                   '2026-03-07 09:00:00+00','2026-03-07 14:00:00+00',true);

  -- Week Mar 10
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'AI lead scoring — implementation',          '2026-03-10 08:00:00+00','2026-03-10 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Slack & Teams integration',                 '2026-03-10 09:00:00+00','2026-03-10 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p2,lv_jr,'A/B testing framework',                     '2026-03-10 09:00:00+00','2026-03-10 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Code review — integrations',                '2026-03-11 08:00:00+00','2026-03-11 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Salesforce data sync',                      '2026-03-11 09:00:00+00','2026-03-11 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p5,lv_jr,'Support — weekly maintenance window',       '2026-03-11 09:00:00+00','2026-03-11 13:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Performance benchmarking',                  '2026-03-12 08:00:00+00','2026-03-12 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'HubSpot & Mailchimp connectors',            '2026-03-12 09:00:00+00','2026-03-12 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p2,lv_jr,'User feedback widget',                      '2026-03-12 09:00:00+00','2026-03-12 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Acme sprint demo — Sprint 4',               '2026-03-13 14:00:00+00','2026-03-13 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'GraphQL API layer',                         '2026-03-13 09:00:00+00','2026-03-13 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Pexco — post-launch feedback fixes',        '2026-03-13 09:00:00+00','2026-03-13 16:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Sprint 5 planning (internal)',               '2026-03-14 08:00:00+00','2026-03-14 10:00:00+00',false),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'API rate limiting & throttling',            '2026-03-14 09:00:00+00','2026-03-14 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p5,lv_jr,'Support — SLA reporting',                   '2026-03-14 09:00:00+00','2026-03-14 12:00:00+00',true);

  -- Week Mar 17
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Advanced search (Elasticsearch)',            '2026-03-17 08:00:00+00','2026-03-17 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Real-time collaboration features',          '2026-03-17 09:00:00+00','2026-03-17 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p2,lv_jr,'Nova — feature request: bulk ops',          '2026-03-17 09:00:00+00','2026-03-17 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Search indexing & faceted search',          '2026-03-18 08:00:00+00','2026-03-18 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Commenting & mention system',               '2026-03-18 09:00:00+00','2026-03-18 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p5,lv_jr,'Support — March week 3 incidents',          '2026-03-18 09:00:00+00','2026-03-18 14:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Code review & testing strategy',            '2026-03-19 08:00:00+00','2026-03-19 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Notification preferences system',           '2026-03-19 09:00:00+00','2026-03-19 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p2,lv_jr,'Nova — analytics export feature',           '2026-03-19 09:00:00+00','2026-03-19 17:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Acme — Q1 final review meeting',           '2026-03-20 10:00:00+00','2026-03-20 13:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'Activity feed & audit trail',               '2026-03-20 09:00:00+00','2026-03-20 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p4,lv_jr,'Pexco v1.1 — hotfix release',              '2026-03-20 09:00:00+00','2026-03-20 16:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Q1 retrospective (internal)',               '2026-03-21 09:00:00+00','2026-03-21 11:00:00+00',false),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'E2E test automation suite',                 '2026-03-21 09:00:00+00','2026-03-21 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p5,lv_jr,'Support — weekly wrap-up report',           '2026-03-21 09:00:00+00','2026-03-21 11:00:00+00',true);

  -- Week Mar 24 (current week)
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'Sprint 5 kickoff — final Q1 push',          '2026-03-24 08:00:00+00','2026-03-24 16:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'OAuth 2.0 provider implementation',         '2026-03-24 09:00:00+00','2026-03-24 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p2,lv_jr,'Nova — dark mode implementation',           '2026-03-24 09:00:00+00','2026-03-24 16:00:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,'CRM — bulk import optimization',            '2026-03-25 08:00:00+00','2026-03-25 12:00:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,'API versioning strategy',                   '2026-03-25 09:00:00+00','2026-03-25 17:00:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p5,lv_jr,'Support — Tuesday triage',                  '2026-03-25 09:00:00+00','2026-03-25 12:00:00+00',true);

  -- ══════════════════════════════════════════════════════════════
  -- TIMESHEETS
  -- Jan: all approved | Feb: mix with rejections | Mar: approved→submitted→draft
  -- ON CONFLICT DO NOTHING handles duplicate users (e.g. if v_m1 = v_m2)
  -- ══════════════════════════════════════════════════════════════

  -- ── ADMIN timesheets ──────────────────────────────────────────
  INSERT INTO public.timesheets (id,user_id,workspace_id,week_start,status,note,reviewer_note,submitted_at,reviewed_at)
  VALUES
  -- January (all approved)
  (gen_random_uuid(),v_admin,v_ws,'2026-01-06','approved','CRM architecture complete, cloud migration started.','Great kickoff week. Architecture is solid.','2026-01-10 17:00:00+00','2026-01-11 10:00:00+00'),
  (gen_random_uuid(),v_admin,v_ws,'2026-01-13','approved','Sprint 1 in full swing. API foundation laid.','Strong progress on all fronts.','2026-01-17 17:00:00+00','2026-01-18 09:00:00+00'),
  (gen_random_uuid(),v_admin,v_ws,'2026-01-20','approved','Acme demo delivered. Client very happy with Sprint 1.','Excellent client presentation.','2026-01-24 17:00:00+00','2026-01-25 10:00:00+00'),
  (gen_random_uuid(),v_admin,v_ws,'2026-01-27','approved','Sprint 2 progress. Migration CI/CD pipeline done.','All milestones on track. Approved.','2026-01-31 17:00:00+00','2026-02-01 09:00:00+00'),
  -- February (all approved)
  (gen_random_uuid(),v_admin,v_ws,'2026-02-03','approved','Migration Phase 1 planning done. Code reviews going well.','Strong leadership this week.','2026-02-07 17:00:00+00','2026-02-08 09:00:00+00'),
  (gen_random_uuid(),v_admin,v_ws,'2026-02-10','approved','Phase 1 migration executed. No data loss. Big milestone.','Critical milestone delivered. Excellent.','2026-02-14 17:00:00+00','2026-02-15 09:00:00+00'),
  (gen_random_uuid(),v_admin,v_ws,'2026-02-17','approved','Nova Portal pre-launch review. Code reviews done.','Ready for launch. Well prepared.','2026-02-21 17:00:00+00','2026-02-22 09:00:00+00'),
  (gen_random_uuid(),v_admin,v_ws,'2026-02-24','approved','Nova Portal live! Go-live support went smoothly.','Flawless launch execution. Outstanding.','2026-02-28 17:00:00+00','2026-03-01 09:00:00+00'),
  -- March (approved → submitted)
  (gen_random_uuid(),v_admin,v_ws,'2026-03-03','approved','Sprint 4 started. AI lead scoring design underway.','Good strategic work.','2026-03-07 17:00:00+00','2026-03-08 09:00:00+00'),
  (gen_random_uuid(),v_admin,v_ws,'2026-03-10','approved','Integrations sprint. Acme Sprint 4 demo delivered.','Excellent demo. Client very impressed.','2026-03-14 17:00:00+00','2026-03-15 09:00:00+00'),
  (gen_random_uuid(),v_admin,v_ws,'2026-03-17','submitted','Search implementation, Q1 review with Acme. Sprint retro.',NULL,'2026-03-21 17:00:00+00',NULL)
  ON CONFLICT (user_id, workspace_id, week_start) DO NOTHING;

  -- ── MEMBER 1 (Senior) timesheets ────────────────────────────
  INSERT INTO public.timesheets (id,user_id,workspace_id,week_start,status,note,reviewer_note,submitted_at,reviewed_at)
  VALUES
  -- January (all approved)
  (gen_random_uuid(),v_m1,v_ws,'2026-01-06','approved','Requirements done, started CRM and Portal frontend.','Solid start. Good collaboration.','2026-01-10 17:30:00+00','2026-01-11 10:00:00+00'),
  (gen_random_uuid(),v_m1,v_ws,'2026-01-13','approved','User management, payments, and API docs done.','Excellent breadth of delivery.','2026-01-17 17:30:00+00','2026-01-18 09:00:00+00'),
  (gen_random_uuid(),v_m1,v_ws,'2026-01-20','approved','Post-demo fixes, email notifications, CRM integration.','Reactive and thorough. Good work.','2026-01-24 17:30:00+00','2026-01-25 10:00:00+00'),
  (gen_random_uuid(),v_m1,v_ws,'2026-01-27','approved','Data export, billing, and full E2E testing complete.','Highest-quality sprint yet. Well done.','2026-01-31 17:30:00+00','2026-02-01 09:00:00+00'),
  -- February (approved, approved, REJECTED, approved)
  (gen_random_uuid(),v_m1,v_ws,'2026-02-03','approved','Workflow automation and advanced filtering shipped.','Great feature work this week.','2026-02-07 17:30:00+00','2026-02-08 09:00:00+00'),
  (gen_random_uuid(),v_m1,v_ws,'2026-02-10','approved','Calendar module, CSV import, webhook system done.','Very solid delivery. Approved.','2026-02-14 17:30:00+00','2026-02-15 09:00:00+00'),
  (gen_random_uuid(),v_m1,v_ws,'2026-02-17','rejected','Drag-and-drop, AI spike, i18n. Busy week.','Hours are not fully accounted for — Tuesday is missing entries. Please correct and resubmit.','2026-02-21 17:30:00+00','2026-02-22 10:00:00+00'),
  (gen_random_uuid(),v_m1,v_ws,'2026-02-24','approved','SSO, mobile companion app. Portal launch support.','Great recovery after last week. Approved.','2026-02-28 17:30:00+00','2026-03-01 09:00:00+00'),
  -- March (approved, submitted, submitted)
  (gen_random_uuid(),v_m1,v_ws,'2026-03-03','approved','Document management, template engine, sales pipeline.','Outstanding feature volume.','2026-03-07 17:30:00+00','2026-03-08 09:00:00+00'),
  (gen_random_uuid(),v_m1,v_ws,'2026-03-10','submitted','Salesforce sync, HubSpot connector, GraphQL layer started.',NULL,'2026-03-14 17:30:00+00',NULL),
  (gen_random_uuid(),v_m1,v_ws,'2026-03-17','submitted','Real-time collab, commenting system, notification prefs.',NULL,'2026-03-21 17:30:00+00',NULL)
  ON CONFLICT (user_id, workspace_id, week_start) DO NOTHING;

  -- ── MEMBER 2 (Junior) timesheets ────────────────────────────
  INSERT INTO public.timesheets (id,user_id,workspace_id,week_start,status,note,reviewer_note,submitted_at,reviewed_at)
  VALUES
  -- January (all approved)
  (gen_random_uuid(),v_m2,v_ws,'2026-01-06','approved','Mobile app setup and navigation done. Good start.','Great onboarding. Keep it up.','2026-01-10 16:00:00+00','2026-01-11 10:00:00+00'),
  (gen_random_uuid(),v_m2,v_ws,'2026-01-13','approved','Push notifications, Portal dashboard, biometric auth.','Nice range of features delivered.','2026-01-17 16:00:00+00','2026-01-18 09:00:00+00'),
  (gen_random_uuid(),v_m2,v_ws,'2026-01-20','approved','App store assets, performance profiling, crash reporting.','Good technical depth this week.','2026-01-24 16:00:00+00','2026-01-25 10:00:00+00'),
  (gen_random_uuid(),v_m2,v_ws,'2026-01-27','approved','Dark mode, beta feedback, app store submission prep.','Great finishing touches. Ready for store.','2026-01-31 16:00:00+00','2026-02-01 09:00:00+00'),
  -- February (approved, REJECTED, approved, approved)
  (gen_random_uuid(),v_m2,v_ws,'2026-02-03','approved','App tutorial, location services, QR scanner started.','Good variety of features. Keep it up.','2026-02-07 16:00:00+00','2026-02-08 09:00:00+00'),
  (gen_random_uuid(),v_m2,v_ws,'2026-02-10','rejected','Inventory screen, barcode scanning. App review fixes.','Friday entries are missing. Only 3 days logged — add Thursday/Friday entries and resubmit.','2026-02-14 16:00:00+00','2026-02-15 10:00:00+00'),
  (gen_random_uuid(),v_m2,v_ws,'2026-02-17','approved','Mobile reporting charts, PDF export, localization.','Full week logged correctly. Good delivery.','2026-02-21 16:00:00+00','2026-02-22 09:00:00+00'),
  (gen_random_uuid(),v_m2,v_ws,'2026-02-24','approved','Payment history UI, unit tests, UAT session with Pexco.','Solid QA work and client interaction. Approved.','2026-02-28 16:00:00+00','2026-03-01 09:00:00+00'),
  -- March (approved, submitted)
  (gen_random_uuid(),v_m2,v_ws,'2026-03-03','approved','Mobile app submission done! Pexco signed off.','Big milestone — app in the stores!','2026-03-07 16:00:00+00','2026-03-08 09:00:00+00'),
  (gen_random_uuid(),v_m2,v_ws,'2026-03-10','submitted','A/B testing, support maintenance, post-launch fixes.',NULL,'2026-03-14 16:00:00+00',NULL)
  ON CONFLICT (user_id, workspace_id, week_start) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════
  -- INVOICES
  -- Mix of paid (Jan), sent (Feb), draft (Mar) across all clients
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO public.invoices
    (id, workspace_id, user_id, client_id, client_name, invoice_number,
     issue_date, due_date, period_from, period_to, subtotal, notes, status, lines, sent_at, paid_at)
  VALUES
  -- ── Acme Corp — Cloud Migration — January (PAID) ─────────────
  (gen_random_uuid(), v_ws, v_admin, c1, 'Acme Corp', 'INV-2025-001',
   '2026-02-01', '2026-02-15', '2026-01-06', '2026-01-31',
   12000.00,
   'Cloud Migration Phase 1 — AWS infrastructure setup and Terraform IaC',
   'paid',
   '[
     {"description":"Cloud architecture & AWS account setup","hours":32,"rate":240,"amount":7680},
     {"description":"Terraform IaC, VPC & RDS configuration","hours":24,"rate":180,"amount":4320}
   ]'::jsonb,
   '2026-02-01 09:00:00+00', '2026-02-12 14:00:00+00'),

  -- ── Acme Corp — CRM Redesign — January (PAID) ────────────────
  (gen_random_uuid(), v_ws, v_admin, c1, 'Acme Corp', 'INV-2025-002',
   '2026-02-01', '2026-02-28', '2026-01-06', '2026-01-31',
   22000.00,
   'CRM Redesign Sprint 1 & 2 — architecture, backend API, frontend components',
   'paid',
   '[
     {"description":"Architecture design & database schema","hours":32,"rate":200,"amount":6400},
     {"description":"Backend API development (contacts, RBAC)","hours":64,"rate":150,"amount":9600},
     {"description":"Frontend components, reporting & E2E testing","hours":40,"rate":150,"amount":6000}
   ]'::jsonb,
   '2026-02-01 09:00:00+00', '2026-02-25 11:00:00+00'),

  -- ── Nova Solutions — Client Portal v2 — January (PAID) ───────
  (gen_random_uuid(), v_ws, v_admin, c2, 'Nova Solutions', 'INV-2025-003',
   '2026-02-01', '2026-02-28', '2026-01-07', '2026-01-31',
   9040.00,
   'Client Portal v2 — UX, authentication, Stripe integration and UAT',
   'paid',
   '[
     {"description":"UX wireframes & JWT auth module","hours":16,"rate":175,"amount":2800},
     {"description":"Stripe payment integration & RBAC","hours":32,"rate":130,"amount":4160},
     {"description":"API documentation & UAT with Nova team","hours":16,"rate":130,"amount":2080}
   ]'::jsonb,
   '2026-02-01 09:00:00+00', '2026-02-20 15:00:00+00'),

  -- ── Pexco Industries — Mobile App — Jan+Feb (PAID) ───────────
  (gen_random_uuid(), v_ws, v_admin, c3, 'Pexco Industries', 'INV-2025-004',
   '2026-03-01', '2026-03-31', '2026-01-06', '2026-02-28',
   7200.00,
   'Mobile App development — React Native build, App Store submission',
   'paid',
   '[
     {"description":"React Native core features, navigation & offline sync","hours":56,"rate":90,"amount":5040},
     {"description":"App Store submission, QA & beta feedback fixes","hours":24,"rate":90,"amount":2160}
   ]'::jsonb,
   '2026-03-01 09:00:00+00', '2026-03-18 10:00:00+00'),

  -- ── Acme Corp — CRM Redesign — February (SENT) ───────────────
  (gen_random_uuid(), v_ws, v_admin, c1, 'Acme Corp', 'INV-2025-005',
   '2026-03-01', '2026-03-31', '2026-02-03', '2026-02-28',
   20800.00,
   'CRM Redesign Sprint 3 & 4 — automation, integrations, security assessment',
   'sent',
   '[
     {"description":"Workflow automation engine & custom report builder","hours":32,"rate":200,"amount":6400},
     {"description":"Advanced filtering, calendar module & webhook system","hours":64,"rate":150,"amount":9600},
     {"description":"Security vulnerability assessment & test automation","hours":32,"rate":150,"amount":4800}
   ]'::jsonb,
   '2026-03-01 09:00:00+00', NULL),

  -- ── Nova Solutions — Support & Maintenance — Q1 (SENT) ───────
  (gen_random_uuid(), v_ws, v_admin, c2, 'Nova Solutions', 'INV-2025-006',
   '2026-03-01', '2026-03-31', '2026-01-01', '2026-03-25',
   2700.00,
   'Support & Maintenance retainer — Q1 2025 (Jan–Mar)',
   'sent',
   '[
     {"description":"Monthly support retainer — January 2025","hours":10,"rate":90,"amount":900},
     {"description":"Monthly support retainer — February 2025","hours":12,"rate":90,"amount":1080},
     {"description":"Monthly support retainer — March 2025 (partial)","hours":8,"rate":90,"amount":720}
   ]'::jsonb,
   '2026-03-01 09:00:00+00', NULL),

  -- ── Acme Corp — CRM Redesign — March (DRAFT) ─────────────────
  (gen_random_uuid(), v_ws, v_admin, c1, 'Acme Corp', 'INV-2025-007',
   '2026-04-01', '2026-04-30', '2026-03-03', '2026-03-25',
   11600.00,
   'CRM Redesign Sprint 5 — AI features, integrations, advanced search',
   'draft',
   '[
     {"description":"AI lead scoring design & implementation","hours":16,"rate":200,"amount":3200},
     {"description":"Salesforce sync & HubSpot/Mailchimp connectors","hours":32,"rate":150,"amount":4800},
     {"description":"Advanced search (Elasticsearch) & real-time collab","hours":24,"rate":150,"amount":3600}
   ]'::jsonb,
   NULL, NULL);

  RAISE NOTICE 'Sample data loaded successfully for workspace %', v_ws;
END $$;
