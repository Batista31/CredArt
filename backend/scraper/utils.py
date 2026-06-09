"""Small file and text helpers shared by the scraper modules."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any


def clean_text(value: str) -> str:
    """Collapse page whitespace so parser patterns remain predictable."""
    return re.sub(r"\s+", " ", value).strip()


def compute_hash(content: str) -> str:
    """Fingerprint snapshots so future ingestion can detect page changes."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def save_html(content: str, path: Path) -> None:
    """Keep the source page beside normalized output for debugging."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def save_json(data: Any, path: Path) -> None:
    """Write stable, readable JSON for later ingestion."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
