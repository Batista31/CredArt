from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_env: str = "development"
    cors_origins: str = "http://localhost:3000"

    anthropic_api_key: str
    openai_api_key: str

    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    database_url: str

    redis_url: str
    redis_token: str

    class Config:
        env_file = ".env"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
