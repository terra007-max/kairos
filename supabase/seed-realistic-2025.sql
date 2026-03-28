-- ══════════════════════════════════════════════════════════════════════════════
-- KAIROS — Realistic Austrian Consulting Data Seed (2025-01-06 → 2026-03-22)
--
-- Run in Supabase SQL Editor.
-- Keeps:  workspaces, workspace_members, profiles, auth.users
-- Clears: everything else, then re-seeds with realistic data.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  ws_id      uuid;
  admin_id   uuid;
  members    uuid[];
  m_count    int;

  -- Consultant level IDs
  lv_jun uuid := gen_random_uuid();
  lv_sen uuid := gen_random_uuid();
  lv_mgr uuid := gen_random_uuid();
  lv_par uuid := gen_random_uuid();

  -- Client IDs
  cl_mayr    uuid := gen_random_uuid();
  cl_steiner uuid := gen_random_uuid();
  cl_alpen   uuid := gen_random_uuid();
  cl_wohnbau uuid := gen_random_uuid();
  cl_danubia uuid := gen_random_uuid();

  -- Project IDs
  pr_erp      uuid := gen_random_uuid();
  pr_prozess  uuid := gen_random_uuid();
  pr_kanzlei  uuid := gen_random_uuid();
  pr_mifid    uuid := gen_random_uuid();
  pr_cloud    uuid := gen_random_uuid();
  pr_wohnmgmt uuid := gen_random_uuid();
  pr_scm      uuid := gen_random_uuid();

  -- Loop variables
  wd       date;
  uid      uuid;
  proj_id  uuid;
  lvl_id   uuid;
  rate     numeric;
  dur_h    int;
  sh       int;
  descs    text[];
  di       int;

  all_users uuid[];

