-- ============================================================
-- reset_demo.sql — Restore Riya Sharma's demo data to spec.
-- Idempotent and safe to re-run before every demo.
-- Demo anchor date: 2026-06-11 (today).
--
-- Fixes pollution from repeated live test redemptions:
--   - Regalia ledger had duplicate redeem/transfer rows
--   - current_points had drifted to 6,500 (spec: 46,500)
--
-- Samyak's data is clean and left untouched.
-- ============================================================

BEGIN;

-- Riya + her two card-row UUIDs (fixed in seed 0005)
-- user:     00000000-0000-0000-0000-000000000002
-- Regalia:  00000000-0000-0000-0002-000000000001
-- Millennia:00000000-0000-0000-0002-000000000002

-- ------------------------------------------------------------
-- 1. Wipe all of Riya's mutable demo state
-- ------------------------------------------------------------
DELETE FROM points_ledger
 WHERE user_card_id IN (
   '00000000-0000-0000-0002-000000000001',
   '00000000-0000-0000-0002-000000000002'
 );

DELETE FROM redemption_history
 WHERE user_id = '00000000-0000-0000-0000-000000000002';

DELETE FROM recommendation_events
 WHERE user_id = '00000000-0000-0000-0000-000000000002';

-- ------------------------------------------------------------
-- 2. Restore user_cards to spec (points + expiry, absolute dates)
-- ------------------------------------------------------------
UPDATE user_cards SET
    current_points    = 46500,
    next_expiry_points = 8000,
    next_expiry_date  = DATE '2026-06-13'   -- expiring in 2 days (demo urgency)
 WHERE id = '00000000-0000-0000-0002-000000000001';

UPDATE user_cards SET
    current_points    = 3200,
    next_expiry_points = 3200,
    next_expiry_date  = DATE '2026-06-11'   -- TODAY — Zomato credits at risk
 WHERE id = '00000000-0000-0000-0002-000000000002';

-- ------------------------------------------------------------
-- 3. Re-seed Regalia Gold ledger (clean, balance ends at 46,500)
--    Opening carry-forward keeps balances internally consistent.
-- ------------------------------------------------------------
INSERT INTO points_ledger (user_card_id, transaction_type, points_delta, balance_after, description, expiry_date)
VALUES
('00000000-0000-0000-0002-000000000001', 'earn', 38800, 38800, 'Opening balance (carried forward)', DATE '2026-09-30'),
('00000000-0000-0000-0002-000000000001', 'earn',  1200, 40000, 'Spend reward — dining Good Food Trail', DATE '2026-09-09'),
('00000000-0000-0000-0002-000000000001', 'earn',  2500, 42500, 'Spend reward — hotel stay', DATE '2026-08-10'),
('00000000-0000-0000-0002-000000000001', 'earn',  4000, 46500, 'Spend reward — travel booking', DATE '2026-06-13');

-- ------------------------------------------------------------
-- 4. Re-seed Millennia ledger (Zomato credits, expiring today)
-- ------------------------------------------------------------
INSERT INTO points_ledger (user_card_id, transaction_type, points_delta, balance_after, description, expiry_date)
VALUES
('00000000-0000-0000-0002-000000000002', 'earn', 3200, 3200, 'CashPoints — online food delivery (Zomato)', DATE '2026-06-11');

-- ------------------------------------------------------------
-- 5. Reset Riya's preferences to seed baseline
--    (travel_weight 0.350 — gets bumped to 0.550 live during demo)
-- ------------------------------------------------------------
UPDATE preferences SET
    destination_type           = 'beach',
    trip_length                = 'short',
    region_preference          = 'south_india',
    accommodation_tier         = '4star',
    flight_preference          = 'direct',
    departure_preference       = 'morning',
    travel_weight              = 0.350,
    dining_weight              = 0.300,
    shopping_weight            = 0.150,
    cashback_weight            = 0.100,
    experiences_weight         = 0.100,
    value_sensitivity_threshold = 0.4000,
    total_redemptions          = 2,
    total_dismissals           = 5
 WHERE user_id = '00000000-0000-0000-0000-000000000002';

-- ------------------------------------------------------------
-- 6. Re-seed Riya's historical recommendation events
-- ------------------------------------------------------------
INSERT INTO recommendation_events (user_id, session_id, recommendation_rank, option_type, option_label, score_financial, score_lifestyle, score_redemption_prob, score_expiry_risk, score_flexibility, score_total, weight_financial, weight_lifestyle, weight_redemption_prob, weight_expiry_risk, weight_flexibility, user_action, source_urls)
VALUES
('00000000-0000-0000-0000-000000000002', 'seed_session_001', 1, 'flight', 'IndiGo BLR–GOI round trip via SmartBuy', 78.0, 82.0, 90.0, 45.0, 70.0, 78.5, 0.35, 0.25, 0.20, 0.10, 0.10, 'confirmed', '[{"label": "Regalia Gold earn rate", "url": "https://www.hdfcbank.com/personal/pay/cards/credit-cards/regalia-gold-credit-card"}, {"label": "SmartBuy flights", "url": "https://smartbuy.hdfcbank.com"}]'),
('00000000-0000-0000-0000-000000000002', 'seed_session_001', 2, 'cashback', 'Statement credit — ₹500', 65.0, 30.0, 95.0, 40.0, 85.0, 61.5, 0.35, 0.25, 0.20, 0.10, 0.10, 'dismissed', NULL),
('00000000-0000-0000-0000-000000000002', 'seed_session_002', 1, 'hotel', 'Marriott Goa — 2 nights via Bonvoy transfer', 80.0, 88.0, 75.0, 60.0, 55.0, 77.0, 0.35, 0.25, 0.20, 0.10, 0.10, 'confirmed', '[{"label": "Marriott transfer ratio", "url": "https://www.hdfcbank.com/personal/tools-and-calculators/reward-points"}]');

COMMIT;
