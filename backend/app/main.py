from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import get_settings
from .api import chat, rewards

app = FastAPI(
    title="CredArt API",
    description="AI Rewards Concierge — Hybrid Intelligence Backend",
    version="1.0.0",
)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(rewards.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "credart-api"}
