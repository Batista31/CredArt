-- ============================================================
-- Migration 0009 — SMS messages (parser audit + idempotency)
-- User card data in CredArt comes ONLY from parsing the bank's
-- SMS (never from the bank MCP server). This table records every
-- SMS the parser ingests, keyed by a unique hash so the same SMS
-- is never applied twice. It is also the audit trail for how a
-- user's balance/expiry changed.
-- ============================================================

CREATE TABLE sms_messages (
    id            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_card_id  UUID            REFERENCES user_cards(id) ON DELETE SET NULL,
    sms_hash      VARCHAR(64)     UNIQUE NOT NULL,
    sender        VARCHAR(32),
    sms_type      VARCHAR(32)     NOT NULL,
    card_last4    VARCHAR(4),
    raw_text      TEXT            NOT NULL,
    parsed        JSONB,
    applied       BOOLEAN         NOT NULL DEFAULT FALSE,
    error_message TEXT,
    received_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    processed_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sms_user_id     ON sms_messages(user_id);
CREATE INDEX idx_sms_user_card   ON sms_messages(user_card_id);
CREATE INDEX idx_sms_received     ON sms_messages(received_at DESC);

-- RLS — a user can read only their own SMS records.
-- The backend service role bypasses RLS for inserts.
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_select_own"
    ON sms_messages FOR SELECT
    USING (user_id = auth.uid());
