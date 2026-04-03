-- ================================================================
-- KAIROS — March 2026 Test Data
-- 1 client · 3 projects · 5 weeks of time entries
-- Weeks 1–3: approved · Week 4: submitted (pending) · Current week: draft
-- March invoices: draft (not yet sent)
-- Keeps: workspaces, users, profiles, workspace_members, consultant_levels
-- ================================================================

DO $$
DECLARE
  v_ws   uuid;
  v_admin uuid;
  v_m1   uuid;
  v_m2   uuid;

  lv_ld  uuid;  -- Lead / highest level
  lv_sr  uuid;  -- Senior / middle
  lv_jr  uuid;  -- Junior / lowest

  c1 uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid();  -- Digital Transformation (main)
  p2 uuid := gen_random_uuid();  -- Cloud Infrastructure
  p3 uuid := gen_random_uuid();  -- Support & Operations
BEGIN
  -- ── 1. Resolve workspace ─────────────────────────────────────────
  SELECT id INTO v_ws FROM public.workspaces ORDER BY created_at DESC LIMIT 1;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'No workspace found'; END IF;

  -- ── 2. Resolve users ─────────────────────────────────────────────
  SELECT user_id INTO v_admin FROM public.workspace_members
    WHERE workspace_id = v_ws AND role = 'admin' AND status = 'active' LIMIT 1;
  IF v_admin IS NULL THEN
    SELECT user_id INTO v_admin FROM public.workspace_members WHERE workspace_id = v_ws LIMIT 1;
  END IF;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'No user found — sign up first'; END IF;

  SELECT user_id INTO v_m1 FROM public.workspace_members
    WHERE workspace_id = v_ws AND user_id <> v_admin AND status = 'active'
    ORDER BY created_at ASC LIMIT 1;

  SELECT user_id INTO v_m2 FROM public.workspace_members
    WHERE workspace_id = v_ws AND user_id <> v_admin AND status = 'active'
    ORDER BY created_at DESC LIMIT 1;

  IF v_m1 IS NULL THEN v_m1 := v_admin; END IF;
  IF v_m2 IS NULL OR v_m2 = v_m1 THEN v_m2 := v_admin; END IF;

  RAISE NOTICE 'Users — admin: %, m1: %, m2: %', v_admin, v_m1, v_m2;

  -- ── 3. Resolve existing consultant levels ─────────────────────────
  SELECT id INTO lv_jr FROM public.consultant_levels WHERE workspace_id = v_ws ORDER BY sort_order ASC  LIMIT 1;
  SELECT id INTO lv_ld FROM public.consultant_levels WHERE workspace_id = v_ws ORDER BY sort_order DESC LIMIT 1;
  SELECT id INTO lv_sr FROM public.consultant_levels WHERE workspace_id = v_ws
    AND id <> lv_jr AND id <> lv_ld ORDER BY sort_order LIMIT 1;
  IF lv_sr IS NULL THEN lv_sr := lv_ld; END IF;
  IF lv_jr IS NULL THEN lv_jr := lv_ld; END IF;

  -- Assign levels to members
  UPDATE public.workspace_members SET level_id = lv_ld WHERE user_id = v_admin AND workspace_id = v_ws;
  IF v_m1 <> v_admin THEN
    UPDATE public.workspace_members SET level_id = lv_sr WHERE user_id = v_m1 AND workspace_id = v_ws;
  END IF;
  IF v_m2 <> v_admin AND v_m2 <> v_m1 THEN
    UPDATE public.workspace_members SET level_id = lv_jr WHERE user_id = v_m2 AND workspace_id = v_ws;
  END IF;

  -- ── 4. Client ─────────────────────────────────────────────────────
  INSERT INTO public.clients (id, user_id, workspace_id, name, email, color, notes) VALUES
    (c1, v_admin, v_ws, 'Meridian Group', 'billing@meridiangroup.com', '#6366f1',
     'Strategic enterprise client — digital transformation program');

  -- ── 5. Projects ───────────────────────────────────────────────────
  INSERT INTO public.projects (id, user_id, workspace_id, client_id, name, color, status, budget_hours, budget_amount, notes, start_date, end_date, manager_id) VALUES
    (p1, v_admin, v_ws, c1, 'Digital Transformation', '#6366f1', 'active', 500, 75000,
     'Core platform modernisation — high priority delivery', '2026-01-05', '2026-06-30', v_admin),
    (p2, v_admin, v_ws, c1, 'Cloud Infrastructure',   '#3b82f6', 'active', 200, 32000,
     'AWS cloud migration & DevOps setup',                  '2026-01-12', '2026-04-30', v_admin),
    (p3, v_admin, v_ws, c1, 'Support & Operations',   '#10b981', 'active', 120,  9600,
     'Monthly support retainer — ~30 h/month',             '2026-01-01', '2026-12-31', v_admin);

  -- ── 6. Per-project level rates ────────────────────────────────────
  INSERT INTO public.project_level_rates (id, project_id, level_id, hourly_rate, rate_type) VALUES
    (gen_random_uuid(), p1, lv_ld, 200, 'hourly'),
    (gen_random_uuid(), p2, lv_ld, 220, 'hourly'),
    (gen_random_uuid(), p3, lv_ld, 180, 'hourly');
  IF lv_sr <> lv_ld THEN
    INSERT INTO public.project_level_rates (id, project_id, level_id, hourly_rate, rate_type) VALUES
      (gen_random_uuid(), p1, lv_sr, 150, 'hourly'),
      (gen_random_uuid(), p2, lv_sr, 160, 'hourly'),
      (gen_random_uuid(), p3, lv_sr, 130, 'hourly');
  END IF;
  IF lv_jr <> lv_ld AND lv_jr <> lv_sr THEN
    INSERT INTO public.project_level_rates (id, project_id, level_id, hourly_rate, rate_type) VALUES
      (gen_random_uuid(), p1, lv_jr, 100, 'hourly'),
      (gen_random_uuid(), p2, lv_jr, 110, 'hourly'),
      (gen_random_uuid(), p3, lv_jr,  90, 'hourly');
  END IF;

  -- ── 7. Time entries ───────────────────────────────────────────────
  -- Week 1: March 2–6 (approved)
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,hourly_rate,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Architecture review & sprint planning',         '2026-03-02 08:00+00','2026-03-02 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'Frontend development — dashboard module',        '2026-03-02 09:00+00','2026-03-02 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p3,lv_jr, 90,'Support ticket resolution',                     '2026-03-02 09:00+00','2026-03-02 15:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p2,lv_ld,220,'AWS VPC & IAM configuration',                    '2026-03-03 08:00+00','2026-03-03 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'API integration & testing',                      '2026-03-03 09:00+00','2026-03-03 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'UI component development',                       '2026-03-03 09:00+00','2026-03-03 16:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Stakeholder review meeting',                     '2026-03-04 08:00+00','2026-03-04 10:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p2,lv_ld,220,'RDS cluster setup',                              '2026-03-04 10:00+00','2026-03-04 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,160,'CI/CD pipeline configuration',                   '2026-03-04 09:00+00','2026-03-04 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Data migration scripts',                         '2026-03-04 09:00+00','2026-03-04 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Code review & technical documentation',          '2026-03-05 08:00+00','2026-03-05 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'User authentication module',                     '2026-03-05 09:00+00','2026-03-05 17:30+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p3,lv_jr, 90,'Monitoring alerts configuration',                '2026-03-05 09:00+00','2026-03-05 13:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Bug fixes — data layer',                         '2026-03-05 13:00+00','2026-03-05 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Sprint retrospective (internal)',                 '2026-03-06 08:00+00','2026-03-06 10:00+00',false),
  (gen_random_uuid(),v_admin,v_ws,p2,lv_ld,220,'Infrastructure cost optimisation',               '2026-03-06 10:00+00','2026-03-06 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'Performance optimisation & caching',             '2026-03-06 09:00+00','2026-03-06 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'E2E test automation',                            '2026-03-06 09:00+00','2026-03-06 16:00+00',true);

  -- Week 2: March 9–13 (approved)
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,hourly_rate,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Sprint 3 planning & backlog grooming',           '2026-03-09 08:00+00','2026-03-09 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'Reporting engine — chart components',            '2026-03-09 09:00+00','2026-03-09 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p3,lv_jr, 90,'Client onboarding support calls',                '2026-03-09 09:00+00','2026-03-09 11:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Backend API — notifications module',             '2026-03-09 11:00+00','2026-03-09 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p2,lv_ld,220,'Security audit & penetration testing prep',      '2026-03-10 08:00+00','2026-03-10 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,160,'Kubernetes cluster deployment',                  '2026-03-10 09:00+00','2026-03-10 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Search & filter functionality',                  '2026-03-10 09:00+00','2026-03-10 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Client demo & feedback session',                 '2026-03-11 08:00+00','2026-03-11 12:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Feature specification — phase 2',                '2026-03-11 12:00+00','2026-03-11 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'WebSocket real-time updates',                    '2026-03-11 09:00+00','2026-03-11 17:30+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Mobile responsiveness fixes',                    '2026-03-11 09:00+00','2026-03-11 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p2,lv_ld,220,'Load balancer & auto-scaling config',            '2026-03-12 08:00+00','2026-03-12 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,160,'Monitoring dashboards — CloudWatch',             '2026-03-12 09:00+00','2026-03-12 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p3,lv_jr, 90,'Incident response & bug triage',                 '2026-03-12 09:00+00','2026-03-12 13:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p2,lv_jr,110,'Terraform state migration',                      '2026-03-12 13:00+00','2026-03-12 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Architecture documentation',                     '2026-03-13 08:00+00','2026-03-13 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'Accessibility audit & WCAG fixes',               '2026-03-13 09:00+00','2026-03-13 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Unit & integration tests',                       '2026-03-13 09:00+00','2026-03-13 17:00+00',true);

  -- Week 3: March 16–20 (approved)
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,hourly_rate,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Q1 steering committee presentation',             '2026-03-16 08:00+00','2026-03-16 12:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Technical risk assessment',                      '2026-03-16 12:00+00','2026-03-16 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'Advanced search — Elasticsearch integration',   '2026-03-16 09:00+00','2026-03-16 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Export to PDF & Excel',                          '2026-03-16 09:00+00','2026-03-16 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p2,lv_ld,220,'Disaster recovery runbook',                      '2026-03-17 08:00+00','2026-03-17 14:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Sprint 4 planning',                              '2026-03-17 14:00+00','2026-03-17 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p2,lv_sr,160,'Blue-green deployment setup',                    '2026-03-17 09:00+00','2026-03-17 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Role-based permissions UI',                      '2026-03-17 09:00+00','2026-03-17 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Code review — backend services',                 '2026-03-18 08:00+00','2026-03-18 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'Multi-tenant data isolation',                    '2026-03-18 09:00+00','2026-03-18 17:30+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p3,lv_jr, 90,'SLA reporting & client update',                  '2026-03-18 09:00+00','2026-03-18 11:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'API rate limiting implementation',                '2026-03-18 11:00+00','2026-03-18 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Client UAT session',                             '2026-03-19 08:00+00','2026-03-19 12:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p2,lv_ld,220,'Final cloud validation & sign-off',              '2026-03-19 12:00+00','2026-03-19 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'Integration test suite',                         '2026-03-19 09:00+00','2026-03-19 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Automated CI/CD for frontend',                   '2026-03-19 09:00+00','2026-03-19 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Sprint review & retrospective (internal)',        '2026-03-20 08:00+00','2026-03-20 10:00+00',false),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Documentation & knowledge transfer',             '2026-03-20 10:00+00','2026-03-20 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'Staging environment deployment',                 '2026-03-20 09:00+00','2026-03-20 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Load testing & performance benchmarks',          '2026-03-20 09:00+00','2026-03-20 17:00+00',true);

  -- Week 4: March 23–27 (submitted — pending review)
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,hourly_rate,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Production release planning',                    '2026-03-23 08:00+00','2026-03-23 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'Production hotfix deployment',                   '2026-03-23 09:00+00','2026-03-23 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p3,lv_jr, 90,'Support queue — 12 tickets resolved',            '2026-03-23 09:00+00','2026-03-23 15:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Post-release monitoring & incident review',      '2026-03-24 08:00+00','2026-03-24 14:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Sprint 5 backlog refinement',                    '2026-03-24 14:00+00','2026-03-24 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'Phase 2 analytics feature development',          '2026-03-24 09:00+00','2026-03-24 17:30+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Onboarding wizard — UI flow',                    '2026-03-24 09:00+00','2026-03-24 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Stakeholder update call',                        '2026-03-25 08:00+00','2026-03-25 10:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Architecture evolution — microservices',         '2026-03-25 10:00+00','2026-03-25 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'Custom reporting — PDF generation',              '2026-03-25 09:00+00','2026-03-25 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Dark mode & theme system',                       '2026-03-25 09:00+00','2026-03-25 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Code review & PR approvals',                     '2026-03-26 08:00+00','2026-03-26 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'Audit log & compliance module',                  '2026-03-26 09:00+00','2026-03-26 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p3,lv_jr, 90,'Monthly SLA report — Meridian',                  '2026-03-26 09:00+00','2026-03-26 13:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Webhook integration — third-party events',       '2026-03-26 13:00+00','2026-03-26 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Q1 summary & billing preparation',               '2026-03-27 08:00+00','2026-03-27 12:00+00',false),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Technical roadmap — Q2 planning',                '2026-03-27 12:00+00','2026-03-27 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'End-to-end regression suite',                    '2026-03-27 09:00+00','2026-03-27 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Storybook component documentation',              '2026-03-27 09:00+00','2026-03-27 16:30+00',true);

  -- Week 5 (current): March 30 – April 3 (NOT submitted)
  INSERT INTO public.time_entries (id,user_id,workspace_id,project_id,level_id,hourly_rate,description,start_time,end_time,billable) VALUES
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Sprint 5 kickoff & planning',                    '2026-03-30 08:00+00','2026-03-30 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'Analytics dashboard — charts v2',                '2026-03-30 09:00+00','2026-03-30 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Multi-language i18n setup',                      '2026-03-30 09:00+00','2026-03-30 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p2,lv_ld,220,'Cloud cost review & optimisation',               '2026-03-31 08:00+00','2026-03-31 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'User profile & settings module',                 '2026-03-31 09:00+00','2026-03-31 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p3,lv_jr, 90,'Support — critical P1 bug resolution',           '2026-03-31 09:00+00','2026-03-31 14:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Notification preference centre',                 '2026-03-31 14:00+00','2026-03-31 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Architecture review — v2 API design',            '2026-04-01 08:00+00','2026-04-01 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'Data export — CSV & JSON formats',               '2026-04-01 09:00+00','2026-04-01 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Responsive layout — mobile breakpoints',         '2026-04-01 09:00+00','2026-04-01 17:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Stakeholder review prep',                        '2026-04-02 08:00+00','2026-04-02 12:00+00',true),
  (gen_random_uuid(),v_admin,v_ws,p1,lv_ld,200,'Technical documentation update',                 '2026-04-02 12:00+00','2026-04-02 16:00+00',true),
  (gen_random_uuid(),v_m1,   v_ws,p1,lv_sr,150,'Bulk import functionality',                      '2026-04-02 09:00+00','2026-04-02 17:00+00',true),
  (gen_random_uuid(),v_m2,   v_ws,p1,lv_jr,100,'Accessibility improvements — ARIA labels',       '2026-04-02 09:00+00','2026-04-02 17:00+00',true);

  -- ── 8. Timesheets ─────────────────────────────────────────────────
  -- Week 1 (Mar 2): approved + locked
  INSERT INTO public.timesheets (user_id,workspace_id,week_start,status,note,submitted_at,reviewed_at,reviewed_by,locked,locked_at,locked_by) VALUES
    (v_admin,v_ws,'2026-03-02','approved','Completed all planned deliverables',
     '2026-03-07 16:00+00','2026-03-08 09:00+00',v_admin,true,'2026-03-08 09:00+00',v_admin);
  IF v_m1 <> v_admin THEN INSERT INTO public.timesheets (user_id,workspace_id,week_start,status,note,submitted_at,reviewed_at,reviewed_by,locked,locked_at,locked_by) VALUES
    (v_m1,v_ws,'2026-03-02','approved','Good progress on sprint tasks',
     '2026-03-07 17:00+00','2026-03-08 09:30+00',v_admin,true,'2026-03-08 09:30+00',v_admin);
  END IF;
  IF v_m2 <> v_admin AND v_m2 <> v_m1 THEN INSERT INTO public.timesheets (user_id,workspace_id,week_start,status,note,submitted_at,reviewed_at,reviewed_by,locked,locked_at,locked_by) VALUES
    (v_m2,v_ws,'2026-03-02','approved','Support & dev completed',
     '2026-03-07 17:30+00','2026-03-08 10:00+00',v_admin,true,'2026-03-08 10:00+00',v_admin);
  END IF;

  -- Week 2 (Mar 9): approved + locked
  INSERT INTO public.timesheets (user_id,workspace_id,week_start,status,note,submitted_at,reviewed_at,reviewed_by,locked,locked_at,locked_by) VALUES
    (v_admin,v_ws,'2026-03-09','approved','Client demo went well, strong week',
     '2026-03-14 16:00+00','2026-03-15 09:00+00',v_admin,true,'2026-03-15 09:00+00',v_admin);
  IF v_m1 <> v_admin THEN INSERT INTO public.timesheets (user_id,workspace_id,week_start,status,note,submitted_at,reviewed_at,reviewed_by,locked,locked_at,locked_by) VALUES
    (v_m1,v_ws,'2026-03-09','approved','Kubernetes deployment done',
     '2026-03-14 17:00+00','2026-03-15 09:30+00',v_admin,true,'2026-03-15 09:30+00',v_admin);
  END IF;
  IF v_m2 <> v_admin AND v_m2 <> v_m1 THEN INSERT INTO public.timesheets (user_id,workspace_id,week_start,status,note,submitted_at,reviewed_at,reviewed_by,locked,locked_at,locked_by) VALUES
    (v_m2,v_ws,'2026-03-09','approved','Cloud & support tasks completed',
     '2026-03-14 17:30+00','2026-03-15 10:00+00',v_admin,true,'2026-03-15 10:00+00',v_admin);
  END IF;

  -- Week 3 (Mar 16): approved + locked
  INSERT INTO public.timesheets (user_id,workspace_id,week_start,status,note,submitted_at,reviewed_at,reviewed_by,locked,locked_at,locked_by) VALUES
    (v_admin,v_ws,'2026-03-16','approved','UAT successful, cloud signed off',
     '2026-03-21 16:00+00','2026-03-22 09:00+00',v_admin,true,'2026-03-22 09:00+00',v_admin);
  IF v_m1 <> v_admin THEN INSERT INTO public.timesheets (user_id,workspace_id,week_start,status,note,submitted_at,reviewed_at,reviewed_by,locked,locked_at,locked_by) VALUES
    (v_m1,v_ws,'2026-03-16','approved','Staging deployment & tests passed',
     '2026-03-21 17:00+00','2026-03-22 09:30+00',v_admin,true,'2026-03-22 09:30+00',v_admin);
  END IF;
  IF v_m2 <> v_admin AND v_m2 <> v_m1 THEN INSERT INTO public.timesheets (user_id,workspace_id,week_start,status,note,submitted_at,reviewed_at,reviewed_by,locked,locked_at,locked_by) VALUES
    (v_m2,v_ws,'2026-03-16','approved','Load tests & support completed',
     '2026-03-21 17:30+00','2026-03-22 10:00+00',v_admin,true,'2026-03-22 10:00+00',v_admin);
  END IF;

  -- Week 4 (Mar 23): submitted — awaiting review
  INSERT INTO public.timesheets (user_id,workspace_id,week_start,status,note,submitted_at) VALUES
    (v_admin,v_ws,'2026-03-23','submitted','Q1 complete — strong delivery week','2026-03-28 16:00+00');
  IF v_m1 <> v_admin THEN INSERT INTO public.timesheets (user_id,workspace_id,week_start,status,note,submitted_at) VALUES
    (v_m1,v_ws,'2026-03-23','submitted','Analytics module delivered on time','2026-03-28 17:00+00');
  END IF;
  IF v_m2 <> v_admin AND v_m2 <> v_m1 THEN INSERT INTO public.timesheets (user_id,workspace_id,week_start,status,note,submitted_at) VALUES
    (v_m2,v_ws,'2026-03-23','submitted','Support & webhook tasks done','2026-03-28 17:30+00');
  END IF;

  -- Week 5 (Mar 30 = current week): no row = draft, not yet submitted

  -- ── 9. Invoices — March 2026 (all draft, not sent) ───────────────
  INSERT INTO public.invoices
    (workspace_id,user_id,client_id,client_name,invoice_number,issue_date,due_date,period_from,period_to,subtotal,status,notes,lines)
  VALUES
  (v_ws, v_admin, c1, 'Meridian Group', 'INV-2026-031', '2026-03-31', '2026-04-30',
   '2026-03-01', '2026-03-31', 38600, 'draft',
   'Digital Transformation — March 2026',
   '[
     {"description":"Architecture & project management (Lead @ €200/h)","hours":130,"rate":200,"amount":26000},
     {"description":"Senior engineering (Senior @ €150/h)","hours":84,"rate":150,"amount":12600}
   ]'::jsonb),

  (v_ws, v_admin, c1, 'Meridian Group', 'INV-2026-032', '2026-03-31', '2026-04-30',
   '2026-03-01', '2026-03-31', 12080, 'draft',
   'Cloud Infrastructure — March 2026',
   '[
     {"description":"Cloud architecture (Lead @ €220/h)","hours":36,"rate":220,"amount":7920},
     {"description":"DevOps engineering (Senior @ €160/h)","hours":26,"rate":160,"amount":4160}
   ]'::jsonb),

  (v_ws, v_admin, c1, 'Meridian Group', 'INV-2026-033', '2026-03-31', '2026-04-30',
   '2026-03-01', '2026-03-31', 2070, 'draft',
   'Support & Operations — March 2026',
   '[
     {"description":"Support & operations (Junior @ €90/h)","hours":23,"rate":90,"amount":2070}
   ]'::jsonb);

  RAISE NOTICE '✓ Done. 1 client · 3 projects · 5 weeks of entries · weeks 1–3 approved · week 4 submitted · current week draft · 3 draft invoices.';
END $$;
