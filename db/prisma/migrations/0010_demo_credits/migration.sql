-- ============================================================
-- Migration 0010 — Demo credits (hackathon one-click redeem)
-- A separate balance bucket per user card so the "demo" redemption
-- path (mimicked booking) never touches the user's REAL current_points.
-- This keeps every demo replayable and the live ledger uncorrupted.
-- Live redemptions spend current_points; demo redemptions spend demo_points.
-- ============================================================

ALTER TABLE user_cards
    ADD COLUMN IF NOT EXISTS demo_points INT NOT NULL DEFAULT 100000;