BEGIN
  -- ── Resolve workspace & users ──────────────────────────────────────────────
  SELECT id INTO ws_id FROM public.workspaces LIMIT 1;
  IF ws_id IS NULL THEN RAISE EXCEPTION 'No workspace found — aborting.'; END IF;

  SELECT user_id INTO admin_id
  FROM public.workspace_members
  WHERE workspace_id = ws_id AND role = 'admin' AND status = 'active'
  LIMIT 1;

  SELECT array_agg(user_id ORDER BY created_at) INTO members
  FROM public.workspace_members
  WHERE workspace_id = ws_id AND role = 'member' AND status = 'active';

  m_count   := coalesce(array_length(members, 1), 0);
  all_users := coalesce(members, '{}'::uuid[]) || ARRAY[admin_id];

  RAISE NOTICE 'Workspace: %, admin: %, members: %', ws_id, admin_id, m_count;

  -- ── Clear existing data (FK-safe order) ────────────────────────────────────
  DELETE FROM public.time_off_entries  WHERE workspace_id = ws_id;
  DELETE FROM public.invoices          WHERE workspace_id = ws_id;
  DELETE FROM public.timesheets        WHERE workspace_id = ws_id;
  DELETE FROM public.time_entries      WHERE workspace_id = ws_id;
  DELETE FROM public.project_members   WHERE workspace_id = ws_id;
  DELETE FROM public.project_level_rates
    WHERE project_id IN (SELECT id FROM public.projects WHERE workspace_id = ws_id);
  DELETE FROM public.projects          WHERE workspace_id = ws_id;
  DELETE FROM public.clients           WHERE workspace_id = ws_id;
  DELETE FROM public.consultant_levels WHERE workspace_id = ws_id;

  -- ── Delete non-admin users ────────────────────────────────────────────────
  DELETE FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id != admin_id;
  DELETE FROM public.profiles
    WHERE id != admin_id;
  DELETE FROM auth.users
    WHERE id != admin_id;

  -- Reset members array — all non-admin users are gone
  members := NULL;
  m_count := 0;
  all_users := ARRAY[admin_id];

  -- ── 1. Consultant Levels ───────────────────────────────────────────────────
  INSERT INTO public.consultant_levels (id, workspace_id, user_id, name, sort_order) VALUES
    (lv_jun, ws_id, admin_id, 'Junior Consultant', 1),
    (lv_sen, ws_id, admin_id, 'Senior Consultant', 2),
    (lv_mgr, ws_id, admin_id, 'Manager',           3),
    (lv_par, ws_id, admin_id, 'Partner',           4);

  -- Assign levels: first member → Junior, second → Senior, rest → Manager, admin → Partner
  UPDATE public.workspace_members SET level_id = lv_par
    WHERE user_id = admin_id AND workspace_id = ws_id;
  IF m_count >= 1 THEN
    UPDATE public.workspace_members SET level_id = lv_jun
      WHERE user_id = members[1] AND workspace_id = ws_id;
  END IF;
  IF m_count >= 2 THEN
    UPDATE public.workspace_members SET level_id = lv_sen
      WHERE user_id = members[2] AND workspace_id = ws_id;
  END IF;
  IF m_count >= 3 THEN
    UPDATE public.workspace_members SET level_id = lv_mgr
      WHERE user_id = members[3] AND workspace_id = ws_id;
  END IF;

  -- ── 2. Clients ─────────────────────────────────────────────────────────────
  INSERT INTO public.clients (id, workspace_id, user_id, name, email, color) VALUES
    (cl_mayr,    ws_id, admin_id, 'Mayr Metallbau GmbH',             'office@mayr-metallbau.at',  '#ef4444'),
    (cl_steiner, ws_id, admin_id, 'Steiner & Partner Rechtsanwälte', 'kanzlei@steiner-rae.at',    '#8b5cf6'),
    (cl_alpen,   ws_id, admin_id, 'Alpenbank AG',                    'info@alpenbank.at',          '#3b82f6'),
    (cl_wohnbau, ws_id, admin_id, 'Wiener Wohnbau GmbH',             'buero@wienerwohnbau.at',    '#f97316'),
    (cl_danubia, ws_id, admin_id, 'Danubia Logistics KG',            'kontakt@danubia-log.at',    '#10b981');

  -- ── 3. Projects ────────────────────────────────────────────────────────────
  INSERT INTO public.projects
    (id, workspace_id, user_id, client_id, name, color,
     hourly_rate, status, budget_hours, start_date, end_date, rounding_minutes)
  VALUES
    (pr_erp,      ws_id, admin_id, cl_mayr,    'ERP-Einführung SAP S/4HANA',         '#ef4444', 0, 'active',   2400, '2025-01-06', '2026-06-30', 15),
    (pr_prozess,  ws_id, admin_id, cl_mayr,    'Prozessoptimierung Produktion',      '#f87171', 0, 'active',    600, '2025-03-01', '2025-12-31', 15),
    (pr_kanzlei,  ws_id, admin_id, cl_steiner, 'Digitale Kanzleiverwaltung',         '#8b5cf6', 0, 'archived',  400, '2025-02-01', '2025-10-31',  0),
    (pr_mifid,    ws_id, admin_id, cl_alpen,   'Regulatorisches Reporting MiFID II', '#3b82f6', 0, 'archived',  800, '2025-01-06', '2025-09-30', 15),
    (pr_cloud,    ws_id, admin_id, cl_alpen,   'Cloud-Migration Core Banking',       '#60a5fa', 0, 'active',   1600, '2025-04-01', '2026-03-31', 15),
    (pr_wohnmgmt, ws_id, admin_id, cl_wohnbau, 'Digitalisierung Mietverwaltung',     '#f97316', 0, 'archived',  500, '2025-05-01', '2025-12-31',  0),
    (pr_scm,      ws_id, admin_id, cl_danubia, 'Supply Chain Management System',     '#10b981', 0, 'active',   1200, '2025-02-15', '2026-02-28', 15);

  -- Set project manager
  UPDATE public.projects SET manager_id = admin_id WHERE workspace_id = ws_id;

  -- ── 4. Level Rates ─────────────────────────────────────────────────────────
  INSERT INTO public.project_level_rates (project_id, level_id, hourly_rate, rate_type) VALUES
    -- ERP
    (pr_erp, lv_jun, 95, 'hourly'), (pr_erp, lv_sen, 145, 'hourly'),
    (pr_erp, lv_mgr, 185, 'hourly'), (pr_erp, lv_par, 240, 'hourly'),
    -- Prozess
    (pr_prozess, lv_jun, 90, 'hourly'), (pr_prozess, lv_sen, 140, 'hourly'),
    (pr_prozess, lv_mgr, 175, 'hourly'), (pr_prozess, lv_par, 230, 'hourly'),
    -- Kanzlei
    (pr_kanzlei, lv_jun, 85, 'hourly'), (pr_kanzlei, lv_sen, 130, 'hourly'),
    (pr_kanzlei, lv_mgr, 170, 'hourly'), (pr_kanzlei, lv_par, 220, 'hourly'),
    -- MiFID
    (pr_mifid, lv_jun, 100, 'hourly'), (pr_mifid, lv_sen, 155, 'hourly'),
    (pr_mifid, lv_mgr, 195, 'hourly'), (pr_mifid, lv_par, 250, 'hourly'),
    -- Cloud
    (pr_cloud, lv_jun, 105, 'hourly'), (pr_cloud, lv_sen, 160, 'hourly'),
    (pr_cloud, lv_mgr, 200, 'hourly'), (pr_cloud, lv_par, 260, 'hourly'),
    -- Wohnmgmt
    (pr_wohnmgmt, lv_jun, 80, 'hourly'), (pr_wohnmgmt, lv_sen, 125, 'hourly'),
    (pr_wohnmgmt, lv_mgr, 160, 'hourly'), (pr_wohnmgmt, lv_par, 210, 'hourly'),
    -- SCM
    (pr_scm, lv_jun, 95, 'hourly'), (pr_scm, lv_sen, 145, 'hourly'),
    (pr_scm, lv_mgr, 185, 'hourly'), (pr_scm, lv_par, 240, 'hourly');

  -- ── 5. Project Members ─────────────────────────────────────────────────────
  -- Admin/Partner on strategic projects
  INSERT INTO public.project_members (project_id, user_id, workspace_id) VALUES
    (pr_erp,     admin_id, ws_id),
    (pr_cloud,   admin_id, ws_id),
    (pr_scm,     admin_id, ws_id),
    (pr_mifid,   admin_id, ws_id);

  IF m_count >= 1 THEN
    INSERT INTO public.project_members (project_id, user_id, workspace_id) VALUES
      (pr_erp,     members[1], ws_id),
      (pr_prozess, members[1], ws_id),
      (pr_scm,     members[1], ws_id),
      (pr_kanzlei, members[1], ws_id);
  END IF;
  IF m_count >= 2 THEN
    INSERT INTO public.project_members (project_id, user_id, workspace_id) VALUES
      (pr_mifid,   members[2], ws_id),
      (pr_cloud,   members[2], ws_id),
      (pr_wohnmgmt,members[2], ws_id);
  END IF;
  IF m_count >= 3 THEN
    INSERT INTO public.project_members (project_id, user_id, workspace_id) VALUES
      (pr_cloud,   members[3], ws_id),
      (pr_scm,     members[3], ws_id),
      (pr_wohnmgmt,members[3], ws_id);
  END IF;

  -- ── 6. Time Entries ────────────────────────────────────────────────────────
  -- Austrian public holidays to skip
  -- Loop over all working days Mon–Fri, skip holidays
  FOR wd IN
    SELECT d::date
    FROM generate_series('2025-01-06'::date, '2026-03-22'::date, '1 day'::interval) d
    WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
      AND d::date NOT IN (
        '2025-01-06',  -- Heilige Drei Könige
        '2025-04-18',  -- Karfreitag
        '2025-04-21',  -- Ostermontag
        '2025-05-01',  -- Staatsfeiertag
        '2025-05-29',  -- Christi Himmelfahrt
        '2025-06-09',  -- Pfingstmontag
        '2025-06-19',  -- Fronleichnam
        '2025-08-15',  -- Mariä Himmelfahrt
        '2025-10-26',  -- Nationalfeiertag
        '2025-11-01',  -- Allerheiligen
        '2025-12-08',  -- Mariä Empfängnis
        '2025-12-24',  -- Heiligabend
        '2025-12-25',  -- Weihnachten
        '2025-12-26',  -- Stefanitag
        '2025-12-31',  -- Silvester
        '2026-01-01',  -- Neujahr
        '2026-01-06'   -- Heilige Drei Könige
      )
  LOOP

    -- ── Member 1 (Junior Consultant) ──────────────────────────────────────
    IF m_count >= 1 AND random() > 0.07   -- ~7% absence
       AND NOT (wd >= '2025-08-04' AND wd <= '2025-08-15')  -- summer vacation
    THEN

      -- Choose project by time period
      IF wd < '2025-06-01' THEN
        proj_id := pr_erp; lvl_id := lv_jun; rate := 95;
        descs := ARRAY[
          'SAP-Customizing Einkaufsmodul',
          'Anforderungsworkshop Lagerverwaltung',
          'Blueprint-Erstellung FI-CO',
          'Lückenanalyse IST/SOLL Rechnungswesen',
          'Integrationstests MM-FI Schnittstelle',
          'Key User Schulung Materialwirtschaft',
          'Datenmigrations­planung Kreditoren',
          'Technische Spezifikation Customizing'
        ];
      ELSIF wd < '2025-09-01' THEN
        proj_id := CASE WHEN random() > 0.3 THEN pr_erp ELSE pr_prozess END;
        IF proj_id = pr_erp THEN
          lvl_id := lv_jun; rate := 95;
          descs := ARRAY[
            'Testfall-Erstellung UAT',
            'Fehlerbehebung Buchungskreis',
            'Go-Live Vorbereitung Produktionssystem',
            'Cutover-Planung Datenmigration',
            'Hyper-Care Support ERP',
            'Anwender­dokumentation SD-Modul'
          ];
        ELSE
          lvl_id := lv_jun; rate := 90;
          descs := ARRAY[
            'Prozessaufnahme Fertigungssteuerung',
            'Wertstromanalyse IST-Zustand',
            'KPI-Definition Produktionskennzahlen',
            'Workshop Rüstzeit­optimierung',
            'SOLL-Konzept Intralogistik'
          ];
        END IF;
      ELSIF wd < '2025-12-01' THEN
        proj_id := CASE WHEN random() > 0.4 THEN pr_scm ELSE pr_kanzlei END;
        IF proj_id = pr_scm THEN
          lvl_id := lv_jun; rate := 95;
          descs := ARRAY[
            'SCM-Anforderungsanalyse Disposition',
            'Prozessaufnahme Lagerlogistik',
            'Workshop Lieferanten­management',
            'Systemarchitektur WMS',
            'Testfall­dokumentation SCM-Modul',
            'Stammdaten­bereinigung Artikel'
          ];
        ELSE
          lvl_id := lv_jun; rate := 85;
          descs := ARRAY[
            'Requirements Analysis Dokumenten­management',
            'Schnittstellen-Design Bestandssystem',
            'Datenschutz-Review DSGVO',
            'Prototype Kanzlei­software',
            'Abnahmetests DMS-Modul'
          ];
        END IF;
      ELSE
        proj_id := pr_scm; lvl_id := lv_jun; rate := 95;
        descs := ARRAY[
          'Go-Live Begleitung SCM',
          'Hyper-Care Support Lager',
          'Optimierung Nachschub­planung',
          'Reporting-Konfiguration SCM',
          'Schulung Key User Disposition'
        ];
      END IF;

      di    := 1 + floor(random() * array_length(descs, 1))::int;
      dur_h := 6 + floor(random() * 3)::int;   -- 6–8 h
      sh    := 7 + floor(random() * 2)::int;    -- 07:00 or 08:00 UTC (= 08/09 CET)

      INSERT INTO public.time_entries
        (workspace_id, user_id, project_id, level_id, description, billable, hourly_rate, start_time, end_time)
      VALUES (
        ws_id, members[1], proj_id, lvl_id, descs[di], true, rate,
        (wd::timestamp + (sh::text || ' hours')::interval) AT TIME ZONE 'UTC',
        (wd::timestamp + ((sh + dur_h)::text || ' hours')::interval) AT TIME ZONE 'UTC'
      );
    END IF;

    -- ── Member 2 (Senior Consultant) ─────────────────────────────────────
    IF m_count >= 2 AND random() > 0.07   -- ~7% absence
       AND NOT (wd >= '2025-07-14' AND wd <= '2025-07-25')  -- summer vacation
    THEN

      IF wd < '2025-10-01' THEN
        proj_id := pr_mifid; lvl_id := lv_sen; rate := 155;
        descs := ARRAY[
          'Regulatorische Anforderungs­analyse MiFID II',
          'Reporting-Architektur Design',
          'Datenpunkte-Mapping Transaktions­reporting',
          'Compliance Review Meeting',
          'Testszenarien Aufsichts­reporting',
          'Stakeholder-Abstimmung FMA',
          'Gap-Analyse Bestands­system',
          'Fachkonzept Transaction Reporting'
        ];
      ELSIF wd < '2026-01-01' THEN
        proj_id := pr_cloud; lvl_id := lv_sen; rate := 160;
        descs := ARRAY[
          'Cloud-Architektur Assessment',
          'Migrations­strategie Core Banking',
          'Security-Konzept AWS Financial Services',
          'Schnittstellen-Design API Gateway',
          'Proof of Concept Containerisierung',
          'Lasttest-Planung und -Durchführung',
          'Betriebskonzept Cloud-Infrastruktur',
          'DR-Konzept Disaster Recovery'
        ];
      ELSE
        proj_id := pr_cloud; lvl_id := lv_sen; rate := 160;
        descs := ARRAY[
          'Migrations­durchführung Pilot-Mandant',
          'Performance-Tuning Datenbank Cloud',
          'Go-Live Vorbereitung Core Banking',
          'Hypercare­begleitung Cloud',
          'Abschluss­dokumentation Migration'
        ];
      END IF;

      di    := 1 + floor(random() * array_length(descs, 1))::int;
      dur_h := 6 + floor(random() * 3)::int;
      sh    := 7 + floor(random() * 2)::int;

      INSERT INTO public.time_entries
        (workspace_id, user_id, project_id, level_id, description, billable, hourly_rate, start_time, end_time)
      VALUES (
        ws_id, members[2], proj_id, lvl_id, descs[di], true, rate,
        (wd::timestamp + (sh::text || ' hours')::interval) AT TIME ZONE 'UTC',
        (wd::timestamp + ((sh + dur_h)::text || ' hours')::interval) AT TIME ZONE 'UTC'
      );
    END IF;

    -- ── Admin / Partner — strategic hours (40 % of days, 2–4 h) ──────────
    IF random() > 0.60 THEN
      proj_id := CASE
        WHEN wd < '2025-04-01' THEN pr_erp
        WHEN wd < '2025-10-01' THEN pr_mifid
        ELSE pr_cloud
      END;
      lvl_id := lv_par;
      rate   := CASE proj_id
        WHEN pr_erp   THEN 240
        WHEN pr_mifid THEN 250
        ELSE               260
      END;
      descs := ARRAY[
        'Projektsteuerung und Qualitäts­sicherung',
        'Steering Committee Vorbereitung',
        'Angebots­erstellung Folgeprojekt',
        'Kundenmeeting Statusbericht',
        'Strategische Beratung Geschäftsführung',
        'Risiko­bewertung Projektstatus',
        'Executive Briefing',
        'Vertrags­verhandlung',
        'Sales-Gespräch Neukunde',
        'Interne Qualitätssicherung'
      ];
      di    := 1 + floor(random() * array_length(descs, 1))::int;
      dur_h := 1 + floor(random() * 3)::int;  -- 1–3 h
      sh    := 8 + floor(random() * 4)::int;  -- 08–11 UTC

      INSERT INTO public.time_entries
        (workspace_id, user_id, project_id, level_id, description, billable, hourly_rate, start_time, end_time)
      VALUES (
        ws_id, admin_id, proj_id, lvl_id, descs[di], true, rate,
        (wd::timestamp + (sh::text || ' hours')::interval) AT TIME ZONE 'UTC',
        (wd::timestamp + ((sh + dur_h)::text || ' hours')::interval) AT TIME ZONE 'UTC'
      );
    END IF;

  END LOOP; -- working days

  -- ── 7. Time Off Entries ────────────────────────────────────────────────────
  IF m_count >= 1 THEN
    -- Member 1: summer vacation August 4–15, 2025
    INSERT INTO public.time_off_entries (workspace_id, user_id, date, type, hours) VALUES
      (ws_id, members[1], '2025-08-04', 'vacation', 8),
      (ws_id, members[1], '2025-08-05', 'vacation', 8),
      (ws_id, members[1], '2025-08-06', 'vacation', 8),
      (ws_id, members[1], '2025-08-07', 'vacation', 8),
      (ws_id, members[1], '2025-08-08', 'vacation', 8),
      (ws_id, members[1], '2025-08-11', 'vacation', 8),
      (ws_id, members[1], '2025-08-12', 'vacation', 8),
      (ws_id, members[1], '2025-08-13', 'vacation', 8),
      (ws_id, members[1], '2025-08-14', 'vacation', 8),
      -- Christmas 2025
      (ws_id, members[1], '2025-12-22', 'vacation', 8),
      (ws_id, members[1], '2025-12-23', 'vacation', 8),
      (ws_id, members[1], '2025-12-29', 'vacation', 8),
      (ws_id, members[1], '2025-12-30', 'vacation', 8);
  END IF;

  IF m_count >= 2 THEN
    -- Member 2: July vacation
    INSERT INTO public.time_off_entries (workspace_id, user_id, date, type, hours) VALUES
      (ws_id, members[2], '2025-07-14', 'vacation', 8),
      (ws_id, members[2], '2025-07-15', 'vacation', 8),
      (ws_id, members[2], '2025-07-16', 'vacation', 8),
      (ws_id, members[2], '2025-07-17', 'vacation', 8),
      (ws_id, members[2], '2025-07-18', 'vacation', 8),
      (ws_id, members[2], '2025-07-21', 'vacation', 8),
      (ws_id, members[2], '2025-07-22', 'vacation', 8),
      (ws_id, members[2], '2025-07-23', 'vacation', 8),
      (ws_id, members[2], '2025-07-24', 'vacation', 8),
      (ws_id, members[2], '2025-07-25', 'vacation', 8);
  END IF;

  -- ── 8. Timesheets ──────────────────────────────────────────────────────────
  -- All Mondays from 2025-01-06 to 2026-03-16
  FOR wd IN
    SELECT d::date
    FROM generate_series('2025-01-06'::date, '2026-03-16'::date, '7 days') d
  LOOP
    FOREACH uid IN ARRAY all_users LOOP
      IF wd <= '2026-03-02' THEN
        -- Approved — submitted Friday of that week, reviewed Monday after
        INSERT INTO public.timesheets
          (workspace_id, user_id, week_start, status, submitted_at, reviewed_at, note)
        VALUES (
          ws_id, uid, wd, 'approved',
          (wd + interval '4 days' + interval '16 hours'),  -- Friday 18:00
          (wd + interval '7 days' + interval '9 hours'),   -- Monday 11:00
          NULL
        )
        ON CONFLICT (user_id, workspace_id, week_start) DO NOTHING;

      ELSIF wd = '2026-03-09' THEN
        -- Submitted — awaiting review
        INSERT INTO public.timesheets
          (workspace_id, user_id, week_start, status, submitted_at, note)
        VALUES (
          ws_id, uid, wd, 'submitted',
          (wd + interval '4 days' + interval '17 hours'),  -- Friday 19:00
          'Woche abgeschlossen — bitte um Freigabe.'
        )
        ON CONFLICT (user_id, workspace_id, week_start) DO NOTHING;

      ELSIF wd = '2026-03-16' THEN
        -- Draft / locked (Sunday deadline 2026-03-22 23:00 has passed)
        INSERT INTO public.timesheets
          (workspace_id, user_id, week_start, status, locked, locked_at)
        VALUES (
          ws_id, uid, wd, 'draft', true,
          '2026-03-22T23:05:00Z'
        )
        ON CONFLICT (user_id, workspace_id, week_start) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;

  -- ── 9. Invoices ────────────────────────────────────────────────────────────
  -- Mayr Metallbau — ERP project (quarterly)
  INSERT INTO public.invoices
    (workspace_id, user_id, client_id, client_name, invoice_number,
     issue_date, due_date, period_from, period_to, subtotal, notes, status, lines, sent_at, paid_at)
  VALUES
  ( ws_id, admin_id, cl_mayr, 'Mayr Metallbau GmbH', 'INV-202502-001',
    '2025-02-03', '2025-03-05', '2025-01-06', '2025-01-31',
    40375.00,
    'Zahlungsziel 30 Tage netto. IBAN AT61 1904 3002 3457 3201.',
    'paid',
    '[{"description":"ERP-Einführung SAP S/4HANA – Januar 2025","hours":380,"rate":95,"amount":36100},{"description":"Projektsteuerung Partner","hours":17,"rate":240,"amount":4080},{"description":"Reisekosten pauschal","hours":0,"rate":0,"amount":195}]'::jsonb,
    '2025-02-03', '2025-03-03'),

  ( ws_id, admin_id, cl_mayr, 'Mayr Metallbau GmbH', 'INV-202505-001',
    '2025-05-05', '2025-06-04', '2025-04-01', '2025-04-30',
    43795.00,
    'Zahlungsziel 30 Tage netto. IBAN AT61 1904 3002 3457 3201.',
    'paid',
    '[{"description":"ERP-Einführung SAP S/4HANA – April 2025","hours":390,"rate":95,"amount":37050},{"description":"Prozessoptimierung Produktion","hours":38,"rate":90,"amount":3420},{"description":"Projektsteuerung Partner","hours":14,"rate":240,"amount":3360},{"description":"Reisekosten pauschal","hours":0,"rate":0,"amount":165}]'::jsonb,
    '2025-05-05', '2025-06-02'),

  ( ws_id, admin_id, cl_mayr, 'Mayr Metallbau GmbH', 'INV-202508-001',
    '2025-08-04', '2025-09-03', '2025-07-01', '2025-07-31',
    38240.00,
    'Zahlungsziel 30 Tage netto. IBAN AT61 1904 3002 3457 3201.',
    'sent',
    '[{"description":"ERP-Einführung SAP S/4HANA – Juli 2025","hours":340,"rate":95,"amount":32300},{"description":"Prozessoptimierung Produktion","hours":32,"rate":90,"amount":2880},{"description":"Projektsteuerung Partner","hours":13,"rate":240,"amount":3120},{"description":"Reisekosten pauschal","hours":0,"rate":0,"amount":-60}]'::jsonb,
    '2025-08-04', NULL),

  ( ws_id, admin_id, cl_mayr, 'Mayr Metallbau GmbH', 'INV-202511-001',
    '2025-11-03', '2025-12-03', '2025-10-01', '2025-10-31',
    37905.00,
    'Zahlungsziel 30 Tage netto. IBAN AT61 1904 3002 3457 3201.',
    'sent',
    '[{"description":"ERP-Einführung SAP S/4HANA – Oktober 2025","hours":360,"rate":95,"amount":34200},{"description":"Projektsteuerung & Lenkungsausschuss","hours":15,"rate":240,"amount":3600},{"description":"Reisekosten pauschal","hours":0,"rate":0,"amount":105}]'::jsonb,
    '2025-11-03', NULL),

  ( ws_id, admin_id, cl_mayr, 'Mayr Metallbau GmbH', 'INV-202602-001',
    '2026-02-02', '2026-03-04', '2026-01-05', '2026-01-31',
    34295.00,
    'Zahlungsziel 30 Tage netto. IBAN AT61 1904 3002 3457 3201.',
    'sent',
    '[{"description":"ERP-Einführung SAP S/4HANA – Jänner 2026","hours":320,"rate":95,"amount":30400},{"description":"Projektsteuerung Partner","hours":16,"rate":240,"amount":3840},{"description":"Reisekosten pauschal","hours":0,"rate":0,"amount":55}]'::jsonb,
    '2026-02-02', NULL);

  -- Alpenbank AG
  INSERT INTO public.invoices
    (workspace_id, user_id, client_id, client_name, invoice_number,
     issue_date, due_date, period_from, period_to, subtotal, notes, status, lines, sent_at, paid_at)
  VALUES
  ( ws_id, admin_id, cl_alpen, 'Alpenbank AG', 'INV-202503-001',
    '2025-03-03', '2025-04-02', '2025-02-03', '2025-02-28',
    36595.00,
    'Zahlungsziel 30 Tage netto. IBAN AT83 2011 1400 1234 5600.',
    'paid',
    '[{"description":"Regulatorisches Reporting MiFID II – Februar 2025","hours":220,"rate":155,"amount":34100},{"description":"Fachliche Projektleitung","hours":10,"rate":250,"amount":2500},{"description":"Reisekosten Pauschale","hours":0,"rate":0,"amount":-5}]'::jsonb,
    '2025-03-03', '2025-04-01'),

  ( ws_id, admin_id, cl_alpen, 'Alpenbank AG', 'INV-202507-001',
    '2025-07-07', '2025-08-06', '2025-06-02', '2025-06-30',
    42800.00,
    'Zahlungsziel 30 Tage netto. IBAN AT83 2011 1400 1234 5600.',
    'paid',
    '[{"description":"MiFID II Reporting – Abschlussphase Juni 2025","hours":160,"rate":155,"amount":24800},{"description":"Cloud-Migration Core Banking – Juni 2025","hours":110,"rate":160,"amount":17600},{"description":"Projektleitung Partner","hours":17,"rate":25,"amount":425}]'::jsonb,
    '2025-07-07', '2025-08-04'),

  ( ws_id, admin_id, cl_alpen, 'Alpenbank AG', 'INV-202510-001',
    '2025-10-06', '2025-11-05', '2025-09-01', '2025-09-30',
    40320.00,
    'Zahlungsziel 30 Tage netto. IBAN AT83 2011 1400 1234 5600.',
    'sent',
    '[{"description":"Cloud-Migration Core Banking – September 2025","hours":252,"rate":160,"amount":40320}]'::jsonb,
    '2025-10-06', NULL),

  ( ws_id, admin_id, cl_alpen, 'Alpenbank AG', 'INV-202601-001',
    '2026-01-05', '2026-02-04', '2025-12-01', '2025-12-31',
    38560.00,
    'Zahlungsziel 30 Tage netto. IBAN AT83 2011 1400 1234 5600.',
    'sent',
    '[{"description":"Cloud-Migration Core Banking – Dezember 2025","hours":241,"rate":160,"amount":38560}]'::jsonb,
    '2026-01-05', NULL),

  ( ws_id, admin_id, cl_alpen, 'Alpenbank AG', 'INV-202603-001',
    '2026-03-02', '2026-04-01', '2026-02-02', '2026-02-28',
    33280.00,
    'Zahlungsziel 30 Tage netto. IBAN AT83 2011 1400 1234 5600.',
    'sent',
    '[{"description":"Cloud-Migration Core Banking – Februar 2026","hours":208,"rate":160,"amount":33280}]'::jsonb,
    '2026-03-02', NULL);

  -- Danubia Logistics
  INSERT INTO public.invoices
    (workspace_id, user_id, client_id, client_name, invoice_number,
     issue_date, due_date, period_from, period_to, subtotal, notes, status, lines, sent_at, paid_at)
  VALUES
  ( ws_id, admin_id, cl_danubia, 'Danubia Logistics KG', 'INV-202504-001',
    '2025-04-07', '2025-05-07', '2025-03-03', '2025-03-31',
    17290.00,
    'Zahlungsziel 30 Tage netto. IBAN AT48 3200 0000 1234 5678.',
    'paid',
    '[{"description":"Supply Chain Management System – März 2025","hours":182,"rate":95,"amount":17290}]'::jsonb,
    '2025-04-07', '2025-05-05'),

  ( ws_id, admin_id, cl_danubia, 'Danubia Logistics KG', 'INV-202509-001',
    '2025-09-01', '2025-10-01', '2025-08-04', '2025-08-29',
    16245.00,
    'Zahlungsziel 30 Tage netto. IBAN AT48 3200 0000 1234 5678.',
    'paid',
    '[{"description":"Supply Chain Management System – August 2025","hours":171,"rate":95,"amount":16245}]'::jsonb,
    '2025-09-01', '2025-09-29'),

  ( ws_id, admin_id, cl_danubia, 'Danubia Logistics KG', 'INV-202512-001',
    '2025-12-01', '2025-12-31', '2025-11-03', '2025-11-28',
    15390.00,
    'Zahlungsziel 30 Tage netto. IBAN AT48 3200 0000 1234 5678.',
    'sent',
    '[{"description":"Supply Chain Management System – November 2025","hours":162,"rate":95,"amount":15390}]'::jsonb,
    '2025-12-01', NULL);

  -- Steiner & Partner (finished project)
  INSERT INTO public.invoices
    (workspace_id, user_id, client_id, client_name, invoice_number,
     issue_date, due_date, period_from, period_to, subtotal, notes, status, lines, sent_at, paid_at)
  VALUES
  ( ws_id, admin_id, cl_steiner, 'Steiner & Partner Rechtsanwälte', 'INV-202506-001',
    '2025-06-02', '2025-07-02', '2025-05-05', '2025-05-30',
    14110.00,
    'Zahlungsziel 30 Tage netto.',
    'paid',
    '[{"description":"Digitale Kanzleiverwaltung – Mai 2025","hours":166,"rate":85,"amount":14110}]'::jsonb,
    '2025-06-02', '2025-06-30'),

  ( ws_id, admin_id, cl_steiner, 'Steiner & Partner Rechtsanwälte', 'INV-202509-002',
    '2025-09-29', '2025-10-29', '2025-09-01', '2025-09-26',
    11900.00,
    'Zahlungsziel 30 Tage netto. Abschlusszahlung Projekt.',
    'paid',
    '[{"description":"Digitale Kanzleiverwaltung – Projektabschluss September 2025","hours":140,"rate":85,"amount":11900}]'::jsonb,
    '2025-09-29', '2025-10-27');

  -- Wiener Wohnbau
  INSERT INTO public.invoices
    (workspace_id, user_id, client_id, client_name, invoice_number,
     issue_date, due_date, period_from, period_to, subtotal, notes, status, lines, sent_at, paid_at)
  VALUES
  ( ws_id, admin_id, cl_wohnbau, 'Wiener Wohnbau GmbH', 'INV-202507-002',
    '2025-07-07', '2025-08-06', '2025-06-02', '2025-06-30',
    13000.00,
    'Zahlungsziel 30 Tage netto.',
    'paid',
    '[{"description":"Digitalisierung Mietverwaltung – Juni 2025","hours":104,"rate":125,"amount":13000}]'::jsonb,
    '2025-07-07', '2025-08-04'),

  ( ws_id, admin_id, cl_wohnbau, 'Wiener Wohnbau GmbH', 'INV-202511-002',
    '2025-11-03', '2025-12-03', '2025-10-01', '2025-10-31',
    12375.00,
    'Zahlungsziel 30 Tage netto. Abschlusszahlung Projekt.',
    'paid',
    '[{"description":"Digitalisierung Mietverwaltung – Oktober 2025 (Projektabschluss)","hours":99,"rate":125,"amount":12375}]'::jsonb,
    '2025-11-03', '2025-12-01');

  RAISE NOTICE '✓ Seed complete — ws: %, users: % total (% members + 1 admin)',
    ws_id, array_length(all_users,1), m_count;

END $$;
