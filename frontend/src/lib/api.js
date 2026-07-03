/* CredArt backend client (FastAPI on :8001). Override with VITE_API_BASE. */
const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8001";

/* Demo personas (seeded). Riya = travel-leaning, Samyak = dining-leaning —
   the profile contrast is the whole point of the demo. */
export const USERS = [
  { id: "00000000-0000-0000-0000-000000000002", name: "Riya Sharma", short: "Riya" },
  { id: "00000000-0000-0000-0000-000000000001", name: "Samyak Rao", short: "Samyak" },
];

/* The active persona. Mutable so a UI switcher can flip the whole app between
   users without prop-threading — every api.* call below defaults to it. */
let ACTIVE_USER_ID = USERS[0].id;
export const USER_ID = ACTIVE_USER_ID; // back-compat (initial value)
export const getActiveUser = () => ACTIVE_USER_ID;
export const setActiveUser = (id) => { ACTIVE_USER_ID = id; };

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
  cards: (userId = ACTIVE_USER_ID) => jget(`/cards/${userId}`),
  cmr: (userId = ACTIVE_USER_ID) => jget(`/cmr/${userId}`),

  chat: (message, sessionId, conversationId, userId = ACTIVE_USER_ID) =>
    jpost("/chat", {
      user_id: userId,
      message,
      session_id: sessionId || undefined,
      conversation_id: conversationId || undefined,
    }),

  conversations: (userId = ACTIVE_USER_ID) => jget(`/conversations?user_id=${userId}`),
  conversation: (id, userId = ACTIVE_USER_ID) => jget(`/conversations/${id}?user_id=${userId}`),

  redeem: ({ sessionId, candidateId, providerId, mode, consent, userId = ACTIVE_USER_ID }) =>
    jpost("/redeem", {
      user_id: userId, session_id: sessionId, candidate_id: candidateId,
      provider_id: providerId, mode, consent: !!consent,
    }),

  wishlist: (label, cardId, userId = ACTIVE_USER_ID) =>
    jpost("/cmr/wishlist", { user_id: userId, label, card_id: cardId || undefined }),

  dismiss: (label, cardId, userId = ACTIVE_USER_ID) =>
    jpost("/cmr/dismiss", { user_id: userId, label, card_id: cardId || undefined }),

  bookingSession: (id) => jget(`/booking-sessions/${id}`),
  submitOtp: (id, otp) => jpost(`/booking-sessions/${id}/otp`, { otp }),

  /* --- Food & Dining concierge (Subway). Self-contained backend router;
     no user_id needed (backend uses its own demo user). --- */
  diningHealth: () => jget("/dining/health"),
  diningChat: (message, sessionId) =>
    jpost("/dining/chat", { message, session_id: sessionId || undefined }),
  diningRedeem: ({ sessionId, candidateId }) =>
    jpost("/dining/redeem", { session_id: sessionId, candidate_id: candidateId }),

  /* --- Entertainment & Cinema concierge (TMDB + hardcoded rewards). --- */
  entHealth: () => jget("/entertainment/health"),
  entChat: (message, sessionId) =>
    jpost("/entertainment/chat", { message, session_id: sessionId || undefined }),
  entRedeem: ({ sessionId, candidateId }) =>
    jpost("/entertainment/redeem", { session_id: sessionId, candidate_id: candidateId }),
};
