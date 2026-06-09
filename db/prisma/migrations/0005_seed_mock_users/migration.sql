-- ============================================================
-- Migration 0005 — Seed: Mock Users
-- Two demo users for development and hackathon demo.
--
-- Samyak Rao   — power user, HDFC Infinia, 84,500 points
-- Riya Sharma  — demo user, Regalia Gold + Millennia
--                used in the Demo Story (Section 10 of proposal)
-- ============================================================


-- ------------------------------------------------------------
-- USERS
-- ------------------------------------------------------------

INSERT INTO users (id, name, email, phone, city, state, country)
VALUES
(
    '00000000-0000-0000-0000-000000000001',
    'Samyak Rao',
    'samyak@credart.dev',
    '+91-9876543210',
    'Bangalore',
    'Karnataka',
    'India'
),
(
    '00000000-0000-0000-0000-000000000002',
    'Riya Sharma',
    'riya@credart.dev',
    '+91-9876543211',
    'Bangalore',
    'Karnataka',
    'India'
);


-- ------------------------------------------------------------
-- USER CARDS
-- ------------------------------------------------------------

-- Samyak — HDFC Infinia (matches the existing app mockup)
INSERT INTO user_cards (id, user_id, card_id, card_number_masked, expiry_month, expiry_year, current_points, next_expiry_points, next_expiry_date, tier_level, annual_fee_paid, annual_fee_paid_date, is_primary, is_active, joined_at)
VALUES
(
    '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'hdfc_infinia',
    '•••• •••• •••• 4827',
    9, 29,
    84500,
    12400,
    CURRENT_DATE + INTERVAL '60 days',
    'super_premium',
    TRUE,
    CURRENT_DATE - INTERVAL '3 months',
    TRUE,
    TRUE,
    '2022-06-15'
);

-- Riya — HDFC Regalia Gold (primary, demo story card)
INSERT INTO user_cards (id, user_id, card_id, card_number_masked, expiry_month, expiry_year, current_points, next_expiry_points, next_expiry_date, tier_level, annual_fee_paid, annual_fee_paid_date, is_primary, is_active, joined_at)
VALUES
(
    '00000000-0000-0000-0002-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'hdfc_regalia_gold',
    '•••• •••• •••• 8842',
    4, 28,
    46500,
    8000,
    CURRENT_DATE + INTERVAL '7 days',     -- expiring soon for demo story
    'premium',
    FALSE,
    NULL,
    TRUE,
    TRUE,
    '2023-01-10'
);

-- Riya — HDFC Millennia (secondary)
INSERT INTO user_cards (id, user_id, card_id, card_number_masked, expiry_month, expiry_year, current_points, next_expiry_points, next_expiry_date, tier_level, annual_fee_paid, annual_fee_paid_date, is_primary, is_active, joined_at)
VALUES
(
    '00000000-0000-0000-0002-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'hdfc_millennia',
    '•••• •••• •••• 3391',
    11, 27,
    3200,
    3200,
    CURRENT_DATE + INTERVAL '5 days',     -- Zomato credits expiring this week (demo story)
    'standard',
    TRUE,
    CURRENT_DATE - INTERVAL '1 month',
    FALSE,
    TRUE,
    '2023-08-22'
);


-- ------------------------------------------------------------
-- POINTS LEDGER — Samyak (recent earn history)
-- ------------------------------------------------------------

INSERT INTO points_ledger (user_card_id, transaction_type, points_delta, balance_after, description, expiry_date)
VALUES
(
    '00000000-0000-0000-0001-000000000001',
    'earn', 2500, 84500,
    'Spend reward — online shopping',
    CURRENT_DATE + INTERVAL '60 days'
),
(
    '00000000-0000-0000-0001-000000000001',
    'earn', 5000, 82000,
    'Spend reward — flight booking SmartBuy',
    CURRENT_DATE + INTERVAL '90 days'
),
(
    '00000000-0000-0000-0001-000000000001',
    'earn', 1500, 77000,
    'Spend reward — dining',
    CURRENT_DATE + INTERVAL '120 days'
),
(
    '00000000-0000-0000-0001-000000000001',
    'adjust', -2500, 75500,
    'Expiry — points tranche from 18 months ago',
    NULL
),
(
    '00000000-0000-0000-0001-000000000001',
    'earn', 9000, 84500,
    'Milestone bonus — quarterly spend target reached',
    CURRENT_DATE + INTERVAL '60 days'
);


-- ------------------------------------------------------------
-- POINTS LEDGER — Riya Regalia Gold
-- ------------------------------------------------------------

