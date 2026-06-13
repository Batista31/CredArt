-- ============================================================
-- Migration 0007 — Replace IVFFlat with HNSW on benefit_embeddings
-- IVFFlat with lists=100 is wrong for a small catalogue (~20-200
-- rows): most probed lists are empty, so cosine search returns
-- missing/garbage neighbours. HNSW has no empty-list problem and
-- gives accurate recall on small tables. Cosine ops unchanged.
-- ============================================================

DROP INDEX IF EXISTS idx_benefit_embeddings_vector;

CREATE INDEX idx_benefit_embeddings_vector
    ON benefit_embeddings
    USING hnsw (embedding vector_cosine_ops);
