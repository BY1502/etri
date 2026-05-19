"""Production deployment history store.

Deployment events are append-only JSON lines under the model store volume so
they survive pod restarts without introducing another database for this narrow
audit trail.
"""
from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import fcntl
except Exception:  # pragma: no cover - non-Linux fallback
    fcntl = None


MODEL_STORE_ROOT = Path(os.environ.get("MODEL_STORE_ROOT", "/models"))
HISTORY_ROOT = MODEL_STORE_ROOT / "_deployment_history"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_segment(value: Any, fallback: str) -> str:
    text = str(value or fallback).strip()
    text = re.sub(r"[^A-Za-z0-9._-]+", "-", text).strip(".-")
    if not text or text in {".", ".."}:
        text = fallback
    return text[:120]


def _event_file(namespace: str | None) -> Path:
    return HISTORY_ROOT / _safe_segment(namespace, "default") / "deployment-events.jsonl"


def _clean_dict(data: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in data.items() if v is not None}


def record_event(
    *,
    event_type: str,
    outcome: str,
    model_name: str,
    model_version: str | None = None,
    namespace: str | None = None,
    target_namespace: str | None = None,
    actor: str | None = None,
    previous_version: str | None = None,
    reason: str | None = None,
    result: dict[str, Any] | None = None,
    error: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    event = _clean_dict({
        "event_id": uuid.uuid4().hex,
        "created_at": _now_iso(),
        "event_type": event_type,
        "outcome": outcome,
        "model_name": model_name,
        "model_version": str(model_version) if model_version is not None else None,
        "previous_version": str(previous_version) if previous_version is not None else None,
        "namespace": namespace,
        "target_namespace": target_namespace,
        "actor": actor,
        "reason": reason,
        "error": error,
    })
    if result:
        event.update(_clean_dict({
            "isvc_name": result.get("isvc_name"),
            "isvc_url": result.get("isvc_url") or result.get("url"),
            "pvc_name": result.get("pvc_name"),
            "scale_to_zero": result.get("scale_to_zero"),
            "model_format": result.get("model_format"),
            "isvc_deleted": result.get("isvc_deleted"),
            "pvc_deleted": result.get("pvc_deleted"),
        }))
    if extra:
        event["extra"] = extra

    path = _event_file(namespace)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+", encoding="utf-8") as f:
        if fcntl:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        f.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")
        f.flush()
        os.fsync(f.fileno())
        if fcntl:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
    return event


def _read_events(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    events: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        if fcntl:
            fcntl.flock(f.fileno(), fcntl.LOCK_SH)
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except Exception:
                continue
            if isinstance(item, dict):
                events.append(item)
        if fcntl:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
    return events


def list_events(
    *,
    model_name: str | None = None,
    namespace: str | None = None,
    event_type: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    limit = max(1, min(int(limit or 50), 500))
    if namespace:
        events = _read_events(_event_file(namespace))
    else:
        events = []
        for path in HISTORY_ROOT.glob("*/deployment-events.jsonl"):
            events.extend(_read_events(path))

    if model_name:
        events = [e for e in events if e.get("model_name") == model_name]
    if event_type:
        events = [e for e in events if e.get("event_type") == event_type]
    events.sort(key=lambda e: (str(e.get("created_at") or ""), str(e.get("event_id") or "")), reverse=True)
    return events[:limit]
