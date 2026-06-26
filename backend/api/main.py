"""CredArt FastAPI backend — Phase 5 skeleton.

Endpoints:
  GET  /health           — liveness + config (embedding provider, session backend)
  POST /chat             — main entry: intent -> Layer 1 candidates -> reply
  POST /sms              — ingest a bank SMS (wires the Phase 4 parser)
  GET  /cards/{user_id}  — a user's portfolio (convenience for the frontend)

Run (from backend/):
    .venv\\Scripts\\python -m uvicorn api.main:app --port 8001 --reload
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from services import bank_mcp_client, db, embeddings_service, scoring_service, user_service
from services.sms_service import ingest_sms

from services.redemption import registry
from services.redemption.executor import execute_redemption

from .intent import extract_intent
from .orchestrator import orchestrate
from .schemas import ChatRequest, ChatResponse, RedeemRequest, RedeemResponse, SmsRequest
from .session import SessionStore

store = SessionStore()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.get_pool()  # warm the pool
    await bank_mcp_client.startup()  # connect to the mock bank MCP (falls back if down)
    yield
    await bank_mcp_client.shutdown()
    await db.close_pool()


app = FastAPI(title="CredArt API", version="0.5.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten for deployment
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "embedding_provider": embeddings_service.PROVIDER,
        "embedding_model": embeddings_service.EMBED_MODEL,
        "session_backend": store.backend,
        "bank_data_source": bank_mcp_client.backend(),
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    user = await user_service.get_user(req.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="unknown user_id")

    session = await store.load(req.session_id)
    await store.append_turn(session, "user", req.message)

    intent = await extract_intent(
        req.message,
        conversation_history=session.get("turns", []),
        partial_intent=session.get("partial_intent"),
    )

    # Persist or clear partial intent depending on whether we need another turn.
    if not intent.is_complete:
        session["partial_intent"] = intent.model_dump(
            exclude={"is_complete", "follow_up_question"}
        )
    else:
        session.pop("partial_intent", None)

    cards = await user_service.get_user_cards(req.user_id)
    candidates, trace, meta = await orchestrate(intent, user, cards)

    # Log the top scored candidates as the preference-learning signal.
    if candidates:
        await scoring_service.log_recommendation_events(
            req.user_id, session["session_id"], candidates)

    resp = ChatResponse(
        session_id=session["session_id"],
        user_id=req.user_id,
        intent=intent,
        candidates=candidates,
        reply=meta["reply"],
        tool_trace=trace,
        claude_used=meta.get("llm_used", False),
    )
    await store.append_turn(session, "assistant", resp.reply)
    # Stash this turn's candidate set so /redeem can resolve a one-click choice.
    session["last_candidates"] = [c.model_dump() for c in candidates]
    await store.save(session)
    return resp


@app.post("/redeem", response_model=RedeemResponse)
async def redeem(req: RedeemRequest):
    user = await user_service.get_user(req.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="unknown user_id")

    session = await store.load(req.session_id)
    candidates = session.get("last_candidates") or []
    candidate = next((c for c in candidates if c.get("candidate_id") == req.candidate_id), None)
    if candidate is None:
        raise HTTPException(status_code=404, detail="unknown candidate_id for this session")

    provider = registry.get_provider(req.provider_id)
    if provider is None:
        raise HTTPException(status_code=400, detail="unknown provider_id")
    if provider.mode != req.mode:
        raise HTTPException(status_code=400,
                            detail=f"provider '{req.provider_id}' is {provider.mode}, not {req.mode}")
    if not provider.is_available():
        raise HTTPException(status_code=400,
                            detail=provider.unavailable_note() or "provider unavailable")

    traveler = (req.traveler.model_dump() if req.traveler else {})
    result = await execute_redemption(req.user_id, candidate, provider, traveler)
    return RedeemResponse(**result)


@app.post("/sms")
async def sms(req: SmsRequest):
    user = await user_service.get_user(req.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="unknown user_id")
    return await ingest_sms(req.user_id, req.text, sender=req.sender)


@app.get("/cards/{user_id}")
async def cards(user_id: str):
    user = await user_service.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="unknown user_id")
    return {"user": user, "cards": await user_service.get_user_cards(user_id)}
