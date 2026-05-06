"""운영 중 모델의 추론 정확도 추이 모니터링.

사용자가 Ground truth(y_true)와 예측 결과(y_pred)를 업로드하면
SQLite에 저장하고 시간 버킷 단위로 집계된 메트릭을 조회.
"""
import json
import math
import os
import sqlite3
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import Any

DB_PATH = os.environ.get("AUTOML_DB_PATH", "/data/automl.db")
_lock = threading.Lock()


def _db_init() -> None:
    with _lock:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_name TEXT NOT NULL,
                model_version TEXT,
                task TEXT NOT NULL,
                prediction_id TEXT,
                y_true REAL,
                y_pred REAL,
                submitted_by TEXT,
                submitted_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_feedback_model ON feedback(model_name, submitted_at)")
        conn.commit()
        conn.close()


_db_init()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def submit_feedback(
    model_name: str,
    entries: list[dict],
    submitted_by: str,
) -> dict:
    """
    entries: [{task: 'regression'|'classification', y_true: num, y_pred: num,
               model_version?: str, prediction_id?: str}]
    """
    if not entries:
        return {"inserted": 0}
    rows = []
    now = _now()
    for e in entries:
        if "y_true" not in e or "y_pred" not in e or "task" not in e:
            continue
        try:
            yt = float(e["y_true"])
            yp = float(e["y_pred"])
        except (TypeError, ValueError):
            continue
        rows.append((
            model_name,
            str(e.get("model_version") or ""),
            e["task"],
            str(e.get("prediction_id") or ""),
            yt,
            yp,
            submitted_by,
            now,
        ))
    if not rows:
        return {"inserted": 0}
    with _lock:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.executemany(
            "INSERT INTO feedback (model_name, model_version, task, prediction_id, y_true, y_pred, submitted_by, submitted_at) VALUES (?,?,?,?,?,?,?,?)",
            rows,
        )
        conn.commit()
        conn.close()
    return {"inserted": len(rows)}


def _bucket_iso(ts_iso: str, bucket_minutes: int) -> str:
    t = datetime.fromisoformat(ts_iso)
    total_min = t.minute + t.hour * 60
    snap = (total_min // bucket_minutes) * bucket_minutes
    t = t.replace(minute=0, second=0, microsecond=0) + timedelta(minutes=snap - t.hour * 60)
    return t.isoformat()


def _compute_metrics(task: str, y_true: list[float], y_pred: list[float]) -> dict:
    if not y_true:
        return {}
    n = len(y_true)
    if task == "regression":
        diffs = [a - b for a, b in zip(y_true, y_pred)]
        mse = sum(d * d for d in diffs) / n
        mae = sum(abs(d) for d in diffs) / n
        mean = sum(y_true) / n
        ss_tot = sum((a - mean) ** 2 for a in y_true) or 1.0
        ss_res = sum(d * d for d in diffs)
        return {
            "n": n,
            "mse": mse,
            "rmse": math.sqrt(mse),
            "mae": mae,
            "r2": 1 - ss_res / ss_tot,
        }
    # classification (binary/multiclass, 정수로 간주)
    correct = sum(1 for a, b in zip(y_true, y_pred) if round(a) == round(b))
    return {"n": n, "accuracy": correct / n}


def accuracy_history(
    model_name: str,
    hours: int = 24,
    bucket_minutes: int = 60,
) -> dict:
    with _lock:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        rows = conn.execute(
            "SELECT task, y_true, y_pred, submitted_at, model_version FROM feedback WHERE model_name=? ORDER BY submitted_at",
            (model_name,),
        ).fetchall()
        conn.close()
    if not rows:
        return {"model_name": model_name, "buckets": [], "overall": {}, "task": None}

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    task = rows[0][0]
    buckets: dict[str, dict] = {}
    all_yt, all_yp = [], []
    for (tk, yt, yp, ts, ver) in rows:
        try:
            t = datetime.fromisoformat(ts)
        except Exception:
            continue
        if t < cutoff:
            continue
        all_yt.append(yt)
        all_yp.append(yp)
        bk = _bucket_iso(ts, bucket_minutes)
        b = buckets.setdefault(bk, {"y_true": [], "y_pred": [], "versions": set()})
        b["y_true"].append(yt)
        b["y_pred"].append(yp)
        if ver:
            b["versions"].add(ver)

    bucket_list = []
    for bk in sorted(buckets.keys()):
        b = buckets[bk]
        m = _compute_metrics(task, b["y_true"], b["y_pred"])
        m["bucket"] = bk
        m["versions"] = sorted(b["versions"])
        bucket_list.append(m)

    overall = _compute_metrics(task, all_yt, all_yp)
    return {
        "model_name": model_name,
        "task": task,
        "bucket_minutes": bucket_minutes,
        "hours": hours,
        "buckets": bucket_list,
        "overall": overall,
    }


def clear_feedback(model_name: str) -> int:
    with _lock:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        c = conn.execute("DELETE FROM feedback WHERE model_name=?", (model_name,))
        conn.commit()
        deleted = c.rowcount
        conn.close()
    return deleted
