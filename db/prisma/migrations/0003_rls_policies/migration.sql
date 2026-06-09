-- ============================================================
-- Migration 0003 — Row Level Security Policies
-- Isolates every user's data at the database level.
-- Uses Supabase auth.uid() — works with both Supabase Auth
-- and custom JWT (set request.jwt.claims.sub).
-- ============================================================

-- Enable RLS on all user-specific tables
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_ledger       ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferences         ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemption_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_events ENABLE ROW LEVEL SECURITY;

-- Generic/catalogue tables are read-only public — no RLS needed
-- cards, benefits, transfer_partners, tnc_versions, benefit_embeddings
-- are the same for all users and contain no personal data.


-- ------------------------------------------------------------
-- users table
-- A user can only read and update their own row.
-- Insert is handled by the backend service role (bypasses RLS).
-- ------------------------------------------------------------

CREATE POLICY "users_select_own"
    ON users FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "users_update_own"
    ON users FOR UPDATE
    USING (id = auth.uid());


-- ------------------------------------------------------------
-- user_cards table
-- ------------------------------------------------------------

CREATE POLICY "user_cards_select_own"
    ON user_cards FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "user_cards_update_own"
    ON user_cards FOR UPDATE
    USING (user_id = auth.uid());


-- ------------------------------------------------------------
-- points_ledger table
-- Points ledger is append-only from user perspective.
-- Writes go through the backend service role.
-- ------------------------------------------------------------

CREATE POLICY "points_ledger_select_own"
    ON points_ledger FOR SELECT
    USING (
        user_card_id IN (
            SELECT id FROM user_cards WHERE user_id = auth.uid()
        )
    );


-- ------------------------------------------------------------
-- preferences table
-- ------------------------------------------------------------

CREATE POLICY "preferences_select_own"
    ON preferences FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "preferences_update_own"
    ON preferences FOR UPDATE
    USING (user_id = auth.uid());


-- ------------------------------------------------------------
-- redemption_history table
-- ------------------------------------------------------------

CREATE POLICY "redemption_history_select_own"
    ON redemption_history FOR SELECT
    USING (user_id = auth.uid());


-- ------------------------------------------------------------
-- recommendation_events table
-- ------------------------------------------------------------

CREATE POLICY "rec_events_select_own"
    ON recommendation_events FOR SELECT
    USING (user_id = auth.uid());


-- ------------------------------------------------------------
-- Service role bypass
-- The FastAPI backend uses the service role key and bypasses
-- RLS for writes (inserts, updates, saga executor).
-- This is correct — the backend is trusted server-side code.
-- Never expose the service role key to the frontend.
-- ------------------------------------------------------------