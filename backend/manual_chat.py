"""Interactive conversation tester — talk to CredArt like a real user.

Hits the live POST /chat endpoint with a persistent session, so you get the FULL
experience: intent extraction -> follow-up questions -> recommendations. Use this
to test the multi-turn questioning ("where to? how many people?"). Contrast with
manual_test.py, which skips the questions to show ranking only.

Requires both servers running (MCP :8000 and API :8001).

Usage (from backend/):
    .venv\\Scripts\\python manual_chat.py riya
    .venv\\Scripts\\python manual_chat.py samyak

Then just type. Examples to try:
    you> i want to have a nice vacation
    you> Goa
    you> next month, 2 of us, economy
Type 'quit', 'exit', or Ctrl-C to stop. Type 'new' to start a fresh session.
"""

from __future__ import annotations

import json
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

API = "http://localhost:8001/chat"
USERS = {
    "riya":   "00000000-0000-0000-0000-000000000002",  # travel-leaning
    "samyak": "00000000-0000-0000-0000-000000000001",  # dining-leaning
}


def post(user_id: str, message: str, session_id: str | None) -> dict:
    body = {"user_id": user_id, "message": message}
    if session_id:
        body["session_id"] = session_id
    req = urllib.request.Request(
        API, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def show(d: dict) -> None:
    i = d["intent"]
    cands = d["candidates"]
    # Still gathering info -> the reply IS the follow-up question.
    if not i["is_complete"]:
        print(f"\nCredArt> {d['reply']}\n")
        return
    # Complete -> reply + the ranked recommendations.
    print(f"\nCredArt> {d['reply']}\n")
    if cands:
        print(f"         {'#':>2}  {'CATEGORY':13} {'LABEL':32} {'PTS':>7}  SCORE")
        for c in cands:
            pts = c["points_cost"] if c["points_cost"] is not None else ""
            print(f"         {c['rank']:>2}  {(c['category'] or '-'):13} "
                  f"{(c['label'] or '')[:32]:32} {str(pts):>7}  {c['score_total']}")
    print()


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1].lower() not in USERS:
        print(__doc__)
        sys.exit(1)
    who = sys.argv[1].lower()
    user_id = USERS[who]
    session_id: str | None = None

    print(f"\nCredArt — chatting as {who.upper()} "
          f"({'travel' if who == 'riya' else 'dining'}-leaning). "
          f"Type 'quit' to exit, 'new' to reset the conversation.\n")

    while True:
        try:
            message = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not message:
            continue
        if message.lower() in ("quit", "exit"):
            break
        if message.lower() == "new":
            session_id = None
            print("\n(new session)\n")
            continue
        try:
            d = post(user_id, message, session_id)
        except Exception as e:
            print(f"\n[error talking to API at {API}: {e}]")
            print("[is the server running? .venv\\Scripts\\python -m uvicorn api.main:app --port 8001]\n")
            continue
        session_id = d["session_id"]
        show(d)


if __name__ == "__main__":
    main()
