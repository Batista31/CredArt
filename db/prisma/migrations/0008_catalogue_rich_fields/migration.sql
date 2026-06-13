-- ============================================================
-- Migration 0008 — Rich catalogue fields
-- The mock HDFC catalogue (backend/catalogue/*.json) carries data
-- the original schema couldn't hold: joining fee, fine print,
-- redeemable benefits with a point cost + cash component, milestone
-- spend bonuses, and a transfer partner "best use case".
-- These columns let the loader (backend/seed_catalogue.py) store
-- the catalogue faithfully. All nullable — existing rows stay valid.
-- ============================================================

ALTER TABLE cards
    ADD COLUMN IF NOT EXISTS joining_fee_inr      INTEGER,
    ADD COLUMN IF NOT EXISTS points_expiry_months INTEGER,
    ADD COLUMN IF NOT EXISTS excluded_categories  TEXT[],
    ADD COLUMN IF NOT EXISTS blackout_dates       TEXT[];

ALTER TABLE benefits
    ADD COLUMN IF NOT EXISTS points_cost             INTEGER,
    ADD COLUMN IF NOT EXISTS cash_component_inr      INTEGER,
    ADD COLUMN IF NOT EXISTS milestone_threshold_inr INTEGER;

ALTER TABLE transfer_partners
    ADD COLUMN IF NOT EXISTS best_use_case TEXT;
