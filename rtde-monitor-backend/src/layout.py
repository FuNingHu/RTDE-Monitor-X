"""Persist operator-screen card order and scroll position across robot restarts."""

import json
import os
import re
from pathlib import Path

PATH = Path(os.environ.get("LAYOUT_PATH", "/data/layout.json"))
_ID = re.compile(r"^[a-z0-9-]{1,64}$")
_KEYS = {"registers", "signals"}
_MAX_IDS = 64


def _empty():
    return {"order": [], "scroll": 0, "cards": {}}


def read_layout(key):
    if key not in _KEYS:
        return _empty()
    return _normalize(_load().get(key))


def write_layout(key, layout):
    if key not in _KEYS:
        raise ValueError("Unknown layout")
    clean = _normalize(layout)
    data = _load()
    if clean == _empty():
        data.pop(key, None)
    else:
        data[key] = clean
    PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = PATH.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(data, indent=2), encoding="utf-8")
    temporary.replace(PATH)
    return clean


def _normalize(raw):
    if isinstance(raw, list):
        order = raw
        scroll = 0
    elif isinstance(raw, dict):
        order = raw.get("order", [])
        scroll = raw.get("scroll", 0)
    else:
        return _empty()
    if not isinstance(order, list):
        order = []
    if isinstance(scroll, bool) or not isinstance(scroll, (int, float)):
        scroll = 0
    cards = _cards(raw.get("cards") if isinstance(raw, dict) else None)
    ids = []
    seen = set()
    for item in order:
        if len(ids) >= _MAX_IDS:
            break
        if isinstance(item, str) and item != "" and _ID.fullmatch(item) and item not in seen:
            seen.add(item)
            ids.append(item)
        else:
            # An empty or unknown entry keeps its index so later cards stay in their slots.
            ids.append("")
    return {"order": ids, "scroll": max(0, int(scroll)), "cards": cards}


def _cards(raw):
    if not isinstance(raw, dict):
        return {}
    cards = {}
    for key, value in raw.items():
        if isinstance(key, str) and _ID.fullmatch(key) and isinstance(value, (int, float)) and not isinstance(value, bool):
            top = max(0, int(value))
            if top > 1:
                cards[key] = top
    return cards


def _load():
    try:
        data = json.loads(PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {key: value for key, value in data.items() if key in _KEYS}
