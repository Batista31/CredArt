-- ============================================================
-- seed_demo_portfolio.sql — Two-user demo portfolio + preferences.
-- Idempotent; safe to re-run.
--
-- Goal: BOTH users hold all 3 HDFC cards, so the only thing that
-- changes the recommendations is their PREFERENCE profile:
--   Riya Sharma  (…0002) — loves travel   -> travel_weight high
--   Samyak Rao   (…0001) — prefers dining  -> dining_weight high
--
-- Balances are intentionally distinct/realistic (not a pure A/B):
--   Riya  : Infinia 50k | Regalia 46.5k (8k exp) | Millennia 3.2k (exp today)
--   Samyak: Infinia 84.5k | Regalia 40k | Millennia 20k
--
-- Riya's expiry-urgency choreography lives in reset_demo.sql and is
-- left intact. Run this once to establish the portfolio; run
-- reset_demo.sql before each demo to reset Riya's mutable ledger.
--
-- user_card id convention: 00000000-0000-0000-000X-00000000000Y
--   X = user index (1 Samyak, 2 Riya), Y = card index.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. New card for RIYA (…0002): Infinia. (She already holds
--    Regalia …0002-…0001 and Millennia …0002-…0002.)
-- ------------------------------------------------------------
INSERT INTO user_cards
    (id, user_id, card_id, card_number_masked, expiry_month, expiry_year,
     current_points, next_expiry_points, next_expiry_date, tier_level,
     annual_fee_paid, is_primary, is_active, joined_at, demo_points)
VALUES
    ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000002',
     'hdfc_infinia', '•••• •••• •••• 5510', 9, 29,
     50000, 5000, CURRENT_DATE + INTERVAL '120 days', 'super_premium',
     TRUE, FALSE, TRUE, DATE '2023-04-18', 100000)
ON CONFLICT (id) DO UPDATE SET
    card_id            = EXCLUDED.card_id,
    current_points     = EXCLUDED.current_points,
    next_expiry_points = EXCLUDED.next_expiry_points,
    next_expiry_date   = EXCLUDED.next_expiry_date,
    tier_level         = EXCLUDED.tier_level,
    is_active          = TRUE,
    demo_points        = EXCLUDED.demo_points;

-- ------------------------------------------------------------
-- 2. New cards for SAMYAK (…0001): Regalia Gold + Millennia.
--    (He already holds Infinia …0001-…0001.)
-- ------------------------------------------------------------
INSERT INTO user_cards
    (id, user_id, card_id, card_number_masked, expiry_month, expiry_year,
     current_points, next_expiry_points, next_expiry_date, tier_level,
     annual_fee_paid, is_primary, is_active, joined_at, demo_points)
VALUES
    ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001',
     'hdfc_regalia_gold', '•••• •••• •••• 7203', 4, 28,
     40000, 4000, CURRENT_DATE + INTERVAL '90 days', 'premium',
     TRUE, FALSE, TRUE, DATE '2022-11-02', 100000),
    ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001',
     'hdfc_millennia', '•••• •••• •••• 6614', 11, 27,
     20000, 2000, CURRENT_DATE + INTERVAL '60 days', 'standard',
     TRUE, FALSE, TRUE, DATE '2023-02-09', 100000)
ON CONFLICT (id) DO UPDATE SET
    card_id            = EXCLUDED.card_id,
    current_points     = EXCLUDED.current_points,
    next_expiry_points = EXCLUDED.next_expiry_points,
    next_expiry_date   = EXCLUDED.next_expiry_date,
    tier_level         = EXCLUDED.tier_level,
    is_active          = TRUE,
    demo_points        = EXCLUDED.demo_points;

-- ------------------------------------------------------------
-- 3. RIYA — travel-leaning preference profile (weights sum to 1.0).
--    Counters reset too, so live redemptions during a demo (which bump
--    total_redemptions and drift the weights) wash out on re-seed.
-- ------------------------------------------------------------
UPDATE preferences SET
    travel_weight      = 0.500,
    dining_weight      = 0.180,
    shopping_weight    = 0.150,
    experiences_weight = 0.100,
    cashback_weight    = 0.070,
    total_redemptions  = 2,
    total_dismissals   = 5
 WHERE user_id = '00000000-0000-0000-0000-000000000002';

-- ------------------------------------------------------------
-- 4. SAMYAK — dining-leaning, low-travel preference profile.
--    Counters reset too (see note above).
-- ------------------------------------------------------------
UPDATE preferences SET
    travel_weight      = 0.100,
    dining_weight      = 0.500,
    shopping_weight    = 0.200,
    experiences_weight = 0.120,
    cashback_weight    = 0.080,
    total_redemptions  = 4,
    total_dismissals   = 2
 WHERE user_id = '00000000-0000-0000-0000-000000000001';

COMMIT;
