/* CredArt backend client (FastAPI on :8001). Override with VITE_API_BASE. */
const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

/* Demo user — Riya Sharma (seeded). */
export const USER_ID = "00000000-0000-0000-0000-000000000002";

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

export const api = {
  health: () => jget("/health"),
  cards: (userId = USER_ID) => jget(`/cards/${userId}`),
  cmr: (userId = USER_ID) => jget(`/cmr/${userId}`),

  chat: (message, sessionId, conversationId, userId = USER_ID) =>
    jpost("/chat", {
      user_id: userId,
      message,
      session_id: sessionId || undefined,
      conversation_id: conversationId || undefined,
    }),

  redeem: ({ sessionId, candidateId, providerId, mode, consent, userId = USER_ID }) =>
    jpost("/redeem", {
      user_id: userId, session_id: sessionId, candidate_id: candidateId,
      provider_id: providerId, mode, consent: !!consent,
    }),

  wishlist: (label, cardId, userId = USER_ID) =>
    jpost("/cmr/wishlist", { user_id: userId, label, card_id: cardId || undefined }),

  dismiss: (label, cardId, userId = USER_ID) =>
    jpost("/cmr/dismiss", { user_id: userId, label, card_id: cardId || undefined }),

  bookingSession: (id) => jget(`/booking-sessions/${id}`),
  submitOtp: (id, otp) => jpost(`/booking-sessions/${id}/otp`, { otp }),
};
