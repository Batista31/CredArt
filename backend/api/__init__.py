"""CredArt FastAPI backend (Phase 5).

Orchestration layer: wires Layer 1 (deterministic services + bank MCP catalogue
+ SMS-sourced user data) into a pre-validated candidate set, then (Phase 7)
hands that set to the LLM. The LLM never touches the DB — it only ever receives
the candidate set this layer produces.
"""
