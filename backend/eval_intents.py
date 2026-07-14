"""Intent-parser eval — replay golden cases through llm_extract_intent.

Run from backend/ (needs GROQ_API_KEY / GEMINI_API_KEY in .env):

    python eval_intents.py                 # run evals/intent_cases.jsonl
    python eval_intents.py --from-log 20   # print case skeletons from the last 20
                                           # logged parses (review, then append the
                                           # good ones to evals/intent_cases.jsonl)

Each case line: {"message": "...", "expect": {...}}. `expect` keys checked:
  kind / journey_type / card_id / category / urgency  — exact match
  slots_contains — every key must exist in intent.slots and the expected string
                   must appear (case-insensitive) in the actual value

Exit code 1 if any case fails, so this can gate prompt/model changes in CI.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

CASES_PATH = os.path.join(_HERE, "evals", "intent_cases.jsonl")
LOG_PATH = os.path.join(_HERE, "logs", "intent_log.jsonl")

_EXACT_FIELDS = ("kind", "journey_type", "card_id", "category", "urgency")


def _load_jsonl(path: str) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def _check(intent: dict | None, expect: dict) -> list[str]:
    """Returns list of failure descriptions (empty = pass)."""
    if intent is None:
        return ["parser returned None (fell back to heuristic)"]
    fails = []
    for field in _EXACT_FIELDS:
        if field in expect and intent.get(field) != expect[field]:
            fails.append(f"{field}: expected {expect[field]!r}, got {intent.get(field)!r}")
    for key, want in (expect.get("slots_contains") or {}).items():
        got = (intent.get("slots") or {}).get(key)
        if got is None:
            fails.append(f"slots.{key}: missing (expected ~{want!r})")
        elif isinstance(want, str) and want.lower() not in str(got).lower():
            fails.append(f"slots.{key}: expected ~{want!r}, got {got!r}")
    return fails


async def run_eval() -> int:
    from services.llm_service import llm_extract_intent

    cases = _load_jsonl(CASES_PATH)
    passed, failed = 0, []
    for i, case in enumerate(cases, 1):
        message = case["message"]
        intent = await llm_extract_intent(message)
        fails = _check(intent, case.get("expect") or {})
        if fails:
            failed.append((i, message, fails))
            print(f"FAIL [{i:2}] {message!r}")
            for f in fails:
                print(f"          {f}")
        else:
            passed += 1
            print(f"pass [{i:2}] {message!r}")

    print(f"\n{passed}/{len(cases)} passed")
    if failed:
        print(f"{len(failed)} failed — messages: " + "; ".join(repr(m) for _, m, _ in failed))
    return 1 if failed else 0


def from_log(n: int) -> int:
    """Emit the last n logged LLM parses as case skeletons (logged intent becomes
    the expectation — REVIEW before appending: a logged misparse makes a bad golden)."""
    if not os.path.exists(LOG_PATH):
        print(f"no log at {LOG_PATH}", file=sys.stderr)
        return 1
    rows = [r for r in _load_jsonl(LOG_PATH)
            if r.get("intent") and r.get("path") in ("groq", "gemini")]
    for r in rows[-n:]:
        intent = r["intent"]
        expect = {k: intent[k] for k in _EXACT_FIELDS if intent.get(k) not in (None, False)}
        if intent.get("slots"):
            expect["slots_contains"] = {k: v for k, v in intent["slots"].items()
                                        if isinstance(v, str)}
        print(json.dumps({"message": r["message"], "expect": expect}, ensure_ascii=False))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--from-log", type=int, metavar="N", default=None,
                    help="print case skeletons from the last N logged parses and exit")
    args = ap.parse_args()
    if args.from_log is not None:
        return from_log(args.from_log)
    return asyncio.run(run_eval())


if __name__ == "__main__":
    sys.exit(main())
