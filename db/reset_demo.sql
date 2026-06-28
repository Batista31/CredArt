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
-- Relative dates so the demo urgency is always fresh, whenever this is run.
UPDATE user_cards SET
    current_points    = 46500,
    next_expiry_points = 8000,
    next_expiry_date  = CURRENT_DATE + INTERVAL '2 days',  -- expiring in 2 days
    demo_points       = 100000                             -- replayable demo bucket
 WHERE id = '00000000-0000-0000-0002-000000000001';

UPDATE user_cards SET
    current_points    = 3200,
    next_expiry_points = 3200,
    next_expiry_date  = CURRENT_DATE,                      -- TODAY — Zomato credits at risk
    demo_points       = 100000                             -- replayable demo bucket
 WHERE id = '00000000-0000-0000-0002-000000000002';

-- ------------------------------------------------------------
-- 3. Re-seed Regalia Gold ledger (clean, balance ends at 46,500)
--    Opening carry-forward keeps balances internally consistent.
-- ------------------------------------------------------------
INSERT INTO points_ledger (user_card_id, transaction_type, points_delta, balance_after, description, expiry_date)
VALUES
('00000000-0000-0000-0002-000000000001', 'earn', 38800, 38800, 'Opening balance (carried forward)', CURRENT_DATE + INTERVAL '110 days'),
('00000000-0000-0000-0002-000000000001', 'earn',  1200, 40000, 'Spend reward — dining Good Food Trail', CURRENT_DATE + INTERVAL '90 days'),
('00000000-0000-0000-0002-000000000001', 'earn',  2500, 42500, 'Spend reward — hotel stay', CURRENT_DATE + INTERVAL '60 days'),
('00000000-0000-0000-0002-000000000001', 'earn',  4000, 46500, 'Spend reward — travel booking', CURRENT_DATE + INTERVAL '2 days');

-- ------------------------------------------------------------
-- 4. Re-seed Millennia ledger (Zomato credits, expiring today)
-- ------------------------------------------------------------
INSERT INTO points_ledger (user_card_id, transaction_type, points_delta, balance_after, description, expiry_date)
VALUES
('00000000-0000-0000-0002-000000000002', 'earn', 3200, 3200, 'CashPoints — online food delivery (Zomato)', CURRENT_DATE);

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

-- ------------------------------------------------------------
-- 7. Reset Riya's CMR (Customer Master Record) to demo spec
--    city Mumbai · family_size 1 · prefers IndiGo · Home address ·
--    wishlist "Manali Weekend Stay" · dismissed "BookMyShow Voucher"
-- ------------------------------------------------------------
UPDATE users
   SET city = 'Mumbai', state = 'Maharashtra', date_of_birth = '1996-08-15'
 WHERE id = '00000000-0000-0000-0000-000000000002';

UPDATE preferences
   SET family_size            = 1,
       preferred_airlines     = ARRAY['IndiGo']::TEXT[],
       preferred_hotel_chains = '{}',
       preferred_cuisines     = '{}',
       dietary_restrictions   = '{}'
 WHERE user_id = '00000000-0000-0000-0000-000000000002';

DELETE FROM user_addresses WHERE user_id = '00000000-0000-0000-0000-000000000002';
INSERT INTO user_addresses (id, user_id, label, address_line1, city, state, pincode, is_default)
VALUES ('00000000-0000-0000-0aff-000000000002', '00000000-0000-0000-0000-000000000002',
        'Home', '12 Marine Drive', 'Mumbai', 'Maharashtra', '400020', TRUE);

DELETE FROM cmr_wishlist WHERE user_id = '00000000-0000-0000-0000-000000000002';
INSERT INTO cmr_wishlist (user_id, label, card_id, category)
VALUES ('00000000-0000-0000-0000-000000000002', 'Manali Weekend Stay', 'hdfc_regalia_gold', 'TRAVEL');

DELETE FROM cmr_dismissed WHERE user_id = '00000000-0000-0000-0000-000000000002';
INSERT INTO cmr_dismissed (user_id, label, card_id)
VALUES ('00000000-0000-0000-0000-000000000002', 'BookMyShow Voucher', 'hdfc_regalia_gold');

COMMIT;
