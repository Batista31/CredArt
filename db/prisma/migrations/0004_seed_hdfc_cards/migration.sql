-- ============================================================
-- Migration 0004 — Seed: HDFC Card Catalogue
-- Seeds 3 HDFC cards: Infinia, Regalia Gold, Millennia
-- Benefits sourced from public HDFC product pages.
-- Transfer partners with published ratios.
-- This is the generic catalogue — not user-specific.
-- ============================================================


-- ------------------------------------------------------------
-- CARDS
-- ------------------------------------------------------------

INSERT INTO cards (id, bank_name, card_name, card_tier, network, annual_fee_inr, base_earn_rate, currency_name, card_page_url, is_active)
VALUES
(
    'hdfc_infinia',
    'HDFC Bank',
    'Infinia',
    'super_premium',
    'Visa',
    12500,
    5.00,
    'Reward Points',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/infinia-credit-card',
    TRUE
),
(
    'hdfc_regalia_gold',
    'HDFC Bank',
    'Regalia Gold',
    'premium',
    'Visa',
    2500,
    4.00,
    'Reward Points',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/regalia-gold-credit-card',
    TRUE
),
(
    'hdfc_millennia',
    'HDFC Bank',
    'Millennia',
    'standard',
    'Visa',
    1000,
    2.50,
    'CashPoints',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/millennia-credit-card',
    TRUE
);


-- ------------------------------------------------------------
-- BENEFITS — HDFC Infinia
-- ------------------------------------------------------------

