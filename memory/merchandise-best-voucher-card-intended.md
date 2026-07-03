---
name: merchandise-best-voucher-card-intended
description: Merchandise redemptions intentionally price against the best-value voucher card, not the user's selected card
metadata:
  type: project
---

In the merchandise flow (`merchandise_service.search_merchandise_candidates` →
`_best_voucher_card`), pricing always uses the card with the highest ₹/point
voucher conversion (Infinia 1.0 > Regalia 0.5 > Millennia 0.3), regardless of
which card the user selected in the UI. This is **intended behaviour**, not a
bug — it maximizes value for the user.

**Why:** I previously flagged "shows Infinia when I asked under Millennia" as a
bug and started a fix (threading `card_id` through `ChatRequest` →
`generate_concierge_response` → `search_merchandise_candidates`); the user had me
revert it. Do not re-flag or re-fix this.

The genuine bug in that same report was the search term (stale `product_category`
leaking across conversations + "cooker" not recognized) — see [[intent.py]] /
`_TRANSIENT_SLOTS` in `dialogue_manager.py`, which we DID fix.
