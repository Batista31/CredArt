import json
from openai import AsyncOpenAI
from ...core.config import get_settings
from ...core.database import get_supabase


async def embed_text(text: str) -> list[float]:
    client = AsyncOpenAI(api_key=get_settings().openai_api_key)
    response = await client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding


async def retrieve_benefits(intent_text: str, top_k: int = 10) -> list[dict]:
    """Query pgvector for relevant T&C benefit chunks matching the user intent."""
    embedding = await embed_text(intent_text)
    supabase = get_supabase()

    result = supabase.rpc(
        "match_benefits",
        {
            "query_embedding": embedding,
            "match_count": top_k,
        },
    ).execute()

    return result.data or []


async def retrieve_transfer_partners(card_id: str) -> list[dict]:
    """Fetch available transfer partners for a given card."""
    supabase = get_supabase()
    result = (
        supabase.table("transfer_partners")
        .select("*")
        .eq("card_id", card_id)
        .execute()
    )
    return result.data or []
