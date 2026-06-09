from supabase import create_client, Client
from redis import Redis
from .config import get_settings

_supabase: Client | None = None
_redis: Redis | None = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        s = get_settings()
        _supabase = create_client(s.supabase_url, s.supabase_service_role_key)
    return _supabase


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        s = get_settings()
        _redis = Redis.from_url(s.redis_url, decode_responses=True)
    return _redis