INSERT INTO points_ledger (user_card_id, transaction_type, points_delta, balance_after, description, expiry_date)
VALUES
(
    '00000000-0000-0000-0002-000000000001',
    'earn', 4000, 46500,
    'Spend reward — travel booking',
    CURRENT_DATE + INTERVAL '7 days'      -- expiring soon
),
(
    '00000000-0000-0000-0002-000000000001',
    'earn', 2500, 42500,
    'Spend reward — hotel stay',
    CURRENT_DATE + INTERVAL '60 days'
),
(
    '00000000-0000-0000-0002-000000000001',
    'earn', 1200, 40000,
    'Spend reward — dining Good Food Trail',
    CURRENT_DATE + INTERVAL '90 days'
);


-- ------------------------------------------------------------
-- POINTS LEDGER — Riya Millennia (Zomato credits for demo story)
-- ------------------------------------------------------------

INSERT INTO points_ledger (user_card_id, transaction_type, points_delta, balance_after, description, expiry_date)
VALUES
(
    '00000000-0000-0000-0002-000000000002',
    'earn', 3200, 3200,
    'CashPoints — online food delivery (Zomato)',
    CURRENT_DATE + INTERVAL '5 days'      -- "at risk of losing ₹500 in Zomato credits this week"
);


-- ------------------------------------------------------------
-- PREFERENCES — Samyak (moderate travel, tech-forward)
-- ------------------------------------------------------------

INSERT INTO preferences (user_id, destination_type, trip_length, region_preference, accommodation_tier, flight_preference, departure_preference, travel_weight, dining_weight, shopping_weight, cashback_weight, experiences_weight, value_sensitivity_threshold, total_redemptions, total_dismissals)
VALUES
(
    '00000000-0000-0000-0000-000000000001',
    'city',
    'short',
    'pan_india',
    '4star',
    'direct',
    'morning',
    0.450,
    0.200,
    0.200,
    0.050,
    0.100,
    0.3500,
    4,
    2
);


-- ------------------------------------------------------------
-- PREFERENCES — Riya (matches demo story: moderate travel,
-- WFH context, food delivery credits expiring)
-- ------------------------------------------------------------

INSERT INTO preferences (user_id, destination_type, trip_length, region_preference, accommodation_tier, flight_preference, departure_preference, travel_weight, dining_weight, shopping_weight, cashback_weight, experiences_weight, value_sensitivity_threshold, total_redemptions, total_dismissals)
VALUES
(
    '00000000-0000-0000-0000-000000000002',
    'beach',
    'short',
    'south_india',
    '4star',
    'direct',
    'morning',
    0.350,   -- will be bumped to 0.550 when she says "2 months WFH, want to travel more"
    0.300,
    0.150,
    0.100,
    0.100,
    0.4000,
    2,
    5
);


-- ------------------------------------------------------------
-- RECOMMENDATION EVENTS — a few historical events for Riya
-- to seed the preference learning signal
-- ------------------------------------------------------------

INSERT INTO recommendation_events (user_id, session_id, recommendation_rank, option_type, option_label, score_financial, score_lifestyle, score_redemption_prob, score_expiry_risk, score_flexibility, score_total, weight_financial, weight_lifestyle, weight_redemption_prob, weight_expiry_risk, weight_flexibility, user_action, source_urls)
VALUES
(
    '00000000-0000-0000-0000-000000000002',
    'seed_session_001', 1,
    'flight', 'IndiGo BLR–GOI round trip via SmartBuy',
    78.0, 82.0, 90.0, 45.0, 70.0, 78.5,
    0.35, 0.25, 0.20, 0.10, 0.10,
    'confirmed',
    '[{"label": "Regalia Gold earn rate", "url": "https://www.hdfcbank.com/personal/pay/cards/credit-cards/regalia-gold-credit-card"}, {"label": "SmartBuy flights", "url": "https://smartbuy.hdfcbank.com"}]'
),
(
    '00000000-0000-0000-0000-000000000002',
    'seed_session_001', 2,
    'cashback', 'Statement credit — ₹500',
    65.0, 30.0, 95.0, 40.0, 85.0, 61.5,
    0.35, 0.25, 0.20, 0.10, 0.10,
    'dismissed',
    NULL
),
(
    '00000000-0000-0000-0000-000000000002',
    'seed_session_002', 1,
    'hotel', 'Marriott Goa — 2 nights via Bonvoy transfer',
    80.0, 88.0, 75.0, 60.0, 55.0, 77.0,
    0.35, 0.25, 0.20, 0.10, 0.10,
    'confirmed',
    '[{"label": "Marriott transfer ratio", "url": "https://www.hdfcbank.com/personal/tools-and-calculators/reward-points"}]'
);