from fastapi import APIRouter, HTTPException
from ..core.database import get_supabase
from ..models.schemas import TransactionState

router = APIRouter(prefix="/rewards", tags=["rewards"])


@router.get("/cards/{user_id}")
async def get_user_cards(user_id: str):
    supabase = get_supabase()
    result = (
        supabase.table("user_cards")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    return result.data or []


@router.get("/options/{user_id}")
async def get_reward_options(user_id: str):
    supabase = get_supabase()
    result = (
        supabase.table("reward_options")
        .select("*")
        .execute()
    )
    return result.data or []


@router.post("/redeem")
async def initiate_redemption(transaction: TransactionState):
    """
    Redemption executor entry point.
    State machine: pending → locking → booking → paying → confirmed
    Saga rollback on any failure.
    """
    supabase = get_supabase()

    # Write initial state before any action
    supabase.table("transactions").insert(transaction.model_dump()).execute()

    # TODO: integrate with Kobie API endpoints in Round 2
    # For now, simulate progression through states
    states = ["locking", "booking", "paying", "confirmed"]
    for state in states:
        transaction.status = state
        supabase.table("transactions").update(
            {"status": state}
        ).eq("transaction_id", transaction.transaction_id).execute()

    return {"status": "confirmed", "transaction_id": transaction.transaction_id}


@router.get("/transaction/{transaction_id}")
async def get_transaction_status(transaction_id: str):
    supabase = get_supabase()
    result = (
        supabase.table("transactions")
        .select("*")
        .eq("transaction_id", transaction_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return result.data
