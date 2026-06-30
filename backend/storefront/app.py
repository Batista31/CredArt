"""CredArt mock hotel storefront (:8002).

Stand-in for a real hotel partner that has no public API. Two surfaces:
  POST /api/book        — server-to-server booking target for WebsiteHotelProvider.
  GET  /book/{hotel_id} — a real booking page the Playwright fallback drives.

Never persists card PAN/CVV — a card number, if posted, is reduced to last4 and
echoed back only. There is no datastore; each booking returns a fresh reference.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse

app = FastAPI(title="CredArt Mock Storefront", version="1.0.0")

HOTELS = {
    "hotel_indraprastha": "Hotel Indraprastha",
    "hotel_country_inn": "Hotel Country Inn",
}


def _last4(card_number: str | None) -> str:
    digits = "".join(ch for ch in (card_number or "") if ch.isdigit())
    return digits[-4:] if len(digits) >= 4 else ""


def _confirm(hotel: str, guest: dict, card_last4: str) -> dict:
    return {
        "status": "confirmed",
        "confirmation_reference": "HTL-" + uuid4().hex[:8].upper(),
        "hotel": hotel,
        "guest_name": f"{guest.get('given_name','')} {guest.get('family_name','')}".strip(),
        "card_last4": card_last4,
    }


@app.get("/health")
async def health():
    return {"status": "ok", "hotels": list(HOTELS)}


@app.post("/api/book")
async def api_book(req: Request):
    """Server-to-server booking. Accepts the provider payload, returns a reference."""
    body = await req.json()
    guest = body.get("guest", {}) or {}
    card_last4 = body.get("card_last4") or _last4(body.get("card_number"))
    hotel = body.get("hotel") or HOTELS.get(body.get("hotel_id", ""), "Hotel")
    return JSONResponse(_confirm(hotel, guest, card_last4))


@app.get("/book/{hotel_id}", response_class=HTMLResponse)
async def book_page(hotel_id: str):
    """Real booking page for the Playwright fallback. Stable element ids for automation."""
    hotel = HOTELS.get(hotel_id, "Hotel")
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>{hotel} — Booking</title></head>
<body style="font-family:system-ui;max-width:420px;margin:40px auto">
  <h2 id="hotel-name">{hotel}</h2>
  <form id="book-form">
    <input id="given_name" placeholder="First name" value="Riya"><br><br>
    <input id="family_name" placeholder="Last name" value="Sharma"><br><br>
    <input id="email" placeholder="Email" value="riya@example.com"><br><br>
    <input id="card_number" placeholder="Card number" value="4242424242424242"><br><br>
    <button id="book_btn" type="submit">Book</button>
  </form>
  <pre id="confirmation"></pre>
  <script>
    const f = document.getElementById('book-form');
    f.addEventListener('submit', async (e) => {{
      e.preventDefault();
      const r = await fetch('/api/book', {{
        method: 'POST', headers: {{'content-type': 'application/json'}},
        body: JSON.stringify({{
          hotel: {hotel!r}, hotel_id: {hotel_id!r},
          card_number: document.getElementById('card_number').value,
          guest: {{
            given_name: document.getElementById('given_name').value,
            family_name: document.getElementById('family_name').value,
            email: document.getElementById('email').value,
          }},
        }}),
      }});
      const j = await r.json();
      document.getElementById('confirmation').textContent = j.confirmation_reference;
    }});
  </script>
</body></html>"""
