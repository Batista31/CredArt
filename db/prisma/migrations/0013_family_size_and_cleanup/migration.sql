-- ============================================================
-- Migration 0013 — track family_size (was already live but untracked)
-- + drop the orphaned legacy user_saved_addresses table.
-- ============================================================

BEGIN;

-- preferences.family_size was added directly to the live DB at some point
-- but never made it into schema.prisma / a migration file, and was never
-- selected by user_service.get_preferences() — this brings it in sync.
ALTER TABLE preferences
    ADD COLUMN IF NOT EXISTS family_size INT NOT NULL DEFAULT 1;

UPDATE preferences SET family_size = 2 WHERE user_id = '00000000-0000-0000-0000-000000000001'; -- Samyak
UPDATE preferences SET family_size = 1 WHERE user_id = '00000000-0000-0000-0000-000000000002'; -- Riya

-- user_saved_addresses is a dead legacy table (superseded by user_addresses
-- from migration 0012). Not in schema.prisma, not referenced by any backend
-- code, holding stale duplicate test rows. redemption_orders.delivery_address_id
-- was still FK'd to it (drift from schema.prisma, which points at
-- user_addresses) — no rows use the column, so repoint the FK before dropping.
ALTER TABLE redemption_orders DROP CONSTRAINT IF EXISTS redemption_orders_delivery_address_id_fkey;
ALTER TABLE redemption_orders
    ADD CONSTRAINT redemption_orders_delivery_address_id_fkey
    FOREIGN KEY (delivery_address_id) REFERENCES user_addresses(id) ON DELETE SET NULL;

DROP TABLE IF EXISTS user_saved_addresses;

COMMIT;
