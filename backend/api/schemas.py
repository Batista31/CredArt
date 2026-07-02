"""Pydantic request/response models for the CredArt API."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

IntentKind = Literal[
    "greeting", "check_expiry", "explore_benefits", "redeem", "transfer", "unknown"
]
JourneyType = Literal[
    "travel_flight",
    "travel_hotel",
    "product_purchase",
    "home_setup",
    "gift_purchase",
    "voucher_redemption",
    "cashback_or_statement_credit",
    "transfer_partner_redemption",
    "card_benefit_lookup",
    "points_expiry_help",
    "general_reward_advice",
]
ResponseType = Literal[
    "follow_up_question",
    "recommendation",
    "confirmation",
    "execution_result",
    "general_answer",
]
FulfillmentPath = Literal["demo", "api", "assisted", "bank"]


class Intent(BaseModel):
    kind: IntentKind
    query: str = ""
    card_id: Optional[str] = None
    category: Optional[str] = None
    urgency: bool = False
    journey_type: Optional[JourneyType] = None
    slots: dict[str, Any] = Field(default_factory=dict)
    # Flight intent (duffel) — IATA codes + ISO date
    origin: Optional[str] = None
    destination: Optional[str] = None
    depart_date: Optional[str] = None
    # Multi-turn completeness — transient, not stored across turns
    is_complete: bool = True
    follow_up_question: Optional[str] = None


class FulfillmentOption(BaseModel):
    """A way to actually fulfil a candidate."""

    provider_id: str
    label: str
    path: FulfillmentPath = "demo"
    mode: Literal["live", "demo"]
    currency: Literal["points", "demo_points"]
    available: bool = True
    note: Optional[str] = None


class Candidate(BaseModel):
    kind: Literal["redemption", "transfer", "expiry", "perk", "product", "flight", "hotel", "merchandise"]
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
    caveat: Optional[str] = None
    # Phase 6 — 5-dimension scoring (deterministic, 0–100)
    score_financial: Optional[float] = None
    score_lifestyle: Optional[float] = None
    score_redemption_prob: Optional[float] = None
    score_expiry_risk: Optional[float] = None
    score_flexibility: Optional[float] = None
    score_total: Optional[float] = None
    rank: Optional[int] = None
    fulfillment_options: list[FulfillmentOption] = Field(default_factory=list)
    item_id: Optional[str] = None
    cash_price_inr: Optional[int] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    # Flight route — carried to DuffelProvider at /redeem
    origin: Optional[str] = None
    destination: Optional[str] = None
    depart_date: Optional[str] = None


class ToolCall(BaseModel):
    tool: str
    args: dict[str, Any] = Field(default_factory=dict)
    result_count: int = 0


class ChatRequest(BaseModel):
    user_id: str
    message: str
    session_id: Optional[str] = None
    conversation_id: Optional[str] = None


class ChatResponse(BaseModel):
    session_id: str
    user_id: str
    intent: Intent
    candidates: list[Candidate]
    reply: str
    tool_trace: list[ToolCall]
    claude_used: bool = False
    conversation_id: Optional[str] = None
    message: str = ""
    response_type: ResponseType = "general_answer"
    journey_type: Optional[JourneyType] = None
    known_slots: dict[str, Any] = Field(default_factory=dict)
    missing_slots: list[str] = Field(default_factory=list)
    recommendations: list[dict[str, Any]] = Field(default_factory=list)
    requires_confirmation: bool = False
    memory_updates: list[str] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    suggested_replies: list[str] = Field(default_factory=list)


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
    consent: bool = False
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
    path: Optional[FulfillmentPath] = None
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


# --- Conversation models ---

class ConversationCreateRequest(BaseModel):
    user_id: str
    message: str = ""


class ConversationMessageRequest(BaseModel):
    user_id: str
    message: str


class PreferencePatchRequest(BaseModel):
    destination_type: Optional[str] = None
    trip_length: Optional[str] = None
    region_preference: Optional[str] = None
    accommodation_tier: Optional[str] = None
    flight_preference: Optional[str] = None
    departure_preference: Optional[str] = None
    travel_weight: Optional[float] = None
    dining_weight: Optional[float] = None
    shopping_weight: Optional[float] = None
    cashback_weight: Optional[float] = None
    experiences_weight: Optional[float] = None
    value_sensitivity_threshold: Optional[float] = None


class RecommendationSessionRequest(BaseModel):
    user_id: str
    conversation_id: Optional[str] = None
    journey_type: JourneyType
    input_context: dict[str, Any] = Field(default_factory=dict)


class RedemptionQuoteRequest(BaseModel):
    user_id: str
    item_id: str


class RedemptionConfirmRequest(BaseModel):
    user_id: str
    order_id: str


class RedemptionExecuteRequest(BaseModel):
    user_id: str
    order_id: str


class PluginContextRequest(BaseModel):
    user_id: str
    context_type: str = "merchant_context"
    merchant: Optional[str] = None
    page: Optional[str] = None
    category: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
