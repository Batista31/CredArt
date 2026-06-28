"""Load the mock HDFC catalogue (backend/catalogue/*.json) into Postgres.

This is the card-level catalogue the bank MCP server serves. It reseeds the
3 cards, their benefits (redeemable rewards + perks + milestone bonuses), and
transfer partners from the JSON files — so the JSON is the single source of
truth for catalogue content.

Idempotent: cards are upserted; benefits and transfer_partners for these cards
are deleted and re-inserted. Deleting benefits cascades to benefit_embeddings,
so run ingest_embeddings.py afterwards to re-embed.

Run:
    cd backend
    .venv\\Scripts\\python seed_catalogue.py
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from services import db
from services.serialization import content_hash

_CATALOGUE_DIR = Path(__file__).resolve().parent / "catalogue"

# Stable card_id values (never the display name).
CARD_ID = {
    "Infinia": "hdfc_infinia",
    "Regalia Gold": "hdfc_regalia_gold",
    "Millennia": "hdfc_millennia",
}


def _months(text: str | None) -> int | None:
    if not text:
        return None
    m = re.search(r"\d+", text)
    return int(m.group()) if m else None


def _ratio(text: str) -> tuple[int, int]:
    src, dst = text.split(":")
    return int(src), int(dst)


def _benefit_rows(card_id: str, card: dict) -> list[dict]:
    rows: list[dict] = []
    order = 0
    for b in card.get("benefits", []):
        points_cost = b.get("points_cost")
        rows.append({
            "card_id": card_id,
            "category": b["category"],
            "sort_order": order,
            "benefit_name": b["title"],
            "description": b["description"],
            "benefit_type": "redemption" if points_cost is not None else "perk",
            "points_cost": points_cost,
            "cash_component_inr": b.get("cash_component"),
            "milestone_threshold_inr": None,
            "source_url": card["source_url"],
            "verified": b.get("verified", True),
        })
        order += 1

    for m in card.get("milestone_benefits", []):
        threshold = m["spend_threshold"]
        rows.append({
            "card_id": card_id,
            "category": "MILESTONE",
            "sort_order": order,
            "benefit_name": "Milestone bonus",
            "description": f"Spend ₹{threshold:,} in a year to earn {m['reward']}.",
            "benefit_type": "milestone",
            "points_cost": None,
            "cash_component_inr": None,
            "milestone_threshold_inr": threshold,
            "source_url": card["source_url"],
            "verified": True,
        })
        order += 1

    for r in rows:
        r["content_hash"] = content_hash({
            k: r[k] for k in (
                "card_id", "category", "benefit_name", "description",
                "benefit_type", "points_cost", "cash_component_inr",
                "milestone_threshold_inr",
            )
        })
    return rows


def _partner_rows(partners: list[dict]) -> list[dict]:
    rows = []
    for p in partners:
        card_id = CARD_ID[p["card_name"]]
        src, dst = _ratio(p["transfer_ratio"])
        row = {
            "card_id": card_id,
            "partner_name": p["partner_name"],
            "partner_type": p["partner_type"].lower(),
            "source_points": src,
            "destination_points": dst,
            "minimum_transfer": p["minimum_transfer_points"],
            "processing_days_min": p["processing_days"],
            "processing_days_max": p["processing_days"],
            "reversible": p["reversible"],
            "effective_value_inr": p["estimated_value_per_point_inr"],
            "best_use_case": p.get("best_use_case"),
            "source_url": p["source_url"],
        }
        row["content_hash"] = content_hash({
            k: row[k] for k in (
                "card_id", "partner_name", "partner_type", "source_points",
                "destination_points", "minimum_transfer", "effective_value_inr",
            )
        })
        rows.append(row)
    return rows


async def main() -> None:
    cards = json.loads((_CATALOGUE_DIR / "hdfc_catalogue.json").read_text("utf-8"))
    partners = json.loads((_CATALOGUE_DIR / "transfer_partners.json").read_text("utf-8"))
    reward_items = json.loads((_CATALOGUE_DIR / "reward_items.json").read_text("utf-8"))

    card_ids = [CARD_ID[c["card_name"]] for c in cards]
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Cards — upsert (keeps existing user_cards FK intact).
            for c in cards:
                cid = CARD_ID[c["card_name"]]
                fp = c.get("fine_print", {})
                await conn.execute(
                    """
                    INSERT INTO cards
                        (id, bank_name, card_name, card_tier, network,
                         annual_fee_inr, base_earn_rate, currency_name,
                         card_page_url, joining_fee_inr, points_expiry_months,
                         excluded_categories, blackout_dates, is_active)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE)
                    ON CONFLICT (id) DO UPDATE SET
                        bank_name=EXCLUDED.bank_name,
                        card_name=EXCLUDED.card_name,
                        card_tier=EXCLUDED.card_tier,
                        network=EXCLUDED.network,
                        annual_fee_inr=EXCLUDED.annual_fee_inr,
                        base_earn_rate=EXCLUDED.base_earn_rate,
                        currency_name=EXCLUDED.currency_name,
                        card_page_url=EXCLUDED.card_page_url,
                        joining_fee_inr=EXCLUDED.joining_fee_inr,
                        points_expiry_months=EXCLUDED.points_expiry_months,
                        excluded_categories=EXCLUDED.excluded_categories,
                        blackout_dates=EXCLUDED.blackout_dates,
                        is_active=TRUE
                    """,
                    cid, c["bank_name"], c["card_name"], c["tier"], c["network"],
                    c["annual_fee"], c["reward_rate"], c["reward_currency"],
                    c["source_url"], c.get("joining_fee"), _months(fp.get("points_expiry")),
                    fp.get("excluded_categories", []), fp.get("blackout_dates", []),
                )

            # Benefits + transfer_partners — replace for these cards.
            # (Deleting benefits cascades to benefit_embeddings.)
            await conn.execute(
                "DELETE FROM transfer_partners WHERE card_id = ANY($1::text[])", card_ids
            )
            await conn.execute(
                "DELETE FROM benefits WHERE card_id = ANY($1::text[])", card_ids
            )

            n_benefits = 0
            for c in cards:
                for r in _benefit_rows(CARD_ID[c["card_name"]], c):
                    await conn.execute(
                        """
                        INSERT INTO benefits
                            (card_id, category, sort_order, benefit_name, description,
                             benefit_type, points_cost, cash_component_inr,
                             milestone_threshold_inr, source_url, verified,
                             content_hash, is_embedded)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE)
                        """,
                        r["card_id"], r["category"], r["sort_order"], r["benefit_name"],
                        r["description"], r["benefit_type"], r["points_cost"],
                        r["cash_component_inr"], r["milestone_threshold_inr"],
                        r["source_url"], r["verified"], r["content_hash"],
                    )
                    n_benefits += 1

            n_partners = 0
            for r in _partner_rows(partners):
                await conn.execute(
                    """
                    INSERT INTO transfer_partners
                        (card_id, partner_name, partner_type, source_points,
                         destination_points, minimum_transfer, processing_days_min,
                         processing_days_max, reversible, effective_value_inr,
                         best_use_case, source_url, content_hash, is_active)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE)
                    """,
                    r["card_id"], r["partner_name"], r["partner_type"], r["source_points"],
                    r["destination_points"], r["minimum_transfer"], r["processing_days_min"],
                    r["processing_days_max"], r["reversible"], r["effective_value_inr"],
                    r["best_use_case"], r["source_url"], r["content_hash"],
                )
                n_partners += 1

            n_reward_items = 0
            for item in reward_items:
                await conn.execute(
                    """
                    INSERT INTO reward_items
                        (id, catalogue_name, title, description, category, subcategory,
                         brand, provider, points_price, cash_price_inr, points_plus_cash,
                         inventory_status, fulfillment_type, metadata, is_active)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE)
                    ON CONFLICT (id) DO UPDATE SET
                        catalogue_name=EXCLUDED.catalogue_name,
                        title=EXCLUDED.title,
                        description=EXCLUDED.description,
                        category=EXCLUDED.category,
                        subcategory=EXCLUDED.subcategory,
                        brand=EXCLUDED.brand,
                        provider=EXCLUDED.provider,
                        points_price=EXCLUDED.points_price,
                        cash_price_inr=EXCLUDED.cash_price_inr,
                        points_plus_cash=EXCLUDED.points_plus_cash,
                        inventory_status=EXCLUDED.inventory_status,
                        fulfillment_type=EXCLUDED.fulfillment_type,
                        metadata=EXCLUDED.metadata,
                        is_active=TRUE
                    """,
                    item["id"], item["catalogue_name"], item["title"], item["description"],
                    item["category"], item.get("subcategory"), item.get("brand"),
                    item.get("provider"), item["points_price"], item.get("cash_price_inr"),
                    json.dumps(item.get("points_plus_cash")) if item.get("points_plus_cash") else None,
                    item.get("inventory_status", "in_stock"),
                    item.get("fulfillment_type", "delivery"),
                    json.dumps(item.get("metadata")) if item.get("metadata") else None,
                )
                n_reward_items += 1

    print(
        f"Loaded {len(cards)} cards, {n_benefits} benefits, "
        f"{n_partners} transfer partners, {n_reward_items} reward items."
    )
    print("benefit_embeddings cleared via cascade — run ingest_embeddings.py next.")
    await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
