import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load local .env before importing modules that read environment variables
load_dotenv(Path(__file__).parent / ".env")

print("python executable:", sys.executable)
print("DUFFEL_API_KEY (env):", os.getenv("DUFFEL_API_KEY"))
try:
    import httpx
    print("httpx import OK, version:", getattr(httpx, "__version__", "unknown"))
except Exception as e:
    print("httpx import failed:", repr(e))

from services.redemption.duffel_provider import DuffelProvider


async def main():
    p = DuffelProvider()
    print("available:", p.is_available(), "note:", p.unavailable_note())
    if not p.is_available():
        return
    res = await p.book({}, {"given_name": "Test", "family_name": "User", "email": "test@example.com", "phone": "+919000000000"})
    print("ok:", res.ok)
    print("error:", getattr(res, "error", None))
    print("confirmation_reference:", getattr(res, "confirmation_reference", None))
    print("steps:", getattr(res, "steps", None))
    print("raw:", getattr(res, "raw", None))


if __name__ == '__main__':
    asyncio.run(main())