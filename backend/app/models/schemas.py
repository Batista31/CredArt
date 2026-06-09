from pydantic import BaseModel
from typing import Literal


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    user_id: str
    session_id: str
    message: str


class RewardOption(BaseModel):
    id: str
    name: str
    category: str
    points_required: int
    cash_component: float
    value_inr: float
    score: float
    eligible: bool
    expiry_date: str | None = None
    transfer_partner: str | None = None
    transfer_ratio: str | None = None


class UserCard(BaseModel):
    card_id: str
    card_name: str
    issuer: str
    points_balance: int
    cash_value_inr: float
    expiring_soon: int


class UserProfile(BaseModel):
    user_id: str
    name: str
    cards: list[UserCard]
    lifestyle_tags: list[str]
    preference_weights: dict[str, float]


class TransactionState(BaseModel):
    transaction_id: str
    status: Literal["pending", "locking", "booking", "paying", "confirmed", "failed", "rolled_back"]
    reward_id: str
    points_used: int
    cash_used: float
    error: str | None = None
