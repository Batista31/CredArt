"""CredArt Bank MCP server (mock).

SSE transport, port 8000. Exposes 6 deterministic, strictly card-level tools.
Each tool is a THIN wrapper: it validates input, calls a Layer 1 service, and
wraps the result in the standard card-level envelope (with content_hash). No
business logic or SQL lives here. None of these tools can read user data — the
services they call only touch cards / benefits / transfer_partners /
tnc_versions.

Run:
    cd backend
    .venv/Scripts/python -m mcp_server      (Windows)
    python -m mcp_server                    (others)
"""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from services import (
    benefit_chunks_service,
    benefits_service,
    cards_service,
    redemption_service,
    tnc_service,
    transfer_partners_service,
)
from services.serialization import wrap

mcp = FastMCP(
    "credart-bank",
    instructions=(
        "Mock HDFC bank server. Returns ONLY card-level catalogue data "
        "(benefits, transfer ratios, redemption rules, T&C). Never user data."
    ),
    host="0.0.0.0",
    port=8000,
)


def _not_found(card_id: str) -> dict:
    return {"scope": "card_level", "card_id": card_id, "error": "card_not_found"}


@mcp.tool()
async def list_cards(active_only: bool = True) -> dict:
    """List all cards in the bank catalogue (card-level, no user data).

    Args:
        active_only: when true (default), only return active cards.
    """
    cards = await cards_service.list_cards(active_only=active_only)
    return wrap({"count": len(cards), "cards": cards})


@mcp.tool()
async def get_card_details(card_id: str) -> dict:
    """Get full metadata for one card.

    Args:
        card_id: e.g. hdfc_infinia, hdfc_regalia_gold, hdfc_millennia.
    """
    card = await cards_service.get_card_details(card_id)
    if card is None:
        return _not_found(card_id)
    return wrap(card, card_id=card_id)


@mcp.tool()
async def get_card_benefits(
    card_id: str,
    category: str | None = None,
    benefit_type: str | None = None,
) -> dict:
    """Get benefit details for a card.

    Args:
        card_id: the card to look up.
        category: optional filter (e.g. REWARDS, TRAVEL & LIFESTYLE).
        benefit_type: optional filter (earn, lifestyle, fee, caveat, transfer).
    """
    card = await cards_service.get_card_details(card_id)
    if card is None:
        return _not_found(card_id)
    benefits = await benefits_service.get_card_benefits(card_id, category, benefit_type)
    return wrap({"count": len(benefits), "benefits": benefits}, card_id=card_id)


@mcp.tool()
async def get_transfer_partners(
    card_id: str,
    partner_type: str | None = None,
) -> dict:
    """Get transfer partner ratios for a card.

    Args:
        card_id: the card to look up.
        partner_type: optional filter (airline, hotel).
    """
    card = await cards_service.get_card_details(card_id)
    if card is None:
        return _not_found(card_id)
    partners = await transfer_partners_service.get_transfer_partners(card_id, partner_type)
    return wrap({"count": len(partners), "partners": partners}, card_id=card_id)


@mcp.tool()
async def get_redemption_rules(card_id: str) -> dict:
    """Get composed redemption rules for a card (earn rates, fees, caveats, transfers).

    Args:
        card_id: the card to look up.
    """
    card = await cards_service.get_card_details(card_id)
    if card is None:
        return _not_found(card_id)
    rules = await redemption_service.get_redemption_rules(card_id)
    return wrap(rules, card_id=card_id)


@mcp.tool()
async def get_tnc_updates(card_id: str) -> dict:
    """Get the current Terms & Conditions version for a card.

    Args:
        card_id: the card to look up.
    """
    card = await cards_service.get_card_details(card_id)
    if card is None:
        return _not_found(card_id)
    tnc = await tnc_service.get_tnc_updates(card_id)
    if tnc is None:
        return {"scope": "card_level", "card_id": card_id, "error": "no_current_tnc"}
    return wrap(tnc, card_id=card_id)


@mcp.tool()
async def get_benefit_chunks(
    query: str,
    card_id: str | None = None,
    top_k: int = 5,
) -> dict:
    """Semantic search over card benefits (pgvector). Card-level — no user data.

    Embeds the natural-language query and returns the most similar benefit
    chunks by cosine similarity, each with a source_url and similarity score.

    Args:
        query: natural-language description of what the user wants.
        card_id: optional — restrict the search to a single card.
        top_k: number of chunks to return (1-20, default 5).
    """
    chunks = await benefit_chunks_service.get_benefit_chunks(query, card_id, top_k)
    return wrap({"query": query, "count": len(chunks), "chunks": chunks}, card_id=card_id)


if __name__ == "__main__":
    mcp.run(transport="sse")
