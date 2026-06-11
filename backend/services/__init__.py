"""CredArt Layer 1 — deterministic card-level services.

All SQL and business logic live here. The MCP server (mcp_server.py) only
contains thin wrappers that call into these functions. No service in this
package may query user-specific tables (user_cards, points_ledger,
preferences, redemption_history, recommendation_events) — the bank MCP
server is strictly card-level.
"""
