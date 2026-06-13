-- ============================================================
-- Migration 0006 — Embedding dimension 1536 -> 768
-- We switched the embedding provider to Google Gemini
-- text-embedding-004, which outputs 768-dim vectors (OpenAI
-- text-embedding-3-small was 1536). benefit_embeddings is empty,
-- so this is a safe in-place change. The ivfflat cosine index is
-- dropped and recreated for the new dimension.
-- ============================================================

DROP INDEX IF EXISTS idx_benefit_embeddings_vector;

ALTER TABLE benefit_embeddings
    ALTER COLUMN embedding TYPE vector(768);

CREATE INDEX idx_benefit_embeddings_vector
    ON benefit_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
