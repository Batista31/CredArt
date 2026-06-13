"""Embeddings — the only component that calls an external provider.

Pure text -> vector. No generation, no user data. Used to (a) embed card-level
benefit chunks during ingestion and (b) embed an incoming search query for the
get_benefit_chunks tool.

Provider is selected by EMBEDDING_PROVIDER (default: gemini):
  - gemini : Google text-embedding-004  -> 768 dims  (free tier, no card)
  - openai : OpenAI text-embedding-3-small -> 1536 dims (needs billing)

The benefit_embeddings.embedding column dimension must match EMBED_DIM
(currently 768 for Gemini — see migration 0006).
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_REPO_ROOT = _BACKEND_DIR.parent
load_dotenv(_BACKEND_DIR / ".env")
load_dotenv(_REPO_ROOT / "db" / ".env", override=False)

PROVIDER = os.getenv("EMBEDDING_PROVIDER", "gemini").lower()

if PROVIDER == "gemini":
    EMBED_MODEL = "gemini-embedding-001"
    EMBED_DIM = 768  # gemini-embedding-001 supports configurable output dims
elif PROVIDER == "openai":
    EMBED_MODEL = "text-embedding-3-small"
    EMBED_DIM = 1536
else:
    raise RuntimeError(f"Unknown EMBEDDING_PROVIDER={PROVIDER!r} (use gemini or openai)")

_gemini_client = None
_openai_client = None


# ---------------------------------------------------------------- Gemini
def _ensure_gemini():
    global _gemini_client
    from google import genai

    if _gemini_client is None:
        key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not key:
            raise RuntimeError(
                "No Gemini key. Set GEMINI_API_KEY or GOOGLE_API_KEY in backend/.env."
            )
        _gemini_client = genai.Client(api_key=key)
    return _gemini_client


async def _gemini_embed(texts: list[str], task_type: str) -> list[list[float]]:
    from google.genai import types

    client = _ensure_gemini()

    def run():
        res = client.models.embed_content(
            model=EMBED_MODEL,
            contents=texts,
            config=types.EmbedContentConfig(
                task_type=task_type, output_dimensionality=EMBED_DIM
            ),
        )
        return [e.values for e in res.embeddings]

    return await asyncio.to_thread(run)


# ---------------------------------------------------------------- OpenAI
def _ensure_openai():
    global _openai_client
    from openai import AsyncOpenAI

    if _openai_client is None:
        key = os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY")
        if not key:
            raise RuntimeError(
                "No OpenAI key. Set OPENAI_API_KEY or OPENAI_KEY in backend/.env."
            )
        _openai_client = AsyncOpenAI(api_key=key)
    return _openai_client


async def _openai_embed(texts: list[str]) -> list[list[float]]:
    resp = await _ensure_openai().embeddings.create(
        model=EMBED_MODEL, input=texts, dimensions=EMBED_DIM
    )
    return [d.embedding for d in resp.data]


# ---------------------------------------------------------------- public API
async def embed_documents(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts (ingestion). Uses retrieval_document task on Gemini."""
    if not texts:
        return []
    if PROVIDER == "gemini":
        return await _gemini_embed(texts, "RETRIEVAL_DOCUMENT")
    return await _openai_embed(texts)


async def embed_query(text: str) -> list[float]:
    """Embed a single search query. Uses retrieval_query task on Gemini."""
    if PROVIDER == "gemini":
        return (await _gemini_embed([text], "RETRIEVAL_QUERY"))[0]
    return (await _openai_embed([text]))[0]


def to_pgvector(embedding: list[float]) -> str:
    """Format a Python float list as a pgvector literal for ::vector casting."""
    return "[" + ",".join(f"{x:.8f}" for x in embedding) + "]"