INSERT INTO benefits (card_id, category, sort_order, benefit_name, description, benefit_type, source_url, verified, content_hash, effective_date)
VALUES
(
    'hdfc_infinia', 'REWARDS', 1,
    'Reward earn rate',
    '5 Reward Points on every ₹150 spent — approximately 3.3% back at SmartBuy redemption value.',
    'earn',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/infinia-credit-card',
    TRUE,
    encode(sha256('5 Reward Points on every ₹150 spent — approximately 3.3% back at SmartBuy redemption value.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_infinia', 'REWARDS', 2,
    'SmartBuy redemption',
    '1 Reward Point = ₹1 toward flights and hotels booked on HDFC SmartBuy portal.',
    'earn',
    'https://www.hdfcbank.com/personal/tools-and-calculators/reward-points/infinia',
    TRUE,
    encode(sha256('1 Reward Point = ₹1 toward flights and hotels booked on HDFC SmartBuy portal.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_infinia', 'REWARDS', 3,
    'Airmiles transfer',
    'Transfer Reward Points to airline and hotel loyalty programmes at up to 1:1 ratio with select partners.',
    'transfer',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/infinia-credit-card',
    TRUE,
    encode(sha256('Transfer Reward Points to airline and hotel loyalty programmes at up to 1:1 ratio with select partners.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_infinia', 'TRAVEL & LIFESTYLE', 1,
    'Airport lounge access',
    'Unlimited complimentary domestic and international lounge visits via Priority Pass. Guest visits included.',
    'lifestyle',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/infinia-credit-card',
    TRUE,
    encode(sha256('Unlimited complimentary domestic and international lounge visits via Priority Pass. Guest visits included.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_infinia', 'TRAVEL & LIFESTYLE', 2,
    'Complimentary golf',
    'Unlimited complimentary golf games at select courses across India and abroad.',
    'lifestyle',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/infinia-credit-card',
    TRUE,
    encode(sha256('Unlimited complimentary golf games at select courses across India and abroad.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_infinia', 'TRAVEL & LIFESTYLE', 3,
    'Club Marriott membership',
    'Complimentary first-year Club Marriott membership with stay and dining discounts at Marriott properties.',
    'lifestyle',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/infinia-credit-card',
    TRUE,
    encode(sha256('Complimentary first-year Club Marriott membership with stay and dining discounts at Marriott properties.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_infinia', 'FEES & FINE PRINT', 1,
    'Annual fee waiver',
    'Annual fee of ₹12,500 + GST reversed on annual spends of ₹10,00,000 or more.',
    'fee',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/infinia-credit-card',
    TRUE,
    encode(sha256('Annual fee of ₹12,500 + GST reversed on annual spends of ₹10,00,000 or more.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_infinia', 'FEES & FINE PRINT', 2,
    'Foreign currency markup',
    '2% foreign currency markup applies on all international transactions.',
    'caveat',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/infinia-credit-card',
    TRUE,
    encode(sha256('2% foreign currency markup applies on all international transactions.'), 'hex'),
    '2024-04-01'
);


-- ------------------------------------------------------------
-- BENEFITS — HDFC Regalia Gold
-- ------------------------------------------------------------

INSERT INTO benefits (card_id, category, sort_order, benefit_name, description, benefit_type, source_url, verified, content_hash, effective_date)
VALUES
(
    'hdfc_regalia_gold', 'REWARDS', 1,
    'Reward earn rate',
    '4 Reward Points on every ₹150 spent — approximately 2.7% back at SmartBuy value.',
    'earn',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/regalia-gold-credit-card',
    TRUE,
    encode(sha256('4 Reward Points on every ₹150 spent — approximately 2.7% back at SmartBuy value.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_regalia_gold', 'REWARDS', 2,
    'SmartBuy redemption',
    '1 Reward Point = ₹0.50 toward flights and hotels on HDFC SmartBuy portal.',
    'earn',
    'https://www.hdfcbank.com/personal/tools-and-calculators/reward-points/regalia-gold',
    TRUE,
    encode(sha256('1 Reward Point = ₹0.50 toward flights and hotels on HDFC SmartBuy portal.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_regalia_gold', 'REWARDS', 3,
    'Milestone bonus',
    '2,500 bonus Reward Points on reaching ₹1,50,000 spend in a quarter.',
    'earn',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/regalia-gold-credit-card',
    TRUE,
    encode(sha256('2,500 bonus Reward Points on reaching ₹1,50,000 spend in a quarter.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_regalia_gold', 'TRAVEL & LIFESTYLE', 1,
    'Airport lounge access',
    '6 complimentary domestic lounge visits per quarter via Dreamfolks. International via Priority Pass (paid add-on).',
    'lifestyle',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/regalia-gold-credit-card',
    TRUE,
    encode(sha256('6 complimentary domestic lounge visits per quarter via Dreamfolks. International via Priority Pass (paid add-on).'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_regalia_gold', 'TRAVEL & LIFESTYLE', 2,
    'Dining benefits',
    'Up to 15% off at select partner restaurants via Good Food Trail programme.',
    'lifestyle',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/regalia-gold-credit-card',
    TRUE,
    encode(sha256('Up to 15% off at select partner restaurants via Good Food Trail programme.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_regalia_gold', 'FEES & FINE PRINT', 1,
    'Annual fee waiver',
    'Annual fee of ₹2,500 + GST reversed on annual spends of ₹3,00,000 or more.',
    'fee',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/regalia-gold-credit-card',
    TRUE,
    encode(sha256('Annual fee of ₹2,500 + GST reversed on annual spends of ₹3,00,000 or more.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_regalia_gold', 'FEES & FINE PRINT', 2,
    'Foreign currency markup',
    '2% foreign currency markup applies on all international transactions.',
    'caveat',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/regalia-gold-credit-card',
    TRUE,
    encode(sha256('2% foreign currency markup applies on all international transactions.'), 'hex'),
    '2024-04-01'
);


-- ------------------------------------------------------------
-- BENEFITS — HDFC Millennia
-- ------------------------------------------------------------

INSERT INTO benefits (card_id, category, sort_order, benefit_name, description, benefit_type, source_url, verified, content_hash, effective_date)
VALUES
(
    'hdfc_millennia', 'REWARDS', 1,
    'CashPoints earn rate',
    '5% CashPoints on Amazon, Flipkart, Myntra, and select SmartBuy merchants. 1% on all other spends.',
    'earn',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/millennia-credit-card',
    TRUE,
    encode(sha256('5% CashPoints on Amazon, Flipkart, Myntra, and select SmartBuy merchants. 1% on all other spends.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_millennia', 'REWARDS', 2,
    'Quarterly cashback milestone',
    '₹1,000 cashback voucher on spending ₹1,00,000 in a calendar quarter.',
    'earn',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/millennia-credit-card',
    TRUE,
    encode(sha256('₹1,000 cashback voucher on spending ₹1,00,000 in a calendar quarter.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_millennia', 'TRAVEL & LIFESTYLE', 1,
    'Airport lounge access',
    '2 complimentary domestic lounge visits per quarter via Dreamfolks.',
    'lifestyle',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/millennia-credit-card',
    TRUE,
    encode(sha256('2 complimentary domestic lounge visits per quarter via Dreamfolks.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_millennia', 'FEES & FINE PRINT', 1,
    'Annual fee waiver',
    'Annual fee of ₹1,000 + GST reversed on annual spends of ₹1,00,000 or more.',
    'fee',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/millennia-credit-card',
    TRUE,
    encode(sha256('Annual fee of ₹1,000 + GST reversed on annual spends of ₹1,00,000 or more.'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_millennia', 'FEES & FINE PRINT', 2,
    'CashPoints cap',
    'Maximum 1,000 CashPoints per statement cycle on partner merchants. No cap on other spends.',
    'caveat',
    'https://www.hdfcbank.com/personal/pay/cards/credit-cards/millennia-credit-card',
    TRUE,
    encode(sha256('Maximum 1,000 CashPoints per statement cycle on partner merchants. No cap on other spends.'), 'hex'),
    '2024-04-01'
);


-- ------------------------------------------------------------
-- TRANSFER PARTNERS — HDFC Infinia
-- Ratios sourced from HDFC SmartBuy transfer partner page.
-- ------------------------------------------------------------

INSERT INTO transfer_partners (card_id, partner_name, partner_programme, partner_type, source_points, destination_points, minimum_transfer, processing_days_min, processing_days_max, reversible, effective_value_inr, source_url, content_hash, effective_date)
VALUES
(
    'hdfc_infinia',
    'KrisFlyer',
    'Singapore Airlines KrisFlyer',
    'airline',
    2, 1,
    1000, 3, 5, FALSE,
    0.5000,
    'https://www.hdfcbank.com/personal/tools-and-calculators/reward-points',
    encode(sha256('KrisFlyer 2:1 hdfc_infinia'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_infinia',
    'Air India Flying Returns',
    'Air India Flying Returns',
    'airline',
    1, 1,
    1000, 2, 4, FALSE,
    0.4000,
    'https://www.hdfcbank.com/personal/tools-and-calculators/reward-points',
    encode(sha256('AirIndia 1:1 hdfc_infinia'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_infinia',
    'Marriott Bonvoy',
    'Marriott Bonvoy',
    'hotel',
    2, 1,
    2000, 3, 5, FALSE,
    0.3500,
    'https://www.hdfcbank.com/personal/tools-and-calculators/reward-points',
    encode(sha256('Marriott 2:1 hdfc_infinia'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_infinia',
    'InterMiles',
    'InterMiles',
    'airline',
    1, 1,
    1000, 1, 3, FALSE,
    0.3500,
    'https://www.hdfcbank.com/personal/tools-and-calculators/reward-points',
    encode(sha256('InterMiles 1:1 hdfc_infinia'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_infinia',
    'Club Vistara',
    'Air Vistara Club Vistara',
    'airline',
    1, 1,
    1000, 2, 4, FALSE,
    0.4500,
    'https://www.hdfcbank.com/personal/tools-and-calculators/reward-points',
    encode(sha256('ClubVistara 1:1 hdfc_infinia'), 'hex'),
    '2024-04-01'
);

-- Transfer partners — HDFC Regalia Gold (subset of Infinia partners)

INSERT INTO transfer_partners (card_id, partner_name, partner_programme, partner_type, source_points, destination_points, minimum_transfer, processing_days_min, processing_days_max, reversible, effective_value_inr, source_url, content_hash, effective_date)
VALUES
(
    'hdfc_regalia_gold',
    'KrisFlyer',
    'Singapore Airlines KrisFlyer',
    'airline',
    2, 1,
    1000, 3, 5, FALSE,
    0.2500,
    'https://www.hdfcbank.com/personal/tools-and-calculators/reward-points',
    encode(sha256('KrisFlyer 2:1 hdfc_regalia_gold'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_regalia_gold',
    'Air India Flying Returns',
    'Air India Flying Returns',
    'airline',
    1, 1,
    1000, 2, 4, FALSE,
    0.2000,
    'https://www.hdfcbank.com/personal/tools-and-calculators/reward-points',
    encode(sha256('AirIndia 1:1 hdfc_regalia_gold'), 'hex'),
    '2024-04-01'
),
(
    'hdfc_regalia_gold',
    'InterMiles',
    'InterMiles',
    'airline',
    1, 1,
    1000, 1, 3, FALSE,
    0.1800,
    'https://www.hdfcbank.com/personal/tools-and-calculators/reward-points',
    encode(sha256('InterMiles 1:1 hdfc_regalia_gold'), 'hex'),
    '2024-04-01'
);


-- ------------------------------------------------------------
-- TNC VERSIONS — initial sentinel baseline
-- ------------------------------------------------------------

INSERT INTO tnc_versions (card_id, pdf_url, pdf_hash, effective_date, ingestion_status, is_current)
VALUES
(
    'hdfc_infinia',
    'https://www.hdfcbank.com/content/dam/hdfcbank/downloads/personal/pay/credit-card/Infinia-MITC.pdf',
    'placeholder_hash_infinia_v1',
    '2024-04-01',
    'complete',
    TRUE
),
(
    'hdfc_regalia_gold',
    'https://www.hdfcbank.com/content/dam/hdfcbank/downloads/personal/pay/credit-card/Regalia-Gold-MITC.pdf',
    'placeholder_hash_regalia_gold_v1',
    '2024-04-01',
    'complete',
    TRUE
),
(
    'hdfc_millennia',
    'https://www.hdfcbank.com/content/dam/hdfcbank/downloads/personal/pay/credit-card/Millennia-MITC.pdf',
    'placeholder_hash_millennia_v1',
    '2024-04-01',
    'complete',
    TRUE
);