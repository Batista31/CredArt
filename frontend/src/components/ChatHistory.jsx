/* CredArt — Chat history overview. Lists past conversations (real backend
   /conversations), tap to resume one inside Concierge with its message history. */
import React from "react";
import { api } from "../lib/api.js";

const JOURNEY_LABELS = {
  travel_flight: "Flight",
  travel_hotel: "Hotel stay",
  product_purchase: "Shopping",
  home_setup: "Home setup",
  gift_purchase: "Gift",
  voucher_redemption: "Voucher",
  cashback_or_statement_credit: "Cashback",
  transfer_partner_redemption: "Points transfer",
  card_benefit_lookup: "Card benefits",
  points_expiry_help: "Expiry check",
  general_reward_advice: "General",
};

function timeAgo(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ConvoRow({ convo, onClick }) {
  const label = JOURNEY_LABELS[convo.journey_type] || "Chat";
  return (
    <div className="tap" onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12, padding: "14px 4px",
      borderBottom: "1px solid var(--hairline)", cursor: "pointer" }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--brand-100)", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center", color: "var(--brand-700)", fontWeight: 800, fontSize: 15 }}>
        {(convo.title || "?").slice(0, 1).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 190 }}>
            {convo.title || "New concierge chat"}
          </span>
          {convo.open_task && (
            <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--amber)", background: "var(--amber-bg)",
              padding: "2px 7px", borderRadius: 999, letterSpacing: 0.2, flexShrink: 0 }}>IN PROGRESS</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
          {label} · {timeAgo(convo.last_message_at || convo.updated_at)}
        </div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
        <path d="M9 6l6 6-6 6" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function ChatHistory({ user, onBack, onOpenConversation }) {
  const [conversations, setConversations] = React.useState(null); // null = loading
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    if (!user?.user_id) return;
    api.conversations(user.user_id)
      .then((d) => setConversations(d.conversations || []))
      .catch((e) => { setErr(String(e.message || e)); setConversations([]); });
  }, [user?.user_id]);

  return (
    <div className="cr-root" style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* header */}
      <div style={{ background: "linear-gradient(135deg,var(--brand-700),var(--brand-900))", color: "#fff",
        padding: "54px 16px 18px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 6px 18px rgba(42,14,85,0.25)" }}>
        <button className="tap" onClick={onBack} style={{ background: "rgba(255,255,255,0.14)", border: "none", width: 36, height: 36,
          borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.2 }}>Chat history</div>
      </div>

      {/* list */}
      <div className="no-sb" style={{ flex: 1, overflowY: "auto", padding: "8px 16px 24px" }}>
        {conversations === null && !err && (
          <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "var(--ink-3)" }}>Loading…</div>
        )}
        {err && (
          <div style={{ padding: "40px 20px", textAlign: "center", fontSize: 13, color: "var(--red)" }}>
            Couldn't load chat history — is the backend running on :8001?
          </div>
        )}
        {conversations && conversations.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center", fontSize: 13, color: "var(--ink-3)" }}>
            No conversations yet. Open a card and start chatting with CredArt.
          </div>
        )}
        {conversations && conversations.map((c) => (
          <ConvoRow key={c.id} convo={c} onClick={() => onOpenConversation(c)} />
        ))}
      </div>
    </div>
  );
}
