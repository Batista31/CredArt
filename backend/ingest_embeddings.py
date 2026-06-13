"""Phase 3 — pgvector ingestion pipeline.

Embeds card-level benefit rows into benefit_embeddings using OpenAI
text-embedding-3-small, then flips benefits.is_embedded = true.

Hash-sync: each embedding row stores the benefit's content_hash. A normal run
embeds only benefits that are new or whose content_hash changed (i.e. the
bank's card-level content actually changed). Use --force to re-embed all
(e.g. after changing the model or chunking strategy).

Run:
    cd backend
    .venv\\Scripts\\python ingest_embeddings.py            # incremental
    .venv\\Scripts\\python ingest_embeddings.py --force     # re-embed everything
"""

from __future__ import annotations

import argparse
import asyncio
import sys

sys.stdout.reconfigure(encoding="utf-8")

from services import db, embeddings_service


def build_chunk_text(row: dict) -> str:
    """Compose the text we embed for a benefit (card-level, search-friendly)."""
    text = (
        f"{row['card_name']} — {row['category']} — "
        f"{row['benefit_name']}: {row['description']}"
    )
    if row.get("points_cost") is not None:
        text += f" (redeemable for {row['points_cost']:,} points)"
    return text


async def fetch_candidates(force: bool) -> list[dict]:
    """Benefits joined with card name + their current embedding hash (if any)."""
    rows = await db.fetch(
        """
        SELECT b.id            AS benefit_id,
               b.card_id,
               b.category,
               b.benefit_name,
               b.description,
               b.points_cost,
               b.source_url,
               b.content_hash,
               b.effective_date,
               b.is_embedded,
               c.card_name,
               e.content_hash  AS embedded_hash
        FROM benefits b
        JOIN cards c ON c.id = b.card_id
        LEFT JOIN benefit_embeddings e ON e.benefit_id = b.id
        ORDER BY b.card_id, b.category, b.sort_order
        """
    )
    if force:
        return rows
    # Incremental: only rows with no embedding yet, or a changed source hash.
    return [
        r for r in rows
        if r["embedded_hash"] is None or r["embedded_hash"] != r["content_hash"]
    ]


async def main(force: bool) -> None:
    candidates = await fetch_candidates(force)
    total_benefits = len(await db.fetch("SELECT id FROM benefits"))

    if not candidates:
        print(f"Nothing to embed — all {total_benefits} benefits up to date.")
        await db.close_pool()
        return

    print(f"Embedding {len(candidates)}/{total_benefits} benefits "
          f"({'FORCE' if force else 'incremental'}) with "
          f"{embeddings_service.EMBED_MODEL}…")

    texts = [build_chunk_text(r) for r in candidates]
    vectors = await embeddings_service.embed_documents(texts)

    pool = await db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for row, chunk_text, vec in zip(candidates, texts, vectors):
                vec_literal = embeddings_service.to_pgvector(vec)
                # Re-embed = replace any existing chunk(s) for this benefit.
                await conn.execute(
                    "DELETE FROM benefit_embeddings WHERE benefit_id = $1",
                    row["benefit_id"],
                )
                await conn.execute(
                    """
                    INSERT INTO benefit_embeddings
                        (benefit_id, card_id, category, chunk_text, embedding,
                         source_url, content_hash, effective_date)
                    VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8)
                    """,
                    row["benefit_id"], row["card_id"], row["category"],
                    chunk_text, vec_literal, row["source_url"],
                    row["content_hash"], row["effective_date"],
                )
                await conn.execute(
                    "UPDATE benefits SET is_embedded = TRUE WHERE id = $1",
                    row["benefit_id"],
                )
                print(f"  ✓ {row['card_id']:18} {row['benefit_name']}")

    embedded_now = len(await db.fetch("SELECT id FROM benefit_embeddings"))
    remaining = len(await db.fetch("SELECT id FROM benefits WHERE is_embedded = FALSE"))
    print(f"\nDone. benefit_embeddings rows = {embedded_now} | "
          f"benefits still is_embedded=false = {remaining}")
    await db.close_pool()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true",
                        help="re-embed all benefits regardless of content_hash")
    args = parser.parse_args()
    asyncio.run(main(args.force))
