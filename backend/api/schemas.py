"""Pydantic request/response models for the CredArt API."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

IntentKind = Literal[
    "greeting", "check_expiry", "explore_benefits", "redeem", "transfer", "unknown"
]


class Intent(BaseModel):
    kind: IntentKind
    query: str = ""
    card_id: Optional[str] = None
    category: Optional[str] = None
    urgency: bool = False


class Candidate(BaseModel):
    kind: Literal["redemption", "transfer", "expiry", "perk"]
    card_id: str
    card_name: str
    label: str
    category: Optional[str] = None
    points_cost: Optional[int] = None
    affordable: Optional[bool] = None
    effective_value_inr: Optional[float] = None
    best_use_case: Optional[str] = None
    similarity: Optional[float] = None
    expiry_urgent: bool = False
    source_url: Optional[str] = None
    note: Optional[str] = None
    # Phase 6 — 5-dimension scoring (deterministic, 0–100)
    score_financial: Optional[float] = None
    score_lifestyle: Optional[float] = None
    score_redemption_prob: Optional[float] = None
    score_expiry_risk: Optional[float] = None
    score_flexibility: Optional[float] = None
    score_total: Optional[float] = None
    rank: Optional[int] = None


class ToolCall(BaseModel):
    tool: str
    args: dict[str, Any] = Field(default_factory=dict)
    result_count: int = 0


class ChatRequest(BaseModel):
    user_id: str
    message: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    session_id: str
    user_id: str
    intent: Intent
    candidates: list[Candidate]
    reply: str
    tool_trace: list[ToolCall]
    # Phase 7 will set this true once Claude does the reranking/explanation.
    claude_used: bool = False


class SmsRequest(BaseModel):
    user_id: str
    text: str
    sender: str = "HDFCBK"
