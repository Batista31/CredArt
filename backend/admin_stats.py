"""CredArt Admin — feedback & personalization monitor (Streamlit).

Run:
    cd backend
    .venv\\Scripts\\python -m streamlit run admin_stats.py

Reads the same Postgres the engine writes (DIRECT_URL from backend/.env or
db/.env). Read-only: every query here is a SELECT.

What it shows
  1. Feedback quality — confirm / dismiss / pending on recommendation_events,
     with the recommender confusion matrix:
        TP  recommended and the user confirmed it
        FP  recommended and the user dismissed it
        FN  user redeemed something we never recommended in that category
        TN  estimated remainder of the catalogue (never pushed, never wanted)
  2. Personalization monitor — per-user category weights, redemption/dismissal
     totals, and the structured_preferences JSON (incl. gift relationship memory).
  3. Learning-loop health — does a higher deterministic score actually convert
     to more confirms? (avg score_total for confirmed vs dismissed)
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

# ---------------------------------------------------------------- DB plumbing
ROOT = Path(__file__).resolve().parent.parent


def _load_dsn() -> str:
    for env_file in (ROOT / "backend" / ".env", ROOT / "db" / ".env"):
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("DIRECT_URL=") or line.startswith("DATABASE_URL="):
                    dsn = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if dsn:
                        return dsn
    dsn = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError("No DIRECT_URL/DATABASE_URL in backend/.env or db/.env")
    return dsn


@st.cache_data(ttl=30)
def q(sql: str) -> pd.DataFrame:
    """Run one read-only query via asyncpg, return DataFrame. 30s cache."""
    import asyncpg

    async def _run():
        conn = await asyncpg.connect(_load_dsn(), statement_cache_size=0)
        try:
            rows = await conn.fetch(sql)
            return [dict(r) for r in rows]
        finally:
            await conn.close()

    data = asyncio.run(_run())
    return pd.DataFrame(data)


# ---------------------------------------------------------------- page config
st.set_page_config(page_title="CredArt Admin", page_icon="📊", layout="wide")

NAVY, CORAL, CREAM, GOLD, SLATE = "#0B1D2C", "#FB7B54", "#FBF7EE", "#D9A441", "#5F7D91"
GOOD, BAD, PEND = "#2E9E6B", "#D9534F", "#9AA5B1"

st.markdown(
    f"""
    <div style="display:flex;align-items:center;gap:14px;padding:6px 0 2px">
      <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(150deg,#16354D,{NAVY});
                  display:flex;align-items:center;justify-content:center;color:{CREAM};font-weight:800;font-size:22px">C</div>
      <div>
        <div style="font-size:24px;font-weight:800;color:{NAVY}">CredArt Admin — Feedback &amp; Personalization</div>
        <div style="font-size:13px;color:{SLATE}">Deterministic engine telemetry · read-only · refreshes every 30s</div>
      </div>
    </div>
    """,
    unsafe_allow_html=True,
)
st.divider()

# ---------------------------------------------------------------- data pulls
events = q("""
    SELECT e.user_id::text, u.name AS user_name, e.session_id, e.recommendation_rank,
           e.option_type, e.option_label, e.user_action,
           e.score_total::float, e.score_financial::float, e.score_lifestyle::float,
           e.score_redemption_prob::float, e.score_expiry_risk::float, e.score_flexibility::float,
           e.created_at
      FROM recommendation_events e JOIN users u ON u.id = e.user_id
     ORDER BY e.created_at
""")

redemptions = q("""
    SELECT r.user_id::text, u.name AS user_name, r.option_type, r.option_label,
           r.status, r.points_used, r.value_inr::float, r.created_at
      FROM redemption_history r JOIN users u ON u.id = r.user_id
     ORDER BY r.created_at
""")

prefs = q("""
    SELECT u.name AS user_name, p.travel_weight::float, p.dining_weight::float,
           p.shopping_weight::float, p.cashback_weight::float, p.experiences_weight::float,
           p.total_redemptions, p.total_dismissals, p.updated_at
      FROM preferences p JOIN users u ON u.id = p.user_id
""")

structured = (
    q("""
        SELECT u.name AS user_name, m.structured_preferences
          FROM user_memory m JOIN users u ON u.id = m.user_id
    """)
    if q("SELECT to_regclass('user_memory') AS t").iloc[0]["t"] is not None
    else pd.DataFrame()
)

# Catalogue is file-based (source of truth), not a DB table.
try:
    _cat = json.loads((ROOT / "backend" / "catalogue" / "hdfc_catalogue.json").read_text(encoding="utf-8"))
    catalogue_n = sum(len(v) for v in _cat.values() if isinstance(v, list)) or 210
except Exception:
    catalogue_n = 210  # matches the ~210 rewards shown in the store UI

# ---------------------------------------------------------------- 1 · feedback
st.subheader("1 · Feedback quality")

if events.empty:
    st.info("No recommendation events yet — run a few concierge conversations first.")
else:
    confirmed = int((events.user_action == "confirmed").sum())
    dismissed = int((events.user_action == "dismissed").sum())
    pending = int(events.user_action.isna().sum())
    total = len(events)

    # FN: redeemed option_types never recommended to that user
    fn = 0
    if not redemptions.empty:
        rec_pairs = set(zip(events.user_id, events.option_type))
        fn = sum(1 for _, r in redemptions.iterrows() if (r.user_id, r.option_type) not in rec_pairs)
    tn = max(int(catalogue_n) - total - fn, 0)  # estimate, stated as such

    precision = confirmed / (confirmed + dismissed) if (confirmed + dismissed) else 0.0
    recall = confirmed / (confirmed + fn) if (confirmed + fn) else 0.0

    k1, k2, k3, k4, k5, k6 = st.columns(6)
    k1.metric("Recommendations", total)
    k2.metric("Confirmed (TP)", confirmed)
    k3.metric("Dismissed (FP)", dismissed)
    k4.metric("Awaiting signal", pending)
    k5.metric("Precision", f"{precision:.0%}")
    k6.metric("Recall (est.)", f"{recall:.0%}")

    c1, c2 = st.columns([1, 1.4])
    with c1:
        cm = go.Figure(go.Heatmap(
            z=[[confirmed, fn], [dismissed, tn]],
            x=["User wanted it", "User didn't"],
            y=["We recommended", "We didn't"],
            text=[[f"TP {confirmed}", f"FN {fn}"], [f"FP {dismissed}", f"TN ~{tn}"]],
            texttemplate="%{text}", showscale=False,
            colorscale=[[0, CREAM], [1, CORAL]],
        ))
        cm.update_layout(title="Confusion matrix (TN estimated from catalogue size)",
                         height=320, margin=dict(l=10, r=10, t=48, b=10))
        cm.update_yaxes(autorange="reversed")  # "We recommended" on top
        st.plotly_chart(cm, use_container_width=True)
    with c2:
        daily = events.copy()
        daily["day"] = pd.to_datetime(daily.created_at).dt.date
        daily["signal"] = daily.user_action.fillna("pending")
        agg = daily.groupby(["day", "signal"]).size().reset_index(name="n")
        tl = px.bar(agg, x="day", y="n", color="signal", title="Feedback over time",
                    color_discrete_map={"confirmed": GOOD, "dismissed": BAD, "pending": PEND})
        tl.update_layout(height=320, margin=dict(l=10, r=10, t=48, b=10), legend_title=None)
        st.plotly_chart(tl, use_container_width=True)

    # per-category confirm rate — the exact signal scoring_service learns from
    st.markdown("**Confirm rate by category** — this is the `redemption_prob` signal the scorer learns from")
    lab = events.copy()
    lab["signal"] = lab.user_action.fillna("pending")
    rate = (
        lab[lab.signal != "pending"]
        .assign(ok=lambda d: (d.signal == "confirmed").astype(int))
        .groupby("option_type")
        .agg(n=("ok", "size"), confirm_rate=("ok", "mean"))
        .reset_index()
        .sort_values("confirm_rate", ascending=False)
    )
    if rate.empty:
        st.caption("No labelled feedback yet — confirm or dismiss a recommendation in the app.")
    else:
        br = px.bar(rate, x="option_type", y="confirm_rate", text="n",
                    title=None, color_discrete_sequence=[NAVY])
        br.update_traces(texttemplate="n=%{text}", textposition="outside")
        br.update_layout(height=300, yaxis_tickformat=".0%", yaxis_range=[0, 1.05],
                         margin=dict(l=10, r=10, t=10, b=10), xaxis_title=None, yaxis_title="confirm rate")
        st.plotly_chart(br, use_container_width=True)

st.divider()

# ---------------------------------------------------------------- 2 · personalization
st.subheader("2 · Personalization monitor")

if prefs.empty:
    st.info("No preference rows.")
else:
    cols = st.columns(len(prefs))
    weight_names = ["travel", "dining", "shopping", "cashback", "experiences"]
    for col, (_, p) in zip(cols, prefs.iterrows()):
        with col:
            st.markdown(f"**{p.user_name}**")
            wdf = pd.DataFrame({
                "category": weight_names,
                "weight": [p.travel_weight, p.dining_weight, p.shopping_weight,
                           p.cashback_weight, p.experiences_weight],
            })
            pie = px.pie(wdf, names="category", values="weight", hole=0.55,
                         color_discrete_sequence=[NAVY, CORAL, GOLD, SLATE, "#8FB3C7"])
            pie.update_layout(height=260, margin=dict(l=0, r=0, t=8, b=0),
                              showlegend=True, legend=dict(orientation="h", y=-0.15))
            st.plotly_chart(pie, use_container_width=True)
            a, b = st.columns(2)
            a.metric("Redeemed", int(p.total_redemptions))
            b.metric("Dismissed", int(p.total_dismissals))
            st.caption(f"weights updated {pd.to_datetime(p.updated_at):%d %b %H:%M}")

    if not structured.empty:
        st.markdown("**Structured memory** (incl. gift relationship memory)")
        for _, r in structured.iterrows():
            sp = r.structured_preferences
            sp = json.loads(sp) if isinstance(sp, str) else (sp or {})
            if sp:
                with st.expander(f"{r.user_name} — {len(sp)} keys"):
                    st.json(sp)

st.divider()

# ---------------------------------------------------------------- 3 · loop health
st.subheader("3 · Learning-loop health")

if events.empty or events.user_action.dropna().empty:
    st.info("Needs labelled feedback (confirms/dismissals) to evaluate.")
else:
    lab = events.dropna(subset=["user_action"])
    hc1, hc2 = st.columns(2)
    with hc1:
        box = px.box(lab, x="user_action", y="score_total", color="user_action", points="all",
                     title="Deterministic score vs outcome — confirmed should sit higher",
                     color_discrete_map={"confirmed": GOOD, "dismissed": BAD})
        box.update_layout(height=340, showlegend=False, margin=dict(l=10, r=10, t=48, b=10))
        st.plotly_chart(box, use_container_width=True)
    with hc2:
        dims = ["score_financial", "score_lifestyle", "score_redemption_prob",
                "score_expiry_risk", "score_flexibility"]
        mean_by = lab.groupby("user_action")[dims].mean().reset_index().melt(
            id_vars="user_action", var_name="dimension", value_name="avg")
        mean_by["dimension"] = mean_by.dimension.str.replace("score_", "")
        gb = px.bar(mean_by, x="dimension", y="avg", color="user_action", barmode="group",
                    title="Which dimensions separate confirms from dismissals",
                    color_discrete_map={"confirmed": GOOD, "dismissed": BAD})
        gb.update_layout(height=340, margin=dict(l=10, r=10, t=48, b=10), legend_title=None)
        st.plotly_chart(gb, use_container_width=True)

    conf_mean = lab.loc[lab.user_action == "confirmed", "score_total"].mean()
    dis_mean = lab.loc[lab.user_action == "dismissed", "score_total"].mean()
    if pd.notna(conf_mean) and pd.notna(dis_mean):
        healthy = conf_mean > dis_mean
        (st.success if healthy else st.warning)(
            f"Avg score — confirmed **{conf_mean:.1f}** vs dismissed **{dis_mean:.1f}**: "
            + ("scorer is ranking the right things higher ✔"
               if healthy else "dismissed items score higher than confirmed — weights need attention")
        )

st.divider()

# ---------------------------------------------------------------- raw tables
with st.expander("Raw: recommendation_events"):
    st.dataframe(events, use_container_width=True, height=280)
with st.expander("Raw: redemption_history"):
    st.dataframe(redemptions, use_container_width=True, height=240)
