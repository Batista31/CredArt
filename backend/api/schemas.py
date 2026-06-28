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


FulfillmentPath = Literal["demo", "api", "assisted", "bank"]


class FulfillmentOption(BaseModel):
    """A way to actually fulfil a candidate. `live` options (api/assisted/bank) book
    for real and spend real points; the `demo` option is always present, mimics the
    booking, and spends demo_points so the demo is replayable."""
    provider_id: str
    label: str
    path: FulfillmentPath = "demo"
    mode: Literal["live", "demo"]
    currency: Literal["points", "demo_points"]
    available: bool = True
    note: Optional[str] = None


class Candidate(BaseModel):
    kind: Literal["redemption", "transfer", "expiry", "perk"]
    candidate_id: Optional[str] = None
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
    # Phase 8 — bank-sourced T&C caveat (blackout / excluded / expiry), shown before booking.
    caveat: Optional[str] = None
    # Phase 6 — 5-dimension scoring (deterministic, 0–100)
    score_financial: Optional[float] = None
    score_lifestyle: Optional[float] = None
    score_redemption_prob: Optional[float] = None
    score_expiry_risk: Optional[float] = None
    score_flexibility: Optional[float] = None
    score_total: Optional[float] = None
    rank: Optional[int] = None
    # Phase 9 — how this candidate can be booked (live providers + always demo).
    fulfillment_options: list[FulfillmentOption] = Field(default_factory=list)


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


class Traveler(BaseModel):
    given_name: str = "Riya"
    family_name: str = "Sharma"
    email: str = "riya@example.com"
    phone: str = "+919000000000"


class Address(BaseModel):
    """A saved/supplied delivery address (CMR). `label` is Home/Office etc."""
    label: str = "Home"
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: Optional[str] = None
    pincode: str
    is_default: Optional[bool] = None


class RedeemRequest(BaseModel):
    user_id: str
    session_id: str
    candidate_id: str
    provider_id: str
    mode: Literal["demo", "production"] = "demo"
    consent: bool = False  # required for any production (real) booking
    traveler: Optional[Traveler] = None
    # CMR — for physical goods, an address supplied inline (saved for next time).
    # If omitted, the user's saved default address is used.
    delivery_address: Optional[Address] = None


class RedeemStep(BaseModel):
    label: str
    status: Literal["done", "failed", "pending"] = "done"
    detail: Optional[str] = None


class RedeemResponse(BaseModel):
    status: Literal["completed", "failed", "otp_required", "address_required"]
    transaction_id: str
    confirmation_reference: Optional[str] = None
    provider_id: str
    path: Optional[str] = None
    mode: Literal["demo", "production"]
    option_label: str
    card_id: str
    card_name: str
    currency: Literal["points", "demo_points"]
    points_used: int = 0
    balance_after: int = 0
    booking_session_id: Optional[str] = None
    steps: list[RedeemStep] = Field(default_factory=list)
    rollback_reason: Optional[str] = None
    # CMR — physical goods delivery. `address_required` asks for a shipping
    # address conversationally; `delivery_address` echoes where it shipped.
    address_prompt: Optional[str] = None
    delivery_address: Optional[Address] = None


class OtpRequest(BaseModel):
    otp: str


class BookingSessionResponse(BaseModel):
    id: str
    status: str
    merchant: str
    amount: int
    card_last4: str
    otp_required: bool
    otp_deadline: float
    confirmation_reference: Optional[str] = None
    error_message: Optional[str] = None


# --- CMR (Customer Master Record) request models ---

class AddressRequest(Address):
    """Save a delivery address for a user."""
    user_id: str
    make_default: bool = False


class WishlistRequest(BaseModel):
    """Add a benefit to the user's wishlist. Either resolve it from a session
    candidate (session_id + candidate_id) or pass the label directly."""
    user_id: str
    session_id: Optional[str] = None
    candidate_id: Optional[str] = None
    label: Optional[str] = None
    card_id: Optional[str] = None
    category: Optional[str] = None


class DismissRequest(BaseModel):
    """Dismiss a benefit so it never recurs. Resolve from a session candidate
    (session_id + candidate_id) or pass the label directly."""
    user_id: str
    session_id: Optional[str] = None
    candidate_id: Optional[str] = None
    label: Optional[str] = None
    card_id: Optional[str] = None
