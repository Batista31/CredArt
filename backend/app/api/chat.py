import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from ..models.schemas import ChatRequest
from ..core.database import get_supabase, get_redis
from ..services.layer1.rag import retrieve_benefits
from ..services.layer1.eligibility import filter_eligible_options
from ..services.layer1.scoring import score_options, DIMENSION_WEIGHTS_DEFAULT
from ..services.layer2.ai_engine import stream_response, extract_preference_updates

router = APIRouter(prefix="/chat", tags=["chat"])

SESSION_TTL = 3600  # 1 hour


def _session_key(session_id: str) -> str:
    return f"session:{session_id}"


async def _get_session_history(session_id: str) -> list[dict]:
    redis = get_redis()
    raw = redis.get(_session_key(session_id))
    return json.loads(raw) if raw else []


async def _save_session_history(session_id: str, history: list[dict]) -> None:
    redis = get_redis()
    redis.setex(_session_key(session_id), SESSION_TTL, json.dumps(history))


async def _get_user_profile(user_id: str) -> dict:
    supabase = get_supabase()
    result = supabase.table("users").select("*").eq("id", user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")

    cards_result = (
        supabase.table("user_cards").select("*").eq("user_id", user_id).execute()
    )
    prefs_result = (
        supabase.table("user_preferences").select("*").eq("user_id", user_id).execute()
    )

    profile = result.data
    profile["cards"] = cards_result.data or []
    profile["preference_weights"] = (
        prefs_result.data[0].get("weights", DIMENSION_WEIGHTS_DEFAULT)
        if prefs_result.data
        else DIMENSION_WEIGHTS_DEFAULT
    )
    return profile


@router.post("/")
async def chat(request: ChatRequest):
    profile = await _get_user_profile(request.user_id)
    history = await _get_session_history(request.session_id)

    # Check for lifestyle update → update weights
    lifestyle_keywords = ["travel", "food", "wfh", "work from home", "gym", "shopping"]
    if any(kw in request.message.lower() for kw in lifestyle_keywords):
        updated_weights = await extract_preference_updates(
            request.message, profile["preference_weights"]
        )
        profile["preference_weights"] = updated_weights
        # Persist updated weights
        get_supabase().table("user_preferences").upsert(
            {"user_id": request.user_id, "weights": updated_weights}
        ).execute()

    # Layer 1 pipeline
    benefit_chunks = await retrieve_benefits(request.message)
    primary_card = profile["cards"][0] if profile["cards"] else {}
    eligible_options = filter_eligible_options(
        benefit_chunks,
        primary_card,
        user_region=profile.get("region", "IN"),
    )
    scored_options = score_options(
        eligible_options,
        lifestyle_tags=profile.get("lifestyle_tags", []),
        card=primary_card,
        weights=profile["preference_weights"],
    )

    # Update history with user message
    history.append({"role": "user", "content": request.message})

    async def event_stream():
        full_response = ""
        async for chunk in stream_response(
            user_message=request.message,
            conversation_history=history[:-1],
            validated_options=scored_options,
            user_profile=profile,
        ):
            full_response += chunk
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"

        # Save assistant turn to session
        history.append({"role": "assistant", "content": full_response})
        await _save_session_history(request.session_id, history)
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
