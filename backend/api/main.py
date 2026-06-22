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

from services import db, embeddings_service, scoring_service, user_service
from services.sms_service import ingest_sms

from .intent import extract_intent
from .orchestrator import orchestrate
from .schemas import ChatRequest, ChatResponse, SmsRequest
from .session import SessionStore

store = SessionStore()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.get_pool()  # warm the pool
    yield
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
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    user = await user_service.get_user(req.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="unknown user_id")

    session = await store.load(req.session_id)
    await store.append_turn(session, "user", req.message)

    intent = extract_intent(req.message)
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
        claude_used=False,  # Phase 7 flips this on
    )
    await store.append_turn(session, "assistant", resp.reply)
    return resp


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
