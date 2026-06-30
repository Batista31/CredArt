ALTER TABLE user_cards
    ADD COLUMN IF NOT EXISTS demo_points INT NOT NULL DEFAULT 100000;

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(160) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    journey_type VARCHAR(64),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
    ON conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_created
    ON conversation_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS conversation_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
    journey_type VARCHAR(64),
    response_type VARCHAR(32),
    known_slots JSONB NOT NULL DEFAULT '{}'::jsonb,
    missing_slots JSONB NOT NULL DEFAULT '[]'::jsonb,
    open_task TEXT,
    recommendation_state JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    summary TEXT,
    structured_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    lifestyle_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    last_active_conversation_id UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_saved_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(64) NOT NULL,
    line1 VARCHAR(160) NOT NULL,
    line2 VARCHAR(160),
    city VARCHAR(64) NOT NULL,
    state VARCHAR(64) NOT NULL,
    postal_code VARCHAR(16) NOT NULL,
    country VARCHAR(64) NOT NULL DEFAULT 'India',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_saved_addresses_user_default
    ON user_saved_addresses(user_id, is_default);

CREATE TABLE IF NOT EXISTS unfinished_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    journey_type VARCHAR(64) NOT NULL,
    title VARCHAR(160) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'open',
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unfinished_tasks_user_status_updated
    ON unfinished_tasks(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS recommendation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    journey_type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    input_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_sessions_user_created
    ON recommendation_sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reward_items (
    id VARCHAR(64) PRIMARY KEY,
    catalogue_name VARCHAR(64) NOT NULL,
    title VARCHAR(160) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(64) NOT NULL,
    subcategory VARCHAR(64),
    brand VARCHAR(64),
    provider VARCHAR(64),
    points_price INT NOT NULL,
    cash_price_inr INT,
    points_plus_cash JSONB,
    inventory_status VARCHAR(32) NOT NULL DEFAULT 'in_stock',
    fulfillment_type VARCHAR(32) NOT NULL DEFAULT 'delivery',
    metadata JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reward_items_category_active
    ON reward_items(category, is_active);

CREATE TABLE IF NOT EXISTS redemption_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    recommendation_session_id UUID REFERENCES recommendation_sessions(id) ON DELETE SET NULL,
    item_type VARCHAR(32) NOT NULL,
    item_id VARCHAR(64) NOT NULL REFERENCES reward_items(id),
    points_used INT NOT NULL DEFAULT 0,
    cash_component NUMERIC(10,2) NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'pending_confirmation',
    delivery_address_id UUID REFERENCES user_saved_addresses(id) ON DELETE SET NULL,
    confirmation_timestamp TIMESTAMPTZ,
    provider_reference TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_redemption_orders_user_created
    ON redemption_orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS profile_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source VARCHAR(32) NOT NULL,
    signal_type VARCHAR(64) NOT NULL,
    signal_key VARCHAR(64) NOT NULL,
    signal_value JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_signals_user_source_type
    ON profile_signals(user_id, source, signal_type);
