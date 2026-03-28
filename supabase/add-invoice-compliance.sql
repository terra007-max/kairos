-- ══════════════════════════════════════════════════════════════════════════════
-- Kairos — EN 16931 + ebInterface 6.1 compliance schema additions
-- Run once in Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Workspace: legal / billing identity ────────────────────────────────
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS legal_name      text,          -- legal company name (overrides display name)
  ADD COLUMN IF NOT EXISTS address_street  text,
  ADD COLUMN IF NOT EXISTS address_city    text,
  ADD COLUMN IF NOT EXISTS address_zip     text,
  ADD COLUMN IF NOT EXISTS address_country text DEFAULT 'AT',
  ADD COLUMN IF NOT EXISTS vat_id          text,          -- UID-Nummer, e.g. ATU12345678
  ADD COLUMN IF NOT EXISTS company_reg     text,          -- Firmenbuchnummer (optional)
  ADD COLUMN IF NOT EXISTS iban            text,
  ADD COLUMN IF NOT EXISTS bic             text;

-- ── 2. Clients: logo, billing address + VAT ID ───────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS logo_url        text,
  ADD COLUMN IF NOT EXISTS address_street  text,
  ADD COLUMN IF NOT EXISTS address_city    text,
  ADD COLUMN IF NOT EXISTS address_zip     text,
  ADD COLUMN IF NOT EXISTS address_country text DEFAULT 'AT',
  ADD COLUMN IF NOT EXISTS vat_id          text;          -- buyer UID-Nummer

-- ── 3. Invoices: VAT, totals, compliance snapshot, ebInterface fields ─────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS currency        text DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS vat_rate        numeric(5,2)  DEFAULT 20,   -- e.g. 20, 10, 0
  ADD COLUMN IF NOT EXISTS vat_amount      numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total           numeric(12,2) DEFAULT 0,    -- subtotal + vat
  ADD COLUMN IF NOT EXISTS seller_snapshot jsonb,  -- snapshot of workspace legal info at invoice time
  ADD COLUMN IF NOT EXISTS buyer_snapshot  jsonb,  -- snapshot of client legal info at invoice time
  ADD COLUMN IF NOT EXISTS payment_iban    text,
  ADD COLUMN IF NOT EXISTS payment_bic     text,
  ADD COLUMN IF NOT EXISTS order_reference text;   -- ebInterface: Bestellreferenz

-- Backfill total for existing invoices (subtotal = total, no VAT previously)
UPDATE public.invoices SET total = subtotal, vat_amount = 0 WHERE total IS NULL OR total = 0;

-- ── 4. Lines JSONB gets vat_rate + vat_amount per line (application-side) ─
-- No migration needed — lines is jsonb; new invoices will include the fields.
-- Old invoices remain readable (vat_rate defaults to 0 when not present).

DO $$ BEGIN RAISE NOTICE 'EN 16931 / ebInterface 6.1 compliance columns added.'; END $$;
