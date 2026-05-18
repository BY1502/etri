"""운영 중 모델의 추론 정확도 추이 모니터링.

사용자가 Ground truth(y_true)와 예측 결과(y_pred)를 업로드하면
SQLite에 저장하고 시간 버킷 단위로 집계된 메트릭을 조회.
"""
import csv
import io
import json
import math
import os
import re
import sqlite3
import threading
import time
import uuid
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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS prediction_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prediction_id TEXT NOT NULL UNIQUE,
                model_name TEXT NOT NULL,
                model_version TEXT,
                namespace TEXT,
                request_url TEXT,
                request_payload TEXT,
                response_body TEXT,
                y_pred REAL,
                ok INTEGER NOT NULL DEFAULT 0,
                status_code INTEGER,
                elapsed_ms INTEGER,
                created_by TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_feedback_model ON feedback(model_name, submitted_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_prediction_model ON prediction_log(model_name, created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_prediction_id ON prediction_log(prediction_id)")
        conn.commit()
        conn.close()


_db_init()

_CSV_PREDICTION_ID_KEYS = {"prediction_id", "predictionid", "pred_id", "id"}
_CSV_Y_TRUE_KEYS = {"y_true", "ytrue", "actual", "actual_value", "ground_truth", "truth", "label", "target"}
_CSV_Y_PRED_KEYS = {"y_pred", "ypred", "prediction", "predicted", "predicted_value", "output"}
_CSV_VERSION_KEYS = {"model_version", "version", "model_ver", "ver"}
_CSV_TASK_KEYS = {"task", "task_type", "type"}


def _csv_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")


def _csv_get(row: dict[str, str], keys: set[str]) -> str:
    for key, value in row.items():
        if _csv_key(key) in keys:
            return str(value or "").strip()
    return ""


def _is_number(value: str) -> bool:
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


def _parse_feedback_csv(csv_text: str) -> tuple[list[dict], list[str]]:
    text = (csv_text or "").lstrip("\ufeff").strip()
    if not text:
        return [], ["CSV 내용이 비어 있습니다"]
    rows = [
        row
        for row in csv.reader(io.StringIO(text))
        if any(str(cell or "").strip() for cell in row)
    ]
    if not rows:
        return [], ["CSV에서 읽을 수 있는 행이 없습니다"]

    known = _CSV_PREDICTION_ID_KEYS | _CSV_Y_TRUE_KEYS | _CSV_Y_PRED_KEYS | _CSV_VERSION_KEYS | _CSV_TASK_KEYS
    first = [_csv_key(cell) for cell in rows[0]]
    has_header = any(cell in known for cell in first)
    parsed: list[dict] = []
    errors: list[str] = []

    if has_header:
        reader = csv.DictReader(io.StringIO(text))
        for line_no, row in enumerate(reader, 2):
            if not row or not any(str(v or "").strip() for v in row.values()):
                continue
            parsed.append({
                "line_no": line_no,
                "prediction_id": _csv_get(row, _CSV_PREDICTION_ID_KEYS),
                "y_true": _csv_get(row, _CSV_Y_TRUE_KEYS),
                "y_pred": _csv_get(row, _CSV_Y_PRED_KEYS),
                "model_version": _csv_get(row, _CSV_VERSION_KEYS),
                "task": _csv_get(row, _CSV_TASK_KEYS),
            })
        return parsed, errors

    for idx, row in enumerate(rows, 1):
        values = [str(cell or "").strip() for cell in row]
        if len(values) < 2:
            errors.append(f"{idx}행: 최소 2개 컬럼이 필요합니다")
            continue
        if _is_number(values[0]):
            parsed.append({
                "line_no": idx,
                "prediction_id": "",
                "y_true": values[0],
                "y_pred": values[1],
                "model_version": values[2] if len(values) > 2 else "",
                "task": values[3] if len(values) > 3 else "",
            })
        else:
            parsed.append({
                "line_no": idx,
                "prediction_id": values[0],
                "y_true": values[1],
                "y_pred": values[2] if len(values) > 2 else "",
                "model_version": values[3] if len(values) > 3 else "",
                "task": values[4] if len(values) > 4 else "",
            })
    return parsed, errors


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_dumps(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False)
    except Exception:
        return json.dumps(str(value), ensure_ascii=False)


def _extract_first_number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        n = float(value)
        return n if math.isfinite(n) else None
    if isinstance(value, str):
        try:
            n = float(value)
            return n if math.isfinite(n) else None
        except ValueError:
            return None
    if isinstance(value, list):
        for item in value:
            n = _extract_first_number(item)
            if n is not None:
                return n
        return None
    if isinstance(value, dict):
        for key in ("data", "predictions", "outputs", "output", "prediction", "values"):
            if key in value:
                n = _extract_first_number(value.get(key))
                if n is not None:
                    return n
        for item in value.values():
            n = _extract_first_number(item)
            if n is not None:
                return n
    return None


def log_prediction(
    *,
    model_name: str,
    model_version: str | None,
    namespace: str | None,
    request_url: str | None,
    request_payload: dict,
    response_body: Any,
    ok: bool,
    status_code: int | None,
    elapsed_ms: int | None,
    created_by: str,
) -> dict:
    prediction_id = f"pred-{uuid.uuid4().hex[:12]}"
    y_pred = _extract_first_number(response_body)
    now = _now()
    with _lock:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.execute(
            """
            INSERT INTO prediction_log (
                prediction_id, model_name, model_version, namespace, request_url,
                request_payload, response_body, y_pred, ok, status_code, elapsed_ms,
                created_by, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                prediction_id,
                model_name,
                str(model_version or ""),
                namespace or "",
                request_url or "",
                _json_dumps(request_payload),
                _json_dumps(response_body),
                y_pred,
                1 if ok else 0,
                status_code,
                elapsed_ms,
                created_by,
                now,
            ),
        )
        conn.commit()
        conn.close()
    return {
        "prediction_id": prediction_id,
        "model_name": model_name,
        "model_version": str(model_version or ""),
        "namespace": namespace or "",
        "y_pred": y_pred,
        "ok": bool(ok),
        "created_at": now,
    }


def recent_predictions(model_name: str, limit: int = 20) -> dict:
    limit = max(1, min(int(limit or 20), 100))
    with _lock:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT
                p.prediction_id, p.model_name, p.model_version, p.namespace,
                p.y_pred, p.ok, p.status_code, p.elapsed_ms, p.created_by, p.created_at,
                EXISTS (
                    SELECT 1 FROM feedback f
                    WHERE f.prediction_id = p.prediction_id
                ) AS has_feedback
            FROM prediction_log p
            WHERE p.model_name = ?
            ORDER BY p.created_at DESC
            LIMIT ?
            """,
            (model_name, limit),
        ).fetchall()
        conn.close()
    return {
        "model_name": model_name,
        "predictions": [
            {
                "prediction_id": row["prediction_id"],
                "model_version": row["model_version"],
                "namespace": row["namespace"],
                "y_pred": row["y_pred"],
                "ok": bool(row["ok"]),
                "status_code": row["status_code"],
                "elapsed_ms": row["elapsed_ms"],
                "created_by": row["created_by"],
                "created_at": row["created_at"],
                "has_feedback": bool(row["has_feedback"]),
            }
            for row in rows
        ],
    }


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


def submit_feedback_csv(
    model_name: str,
    csv_text: str,
    submitted_by: str,
    default_task: str = "regression",
    skip_existing: bool = True,
) -> dict:
    parsed, parse_errors = _parse_feedback_csv(csv_text)
    default_task = str(default_task or "regression").strip().lower()
    if default_task not in ("regression", "classification"):
        default_task = "regression"

    prediction_ids = sorted({str(r.get("prediction_id") or "").strip() for r in parsed if r.get("prediction_id")})
    pred_map: dict[str, sqlite3.Row] = {}
    existing_feedback: set[str] = set()

    if prediction_ids:
        placeholders = ",".join("?" for _ in prediction_ids)
        with _lock:
            conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            pred_rows = conn.execute(
                f"""
                SELECT prediction_id, model_name, model_version, namespace, y_pred
                FROM prediction_log
                WHERE model_name = ? AND prediction_id IN ({placeholders})
                """,
                [model_name, *prediction_ids],
            ).fetchall()
            pred_map = {row["prediction_id"]: row for row in pred_rows}
            if skip_existing:
                fb_rows = conn.execute(
                    f"""
                    SELECT DISTINCT prediction_id
                    FROM feedback
                    WHERE model_name = ? AND prediction_id IN ({placeholders})
                    """,
                    [model_name, *prediction_ids],
                ).fetchall()
                existing_feedback = {row["prediction_id"] for row in fb_rows if row["prediction_id"]}
            conn.close()

    rows = []
    errors = list(parse_errors)
    skipped_duplicate = 0
    skipped_missing_prediction = 0
    skipped_invalid = 0
    now = _now()

    for record in parsed:
        line_no = record.get("line_no", "?")
        prediction_id = str(record.get("prediction_id") or "").strip()
        task = str(record.get("task") or default_task).strip().lower()
        if task not in ("regression", "classification"):
            errors.append(f"{line_no}행: task는 regression 또는 classification이어야 합니다")
            skipped_invalid += 1
            continue
        try:
            y_true = float(record.get("y_true"))
        except (TypeError, ValueError):
            errors.append(f"{line_no}행: y_true가 숫자가 아닙니다")
            skipped_invalid += 1
            continue

        if prediction_id:
            if skip_existing and prediction_id in existing_feedback:
                skipped_duplicate += 1
                continue
            pred_row = pred_map.get(prediction_id)
            if pred_row is None:
                skipped_missing_prediction += 1
                errors.append(f"{line_no}행: prediction_id를 찾을 수 없습니다 ({prediction_id})")
                continue
            y_pred_raw = record.get("y_pred") or pred_row["y_pred"]
            model_version = str(record.get("model_version") or pred_row["model_version"] or "")
        else:
            y_pred_raw = record.get("y_pred")
            model_version = str(record.get("model_version") or "")

        try:
            y_pred = float(y_pred_raw)
        except (TypeError, ValueError):
            errors.append(f"{line_no}행: y_pred가 없거나 숫자가 아닙니다")
            skipped_invalid += 1
            continue

        rows.append((
            model_name,
            model_version,
            task,
            prediction_id,
            y_true,
            y_pred,
            submitted_by,
            now,
        ))

    inserted = 0
    if rows:
        with _lock:
            conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            conn.executemany(
                "INSERT INTO feedback (model_name, model_version, task, prediction_id, y_true, y_pred, submitted_by, submitted_at) VALUES (?,?,?,?,?,?,?,?)",
                rows,
            )
            conn.commit()
            inserted = len(rows)
            conn.close()

    skipped = skipped_duplicate + skipped_missing_prediction + skipped_invalid
    return {
        "inserted": inserted,
        "parsed": len(parsed),
        "skipped": skipped,
        "skipped_duplicate": skipped_duplicate,
        "skipped_missing_prediction": skipped_missing_prediction,
        "skipped_invalid": skipped_invalid,
        "errors": errors[:20],
        "error_count": len(errors),
    }


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
