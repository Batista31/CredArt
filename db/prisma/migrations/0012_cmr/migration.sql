-- ============================================================
-- Migration 0012 — Customer Master Record (CMR)
--
-- A single unified profile of a user beyond cards + points, so CredArt
-- stops re-asking known facts and can make smarter, deliverable
-- recommendations.
--
-- Anti-hallucination note: every column added here feeds DETERMINISTIC
-- recommendation/scoring logic (Layer 1). None of it is ever handed to
-- the LLM — the LLM only ever sees the pre-validated candidate set.
--
-- All additions are optional with safe defaults, so existing rows are
-- unaffected. Idempotent: safe to re-run.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Extended user profile — add date_of_birth.
--    (phone, city, state, email already exist on users.)
-- ------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- ------------------------------------------------------------
-- 2. Extended preferences — richer taste profile beyond category weights.
-- ------------------------------------------------------------
ALTER TABLE preferences
    ADD COLUMN IF NOT EXISTS preferred_airlines     TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS preferred_hotel_chains TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS preferred_cuisines     TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS dietary_restrictions   TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS family_size            INTEGER NOT NULL DEFAULT 1;

-- ------------------------------------------------------------
-- 3. Saved delivery addresses — one or more per user, one default.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_addresses (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label           VARCHAR(32)     NOT NULL DEFAULT 'Home',   -- Home / Office
    address_line1   TEXT            NOT NULL,
    address_line2   TEXT,
    city            VARCHAR(64)     NOT NULL,
    state           VARCHAR(64),
    pincode         VARCHAR(10)     NOT NULL,
    is_default      BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id);

-- At most one default address per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_addresses_one_default
    ON user_addresses(user_id) WHERE is_default;

-- ------------------------------------------------------------
-- 4. Wishlist — benefits the user showed interest in but did not redeem.
--    Surfaced later with a small scoring boost. Matched by label (the
--    benefit_name that becomes a candidate's label at runtime).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cmr_wishlist (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label       TEXT            NOT NULL,
    card_id     VARCHAR(64)     REFERENCES cards(id),
    category    VARCHAR(64),
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, label)
);

CREATE INDEX IF NOT EXISTS idx_cmr_wishlist_user_id ON cmr_wishlist(user_id);

-- ------------------------------------------------------------
-- 5. Dismissed recommendations — benefits the user rejected.
--    Filtered out of future recommendations entirely.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cmr_dismissed (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label       TEXT            NOT NULL,
    card_id     VARCHAR(64)     REFERENCES cards(id),
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, label)
);

CREATE INDEX IF NOT EXISTS idx_cmr_dismissed_user_id ON cmr_dismissed(user_id);

-- ------------------------------------------------------------
-- updated_at trigger for user_addresses (reuses 0002's function).
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at_user_addresses ON user_addresses;
CREATE TRIGGER set_updated_at_user_addresses
    BEFORE UPDATE ON user_addresses
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- DEMO SEED — sample CMR data for the two demo users (idempotent).
-- Users + preferences rows already exist from migration 0005, so these
-- are UPDATEs / guarded INSERTs.
--
--   Samyak Rao  — 00000000-0000-0000-0000-000000000001
--   Riya Sharma — 00000000-0000-0000-0000-000000000002
-- ============================================================

-- Riya: city Mumbai, family_size 1, prefers IndiGo.
UPDATE users
   SET city = 'Mumbai', state = 'Maharashtra', date_of_birth = '1996-08-15'
 WHERE id = '00000000-0000-0000-0000-000000000002';

UPDATE preferences
   SET family_size = 1,
       preferred_airlines = ARRAY['IndiGo']::TEXT[]
 WHERE user_id = '00000000-0000-0000-0000-000000000002';

-- Samyak: city Bengaluru, family_size 2, prefers North Indian + Italian.
UPDATE users
   SET city = 'Bengaluru', state = 'Karnataka', date_of_birth = '1994-03-22'
 WHERE id = '00000000-0000-0000-0000-000000000001';

UPDATE preferences
   SET family_size = 2,
       preferred_cuisines = ARRAY['North Indian', 'Italian']::TEXT[]
 WHERE user_id = '00000000-0000-0000-0000-000000000001';

-- Default delivery addresses (fixed ids so re-runs are no-ops).
INSERT INTO user_addresses (id, user_id, label, address_line1, city, state, pincode, is_default)
VALUES
('00000000-0000-0000-0aff-000000000002', '00000000-0000-0000-0000-000000000002',
 'Home', '12 Marine Drive', 'Mumbai', 'Maharashtra', '400020', TRUE),
('00000000-0000-0000-0aff-000000000001', '00000000-0000-0000-0000-000000000001',
 'Home', '4 Residency Road', 'Bengaluru', 'Karnataka', '560025', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Wishlist examples (real catalogue benefit_names so the boost actually
-- engages when these candidates surface at runtime).
INSERT INTO cmr_wishlist (user_id, label, card_id, category)
VALUES
('00000000-0000-0000-0000-000000000002', 'Manali Weekend Stay', 'hdfc_regalia_gold', 'TRAVEL'),
('00000000-0000-0000-0000-000000000001', 'Goa Marriott Luxury Stay', 'hdfc_infinia', 'TRAVEL')
ON CONFLICT (user_id, label) DO NOTHING;

-- Dismissed example for Riya — she rejected the BookMyShow voucher, so it
-- should never appear in her recommendations again.
INSERT INTO cmr_dismissed (user_id, label, card_id)
VALUES
('00000000-0000-0000-0000-000000000002', 'BookMyShow Voucher', 'hdfc_regalia_gold')
ON CONFLICT (user_id, label) DO NOTHING;

COMMIT;
