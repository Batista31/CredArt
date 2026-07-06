/* CredArt — Travel Rewards API client (backend /travel/* — self-contained
   router, see backend/api/travel.py). Mirrors lib/api.js's fetch helpers so
   the two clients stay consistent; kept separate because this page always
   talks to the backend's single travel demo identity (Riya), not whichever
   persona is active in the main Rewards Catalogue. */
const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

async function jpost(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  return r.json();
}

async function jget(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  return r.json();
}

export const travelApi = {
  airports: (q) => jget(`/travel/airports?q=${encodeURIComponent(q || "")}`),

  searchFlights: (params) => jpost("/travel/flights/search", params),

  offerDetail: (offerId) => jget(`/travel/flights/offers/${encodeURIComponent(offerId)}`),

  redemptionPreview: (offerId, paymentMode) =>
    jpost("/travel/redemption/preview", { offer_id: offerId, payment_mode: paymentMode }),

  demoConfirm: (offerId, paymentMode) =>
    jpost("/travel/redemption/demo-confirm", { offer_id: offerId, payment_mode: paymentMode }),

  /* LIVE booking: real Duffel test order (real airline PNR), demo credits
     debited, order recorded in account history, invoice emailed. */
  confirm: (offerId, paymentMode) =>
    jpost("/travel/redemption/confirm", { offer_id: offerId, payment_mode: paymentMode }),

  orders: () => jget("/travel/orders"),

  health: () => jget("/travel/health"),
};
