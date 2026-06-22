"""Semantic search over benefit_embeddings (pgvector cosine). Card-level.

This backs the 7th MCP tool, get_benefit_chunks. It embeds the query via
OpenAI, then ranks card-level benefit chunks by cosine similarity in-database.
It only reads benefit_embeddings — no user tables.
"""

from __future__ import annotations

from . import db, embeddings_service


async def get_benefit_chunks(
    query: str,
    card_id: str | None = None,
    top_k: int = 5,
) -> list[dict]:
    """Return the top_k benefit chunks most semantically similar to `query`."""
    query_vec = embeddings_service.to_pgvector(
        await embeddings_service.embed_query(query)
    )

    args: list = [query_vec]
    where = ""
    if card_id is not None:
        args.append(card_id)
        where = "WHERE be.card_id = $2"
    args.append(max(1, min(top_k, 20)))
    limit_pos = len(args)

    # Join benefits so callers get points_cost / name / type alongside the chunk
    # (needed for affordability + redemption candidates). Still card-level only.
    rows = await db.fetch(
        f"""
        SELECT be.benefit_id,
               be.card_id,
               be.category,
               be.chunk_text,
               be.source_url,
               be.content_hash,
               b.benefit_name,
               b.benefit_type,
               b.points_cost,
               1 - (be.embedding <=> $1::vector) AS similarity
        FROM benefit_embeddings be
        JOIN benefits b ON b.id = be.benefit_id
        {where}
        ORDER BY be.embedding <=> $1::vector
        LIMIT ${limit_pos}
        """,
        *args,
    )
    # Round similarity for clean transport; keep raw ordering from pgvector.
    for r in rows:
        r["similarity"] = round(float(r["similarity"]), 4)
    return rows
