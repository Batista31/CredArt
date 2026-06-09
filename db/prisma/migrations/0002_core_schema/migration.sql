-- ============================================================
-- Migration 0002 — Core Schema
-- Creates all tables in dependency order.
-- Requires 0001 (extensions) to have run first.
-- ============================================================


-- ------------------------------------------------------------
-- SECTION 1 — GENERIC / CARD PRODUCT LEVEL
-- ------------------------------------------------------------

CREATE TABLE cards (
    id                  VARCHAR(64) PRIMARY KEY,
    bank_name           VARCHAR(64)     NOT NULL,
    card_name           VARCHAR(128)    NOT NULL,
    card_tier           VARCHAR(32)     NOT NULL,
    network             VARCHAR(16)     NOT NULL,
    annual_fee_inr      INTEGER         NOT NULL DEFAULT 0,
    base_earn_rate      DECIMAL(6,2)    NOT NULL,
    currency_name       VARCHAR(32)     NOT NULL,
    image_asset_url     TEXT,
    card_page_url       TEXT            NOT NULL,
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE benefits (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id             VARCHAR(64)     NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    category            VARCHAR(64)     NOT NULL,
    sort_order          INTEGER         NOT NULL DEFAULT 0,
    benefit_name        VARCHAR(256)    NOT NULL,
    description         TEXT            NOT NULL,
    benefit_type        VARCHAR(32)     NOT NULL,
    source_url          TEXT            NOT NULL,
    verified            BOOLEAN         NOT NULL DEFAULT TRUE,
    content_hash        VARCHAR(64)     NOT NULL,
    effective_date      DATE,
    tnc_updated_at      TIMESTAMPTZ,
    is_embedded         BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE transfer_partners (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id                 VARCHAR(64)     NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    partner_name            VARCHAR(128)    NOT NULL,
    partner_programme       VARCHAR(128),
    partner_type            VARCHAR(32)     NOT NULL,
    source_points           INTEGER         NOT NULL,
    destination_points      INTEGER         NOT NULL,
    minimum_transfer        INTEGER         NOT NULL DEFAULT 1000,
    processing_days_min     INTEGER         NOT NULL DEFAULT 3,
    processing_days_max     INTEGER         NOT NULL DEFAULT 5,
    reversible              BOOLEAN         NOT NULL DEFAULT FALSE,
    effective_value_inr     DECIMAL(8,4),
    source_url              TEXT            NOT NULL,
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    content_hash            VARCHAR(64)     NOT NULL,
    effective_date          DATE,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE tnc_versions (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id             VARCHAR(64)     NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    pdf_url             TEXT            NOT NULL,
    pdf_hash            VARCHAR(64)     NOT NULL,
    effective_date      DATE            NOT NULL,
    detected_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    ingestion_status    VARCHAR(32)     NOT NULL DEFAULT 'pending',
    ingested_at         TIMESTAMPTZ,
    is_current          BOOLEAN         NOT NULL DEFAULT FALSE
);


-- ------------------------------------------------------------
-- SECTION 2 — USER SPECIFIC
-- ------------------------------------------------------------

CREATE TABLE users (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(128)    NOT NULL,
    email               VARCHAR(256)    UNIQUE NOT NULL,
    phone               VARCHAR(16),
    city                VARCHAR(64),
    state               VARCHAR(64),
    country             VARCHAR(64)     NOT NULL DEFAULT 'India',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE user_cards (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id                 VARCHAR(64)     NOT NULL REFERENCES cards(id),
    card_number_masked      VARCHAR(20)     NOT NULL,
    expiry_month            SMALLINT        NOT NULL,
    expiry_year             SMALLINT        NOT NULL,
    current_points          INTEGER         NOT NULL DEFAULT 0,
    next_expiry_points      INTEGER,
    next_expiry_date        DATE,
    tier_level              VARCHAR(32)     NOT NULL DEFAULT 'standard',
    annual_fee_paid         BOOLEAN         NOT NULL DEFAULT FALSE,
    annual_fee_paid_date    DATE,
    is_primary              BOOLEAN         NOT NULL DEFAULT FALSE,
    is_active               BOOLEAN         NOT NULL DEFAULT TRUE,
    joined_at               DATE            NOT NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, card_id)
);

CREATE TABLE points_ledger (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_card_id        UUID            NOT NULL REFERENCES user_cards(id) ON DELETE CASCADE,
    transaction_type    VARCHAR(32)     NOT NULL,
    points_delta        INTEGER         NOT NULL,
    balance_after       INTEGER         NOT NULL,
    description         TEXT,
    reference_id        UUID,
    expiry_date         DATE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE preferences (
    id                              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                         UUID            NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    destination_type                VARCHAR(32),
    trip_length                     VARCHAR(16),
    region_preference               VARCHAR(32),
    accommodation_tier              VARCHAR(16),
    flight_preference               VARCHAR(16),
    departure_preference            VARCHAR(16),
    travel_weight                   DECIMAL(4,3)    NOT NULL DEFAULT 0.400,
    dining_weight                   DECIMAL(4,3)    NOT NULL DEFAULT 0.200,
    shopping_weight                 DECIMAL(4,3)    NOT NULL DEFAULT 0.200,
    cashback_weight                 DECIMAL(4,3)    NOT NULL DEFAULT 0.100,
    experiences_weight              DECIMAL(4,3)    NOT NULL DEFAULT 0.100,
    value_sensitivity_threshold     DECIMAL(6,4),
    total_redemptions               INTEGER         NOT NULL DEFAULT 0,
    total_dismissals                INTEGER         NOT NULL DEFAULT 0,
    updated_at                      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE redemption_history (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID            NOT NULL REFERENCES users(id),
    user_card_id            UUID            NOT NULL REFERENCES user_cards(id),
    transaction_id          VARCHAR(64)     UNIQUE NOT NULL,
    status                  VARCHAR(32)     NOT NULL,
    option_type             VARCHAR(32)     NOT NULL,
    option_label            TEXT            NOT NULL,
    points_used             INTEGER         NOT NULL DEFAULT 0,
    cash_used_inr           DECIMAL(10,2)   NOT NULL DEFAULT 0,
    value_inr               DECIMAL(10,2)   NOT NULL,
    partner_name            VARCHAR(128),
    transfer_partner_id     UUID            REFERENCES transfer_partners(id),
    confirmation_reference  TEXT,
    rollback_reason         TEXT,
    source_urls             JSONB,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ
);


-- ------------------------------------------------------------
-- SECTION 3 — SCORING & EVALUATION
-- ------------------------------------------------------------

CREATE TABLE recommendation_events (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID            NOT NULL REFERENCES users(id),
    session_id              VARCHAR(64)     NOT NULL,
    recommendation_rank     SMALLINT        NOT NULL,
    option_type             VARCHAR(32)     NOT NULL,
    option_label            TEXT            NOT NULL,
    score_financial         DECIMAL(5,2),
    score_lifestyle         DECIMAL(5,2),
    score_redemption_prob   DECIMAL(5,2),
    score_expiry_risk       DECIMAL(5,2),
    score_flexibility       DECIMAL(5,2),
    score_total             DECIMAL(5,2),
    weight_financial        DECIMAL(4,3),
    weight_lifestyle        DECIMAL(4,3),
    weight_redemption_prob  DECIMAL(4,3),
    weight_expiry_risk      DECIMAL(4,3),
    weight_flexibility      DECIMAL(4,3),
    user_action             VARCHAR(32),
    source_urls             JSONB,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- SECTION 4 — PGVECTOR EMBEDDINGS
-- embedding is vector(1536) — OpenAI text-embedding-3-small
-- ------------------------------------------------------------

CREATE TABLE benefit_embeddings (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    benefit_id      UUID            NOT NULL REFERENCES benefits(id) ON DELETE CASCADE,
    card_id         VARCHAR(64)     NOT NULL REFERENCES cards(id),
    category        VARCHAR(64)     NOT NULL,
    chunk_text      TEXT            NOT NULL,
    embedding       vector(1536),
    source_url      TEXT            NOT NULL,
    content_hash    VARCHAR(64)     NOT NULL,
    effective_date  DATE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- SECTION 5 — MCP SCRAPER AUDIT
-- ------------------------------------------------------------

CREATE TABLE scraper_runs (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id             VARCHAR(64)     NOT NULL REFERENCES cards(id),
    run_type            VARCHAR(32)     NOT NULL,
    status              VARCHAR(32)     NOT NULL,
    previous_hash       VARCHAR(64),
    new_hash            VARCHAR(64),
    pages_scraped       INTEGER         NOT NULL DEFAULT 0,
    benefits_upserted   INTEGER         NOT NULL DEFAULT 0,
    error_message       TEXT,
    triggered_by        VARCHAR(32)     NOT NULL DEFAULT 'schedule',
    started_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);


-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------

-- benefits
CREATE INDEX idx_benefits_card_id         ON benefits(card_id);
CREATE INDEX idx_benefits_card_category   ON benefits(card_id, category);
CREATE INDEX idx_benefits_type            ON benefits(benefit_type);

-- transfer_partners
CREATE INDEX idx_transfer_card_id         ON transfer_partners(card_id);
CREATE INDEX idx_transfer_partner_type    ON transfer_partners(partner_type);

-- user_cards
CREATE INDEX idx_user_cards_user_id       ON user_cards(user_id);
CREATE INDEX idx_user_cards_card_id       ON user_cards(card_id);

-- points_ledger
CREATE INDEX idx_ledger_user_card_id      ON points_ledger(user_card_id);
CREATE INDEX idx_ledger_created_at        ON points_ledger(created_at DESC);
CREATE INDEX idx_ledger_expiry            ON points_ledger(expiry_date)
    WHERE expiry_date IS NOT NULL;

-- redemption_history
CREATE INDEX idx_redemption_user_id       ON redemption_history(user_id);
CREATE INDEX idx_redemption_status        ON redemption_history(status);
CREATE INDEX idx_redemption_txn_id        ON redemption_history(transaction_id);

-- recommendation_events
CREATE INDEX idx_rec_events_user_id       ON recommendation_events(user_id);
CREATE INDEX idx_rec_events_action        ON recommendation_events(user_action);

-- pgvector — IVFFlat index for cosine similarity
-- NOTE: Run AFTER seed data is loaded for best index quality.
-- lists = 100 is appropriate for up to ~1M vectors.
CREATE INDEX idx_benefit_embeddings_vector
    ON benefit_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX idx_embeddings_card_id       ON benefit_embeddings(card_id);
CREATE INDEX idx_embeddings_benefit_id    ON benefit_embeddings(benefit_id);

-- tnc_versions
CREATE INDEX idx_tnc_card_current         ON tnc_versions(card_id, is_current);

-- scraper_runs
CREATE INDEX idx_scraper_card_started     ON scraper_runs(card_id, started_at DESC);


-- ------------------------------------------------------------
-- updated_at TRIGGERS
-- Auto-updates updated_at on every row change.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_cards
    BEFORE UPDATE ON cards
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_benefits
    BEFORE UPDATE ON benefits
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_transfer_partners
    BEFORE UPDATE ON transfer_partners
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_users
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_user_cards
    BEFORE UPDATE ON user_cards
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();