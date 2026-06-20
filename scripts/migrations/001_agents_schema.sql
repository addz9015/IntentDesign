-- ============================================================================
-- Migration 001 — Agent architecture tables
-- Run this in the Supabase SQL Editor.
--
-- IMPORTANT: tenant_id is INTEGER and references app_tenants(tenant_id), matching
-- the live schema (app_products / app_customers / app_payments all use integer
-- tenant_id, e.g. 1). Do NOT use the string 'urbanwear' here.
-- ============================================================================

-- ── (Optional) product category, used by the Return Policy Agent ─────────────
-- The agent works without this (falls back to the global policy), but adding a
-- category enables category-specific return rules (e.g. innerwear = final sale).
ALTER TABLE app_products ADD COLUMN IF NOT EXISTS category TEXT;

-- ── Return policies (Return Policy Agent reads these) ────────────────────────
-- One row per category; a row with category = NULL is the tenant's default.
CREATE TABLE IF NOT EXISTS app_return_policies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES app_tenants(tenant_id),
  category TEXT,                       -- NULL = applies to all products (default)
  return_window_days INTEGER DEFAULT 7,
  refundable BOOLEAN DEFAULT true,
  exchange_allowed BOOLEAN DEFAULT true,
  non_returnable BOOLEAN DEFAULT false,
  conditions TEXT,                     -- human-readable extra conditions
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, category)
);

-- ── Reminders (Reminder Agent + scheduler) ───────────────────────────────────
-- Replaces the flat sessions/reminders.json file with a scalable, queryable store.
CREATE TABLE IF NOT EXISTS app_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reminder_id TEXT UNIQUE NOT NULL,
  tenant_id INTEGER NOT NULL REFERENCES app_tenants(tenant_id),
  customer_id TEXT REFERENCES app_customers(customer_id),
  user_phone TEXT NOT NULL,
  category TEXT DEFAULT 'custom',      -- custom | payment | service | subscription | followup | purchase
  task TEXT,
  remind_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'scheduled',     -- scheduled | delivered | failed | cancelled
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_app_reminders_due
  ON app_reminders (status, remind_at);

-- ── Returns / refund requests (audit trail for the Return Policy Agent) ──────
CREATE TABLE IF NOT EXISTS app_returns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id TEXT UNIQUE NOT NULL,
  tenant_id INTEGER NOT NULL REFERENCES app_tenants(tenant_id),
  customer_id TEXT REFERENCES app_customers(customer_id),
  payment_id TEXT,
  product_id TEXT,
  reason TEXT,
  status TEXT DEFAULT 'requested',     -- requested | approved | rejected | refunded
  eligible BOOLEAN,
  evaluated_reason TEXT,               -- e.g. within_window | window_expired | non_returnable
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Seed a default return policy for tenant 1 (UrbanWear) ─────────────────────
INSERT INTO app_return_policies (tenant_id, category, return_window_days, refundable, exchange_allowed, non_returnable, conditions)
VALUES (1, NULL, 7, true, true, false, 'Items must be unused with original tags. Refunds are processed within 5 working days after approval.')
ON CONFLICT (tenant_id, category) DO NOTHING;
