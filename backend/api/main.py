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

from services import (
    bank_mcp_client,
    conversation_service,
    db,
    embeddings_service,
    recommendation_session_service,
    scoring_service,
    user_service,
)
from services.sms_service import ingest_sms

from services.redemption import booking_session_service, registry
from services.redemption.executor import start_redemption, submit_otp

from .conversation import resume_conversation
from .dialogue_manager import generate_concierge_response
from .intent import extract_intent
from .orchestrator import orchestrate
from .schemas import (
    BookingSessionResponse,
    ChatRequest,
    ChatResponse,
    ConversationCreateRequest,
    ConversationMessageRequest,
    OtpRequest,
    RecommendationSessionRequest,
    RedeemRequest,
    RedeemResponse,
    SmsRequest,
)
from .session import SessionStore

store = SessionStore()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.get_pool()
    await bank_mcp_client.startup()
    yield
    await bank_mcp_client.shutdown()
    await db.close_pool()


app = FastAPI(title="CredArt API", version="0.5.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

    concierge = await generate_concierge_response(
        req.user_id, req.message, conversation_id=req.conversation_id)

    session = await store.load(req.session_id)
    await store.append_turn(session, "user", req.message)

    intent = concierge["intent"]
    candidates = concierge["candidates"]
    trace = concierge["tool_trace"]
    meta = {"reply": concierge["message"], "llm_used": concierge["claude_used"]}

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
        conversation_id=concierge["conversation_id"],
        message=concierge["message"],
        response_type=concierge["response_type"],
        journey_type=concierge["journey_type"],
        known_slots=concierge["known_slots"],
        missing_slots=concierge["missing_slots"],
        recommendations=concierge["recommendations"],
        requires_confirmation=concierge["requires_confirmation"],
        memory_updates=concierge["memory_updates"],
        next_actions=concierge["next_actions"],
    )
    await store.append_turn(session, "assistant", resp.reply)
    dumps = [c.model_dump() for c in candidates]
    session["last_candidates"] = dumps
    idx = session.get("candidate_index") or {}
    for candidate in dumps:
        if candidate.get("candidate_id"):
            idx[candidate["candidate_id"]] = candidate
    session["candidate_index"] = idx
    await store.save(session)
    return resp


@app.post("/redeem", response_model=RedeemResponse)
async def redeem(req: RedeemRequest):
    user = await user_service.get_user(req.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="unknown user_id")

    session = await store.load(req.session_id)
    idx = session.get("candidate_index") or {}
    candidate = idx.get(req.candidate_id)
    if candidate is None:
        candidates = session.get("last_candidates") or []
        candidate = next((c for c in candidates if c.get("candidate_id") == req.candidate_id), None)
    if candidate is None:
        raise HTTPException(status_code=404, detail="unknown candidate_id for this session")

    if req.mode == "demo":
        provider = registry.get_provider("demo")
    else:
        if not req.consent:
            raise HTTPException(status_code=400, detail="consent required for a production booking")
        provider = registry.get_provider(req.provider_id)
        if provider is None or provider.path == "demo":
            raise HTTPException(status_code=400, detail="choose a live provider (api/assisted/bank) for production")
        if not provider.is_available():
            raise HTTPException(status_code=400,
                                detail=provider.unavailable_note() or "provider unavailable")

    traveler = (req.traveler.model_dump() if req.traveler else {})
    result = await start_redemption(req.user_id, candidate, provider, traveler, req.mode)
    return RedeemResponse(**result)


@app.post("/booking-sessions/{session_id}/otp")
async def booking_otp(session_id: str, body: OtpRequest):
    return await submit_otp(session_id, body.otp)


@app.get("/booking-sessions/{session_id}", response_model=BookingSessionResponse)
async def booking_get(session_id: str):
    sess = booking_session_service.get(session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="unknown booking session")
    return BookingSessionResponse(**sess)


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


@app.post("/conversations")
async def create_conversation(req: ConversationCreateRequest):
    user = await user_service.get_user(req.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="unknown user_id")
    convo = await conversation_service.create_conversation(req.user_id, req.message)
    if req.message:
        await conversation_service.add_message(convo["id"], "user", req.message)
    return convo


@app.get("/conversations")
async def list_conversations(user_id: str):
    user = await user_service.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="unknown user_id")
    return {"conversations": await conversation_service.list_conversations(user_id)}


@app.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user_id: str):
    convo = await conversation_service.get_conversation(user_id, conversation_id)
    if convo is None:
        raise HTTPException(status_code=404, detail="unknown conversation_id")
    return {
        "conversation": convo,
        "messages": await conversation_service.get_messages(conversation_id),
        "state": await conversation_service.get_state(conversation_id),
    }


@app.post("/conversations/{conversation_id}/messages", response_model=ChatResponse)
async def add_conversation_message(conversation_id: str, req: ConversationMessageRequest):
    return await chat(ChatRequest(user_id=req.user_id, message=req.message, conversation_id=conversation_id))


@app.post("/conversations/{conversation_id}/resume")
async def resume(conversation_id: str, user_id: str):
    data = await resume_conversation(user_id, conversation_id)
    if data is None:
        raise HTTPException(status_code=404, detail="unknown conversation_id")
    return data


@app.post("/recommendations/session")
async def create_recommendation_session(req: RecommendationSessionRequest):
    user = await user_service.get_user(req.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="unknown user_id")
    return await recommendation_session_service.create_session(
        req.user_id,
        req.journey_type,
        req.input_context,
        [],
        conversation_id=req.conversation_id,
    )


@app.get("/recommendations/session/{session_id}")
async def get_recommendation_session(session_id: str, user_id: str):
    data = await recommendation_session_service.get_session(user_id, session_id)
    if data is None:
        raise HTTPException(status_code=404, detail="unknown session_id")
    return data
