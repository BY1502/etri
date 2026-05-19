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
import secrets
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi.responses import FileResponse

DB_PATH = os.environ.get("AUTOML_DB_PATH", "/data/automl.db")
FEEDBACK_DATASET_ROOT = Path(os.environ.get("FEEDBACK_DATASET_ROOT", "/data/feedback-datasets"))
FEEDBACK_DATASET_INTERNAL_BASE_URL = os.environ.get(
    "DATASET_INTERNAL_BASE_URL",
    "http://prediction-manager.kubeflow.svc.cluster.local",
).rstrip("/")
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




def _percentile(values: list[float], pct: float) -> float | None:
    vals = sorted(float(v) for v in values if v is not None and math.isfinite(float(v)))
    if not vals:
        return None
    if len(vals) == 1:
        return vals[0]
    rank = (len(vals) - 1) * pct
    lo = math.floor(rank)
    hi = math.ceil(rank)
    if lo == hi:
        return vals[int(rank)]
    return vals[lo] + (vals[hi] - vals[lo]) * (rank - lo)


def _latency_stats(values: list[float]) -> dict:
    vals = [float(v) for v in values if v is not None and math.isfinite(float(v))]
    if not vals:
        return {
            "avg_latency_ms": None,
            "p50_latency_ms": None,
            "p95_latency_ms": None,
            "max_latency_ms": None,
        }
    return {
        "avg_latency_ms": sum(vals) / len(vals),
        "p50_latency_ms": _percentile(vals, 0.50),
        "p95_latency_ms": _percentile(vals, 0.95),
        "max_latency_ms": max(vals),
    }


def _monitoring_summary(rows: list[sqlite3.Row]) -> dict:
    request_count = len(rows)
    success_count = sum(1 for row in rows if bool(row["ok"]))
    error_count = request_count - success_count
    status_codes: dict[str, int] = {}
    versions: dict[str, dict] = {}
    latencies: list[float] = []
    for row in rows:
        code = str(row["status_code"] if row["status_code"] is not None else "unknown")
        status_codes[code] = status_codes.get(code, 0) + 1
        version = str(row["model_version"] or "-")
        item = versions.setdefault(version, {"version": version, "request_count": 0, "success_count": 0, "error_count": 0})
        item["request_count"] += 1
        if bool(row["ok"]):
            item["success_count"] += 1
        else:
            item["error_count"] += 1
        if row["elapsed_ms"] is not None:
            latencies.append(float(row["elapsed_ms"]))
    summary = {
        "request_count": request_count,
        "success_count": success_count,
        "error_count": error_count,
        "success_rate": (success_count / request_count) if request_count else None,
        "status_codes": dict(sorted(status_codes.items(), key=lambda item: item[0])),
        "versions": sorted(
            (
                {
                    **item,
                    "success_rate": (item["success_count"] / item["request_count"]) if item["request_count"] else None,
                }
                for item in versions.values()
            ),
            key=lambda item: item["request_count"],
            reverse=True,
        ),
    }
    summary.update(_latency_stats(latencies))
    return summary


def production_metrics(
    model_name: str,
    *,
    namespace: str | None = None,
    hours: int = 72,
    bucket_minutes: int = 60,
    limit: int = 20,
) -> dict:
    hours = max(1, min(int(hours or 72), 24 * 30))
    bucket_minutes = max(1, min(int(bucket_minutes or 60), 24 * 60))
    limit = max(1, min(int(limit or 20), 100))
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    where = ["p.model_name=?", "p.created_at>=?"]
    params: list[Any] = [model_name, cutoff.isoformat()]
    if namespace:
        where.append("(p.namespace=? OR p.namespace='')")
        params.append(namespace)
    with _lock:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            f"""
            SELECT
                p.prediction_id, p.model_name, p.model_version, p.namespace,
                p.y_pred, p.ok, p.status_code, p.elapsed_ms, p.created_by, p.created_at,
                EXISTS (
                    SELECT 1 FROM feedback f
                    WHERE f.prediction_id = p.prediction_id
                ) AS has_feedback
            FROM prediction_log p
            WHERE {' AND '.join(where)}
            ORDER BY p.created_at ASC
            """,
            params,
        ).fetchall()
        conn.close()

    buckets: dict[str, list[sqlite3.Row]] = {}
    for row in rows:
        try:
            bucket = _bucket_iso(row["created_at"], bucket_minutes)
        except Exception:
            continue
        buckets.setdefault(bucket, []).append(row)

    bucket_list = []
    for bucket in sorted(buckets):
        summary = _monitoring_summary(buckets[bucket])
        summary["bucket"] = bucket
        bucket_list.append(summary)

    latest_rows = sorted(rows, key=lambda row: str(row["created_at"] or ""), reverse=True)[:limit]
    return {
        "model_name": model_name,
        "namespace": namespace or "",
        "hours": hours,
        "bucket_minutes": bucket_minutes,
        "overall": _monitoring_summary(rows),
        "buckets": bucket_list,
        "latest": [
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
            for row in latest_rows
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


def list_feedback(model_name: str, limit: int = 50) -> dict:
    limit = max(1, min(int(limit or 50), 200))
    with _lock:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, model_version, task, prediction_id, y_true, y_pred, submitted_by, submitted_at
            FROM feedback
            WHERE model_name = ?
            ORDER BY submitted_at DESC, id DESC
            LIMIT ?
            """,
            (model_name, limit),
        ).fetchall()
        conn.close()
    return {
        "model_name": model_name,
        "feedback": [
            {
                "id": row["id"],
                "model_version": row["model_version"],
                "task": row["task"],
                "prediction_id": row["prediction_id"],
                "y_true": row["y_true"],
                "y_pred": row["y_pred"],
                "submitted_by": row["submitted_by"],
                "submitted_at": row["submitted_at"],
            }
            for row in rows
        ],
    }


def delete_feedback(model_name: str, feedback_id: int) -> int:
    with _lock:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        c = conn.execute(
            "DELETE FROM feedback WHERE model_name=? AND id=?",
            (model_name, feedback_id),
        )
        conn.commit()
        deleted = c.rowcount
        conn.close()
    return deleted


def _safe_segment(value: Any, fallback: str) -> str:
    text = str(value or fallback).strip()
    text = re.sub(r"[^A-Za-z0-9._-]+", "-", text).strip(".-")
    if not text or text in {".", ".."}:
        text = fallback
    return text[:120]


def _flatten_values(value: Any) -> list[Any]:
    if isinstance(value, list):
        out: list[Any] = []
        for item in value:
            out.extend(_flatten_values(item))
        return out
    return [value]


def _coerce_feature_value(value: Any) -> Any:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (str, int, float)) or value is None:
        return value
    return _json_dumps(value)


def _rows_from_instances(instances: Any, feature_columns: list[str]) -> list[dict[str, Any]]:
    if not isinstance(instances, list):
        return []
    rows: list[dict[str, Any]] = []
    for item in instances:
        if isinstance(item, dict):
            rows.append({str(k): _coerce_feature_value(v) for k, v in item.items()})
        elif isinstance(item, list):
            names = feature_columns if len(feature_columns) == len(item) else [f"feature_{i}" for i in range(len(item))]
            rows.append({names[i]: _coerce_feature_value(v) for i, v in enumerate(item)})
        else:
            rows.append({"feature_0": _coerce_feature_value(item)})
    return rows


def _rows_from_kserve_inputs(inputs: Any, feature_columns: list[str]) -> list[dict[str, Any]]:
    if not isinstance(inputs, list) or not inputs:
        return []

    if len(inputs) == 1:
        item = inputs[0] if isinstance(inputs[0], dict) else {}
        data = _flatten_values(item.get("data", []))
        shape = item.get("shape") if isinstance(item.get("shape"), list) else []
        row_count = int(shape[0]) if shape and isinstance(shape[0], int) and shape[0] > 0 else 1
        if row_count > 1 and len(data) % row_count == 0:
            col_count = len(data) // row_count
        else:
            row_count = 1
            col_count = len(data)
        raw_name = str(item.get("name") or "input")
        if feature_columns and len(feature_columns) == col_count:
            names = feature_columns
        elif col_count == 1 and raw_name and not raw_name.startswith("input-"):
            names = [raw_name]
        else:
            names = [f"feature_{i}" for i in range(col_count)]
        rows = []
        for row_idx in range(row_count):
            start = row_idx * col_count
            chunk = data[start:start + col_count]
            rows.append({names[i]: _coerce_feature_value(v) for i, v in enumerate(chunk)})
        return rows

    row_count = 1
    prepared: list[tuple[str, list[Any]]] = []
    for idx, item in enumerate(inputs):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or f"feature_{idx}")
        values = _flatten_values(item.get("data", []))
        shape = item.get("shape") if isinstance(item.get("shape"), list) else []
        if shape and isinstance(shape[0], int) and shape[0] > 0:
            row_count = max(row_count, int(shape[0]))
        else:
            row_count = max(row_count, len(values) or 1)
        prepared.append((name, values))
    rows = [dict() for _ in range(row_count)]
    for name, values in prepared:
        for i in range(row_count):
            value = values[i] if i < len(values) else (values[0] if values else None)
            rows[i][name] = _coerce_feature_value(value)
    return rows


def _feature_rows_from_payload(payload: Any, feature_columns: list[str]) -> list[dict[str, Any]]:
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            return []
    if not isinstance(payload, dict):
        return []
    if isinstance(payload.get("inputs"), list):
        rows = _rows_from_kserve_inputs(payload.get("inputs"), feature_columns)
        if rows:
            return rows
    if isinstance(payload.get("instances"), list):
        rows = _rows_from_instances(payload.get("instances"), feature_columns)
        if rows:
            return rows
    scalar_items = {
        str(k): _coerce_feature_value(v)
        for k, v in payload.items()
        if not isinstance(v, (dict, list))
    }
    return [scalar_items] if scalar_items else []


def _feedback_dataset_dir(model_name: str) -> Path:
    return FEEDBACK_DATASET_ROOT / _safe_segment(model_name, "model")


def feedback_ids(model_name: str) -> list[int]:
    with _lock:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        rows = conn.execute(
            "SELECT id FROM feedback WHERE model_name=? ORDER BY id",
            (model_name,),
        ).fetchall()
        conn.close()
    return [int(row[0]) for row in rows]


def list_feedback_retrain_exports(model_name: str, stale_only: bool = False) -> list[dict]:
    root = _feedback_dataset_dir(model_name)
    if not root.exists():
        return []
    exports = []
    for meta_path in sorted(root.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if stale_only and not metadata.get("stale"):
            continue
        exports.append({k: v for k, v in metadata.items() if k != "token"})
    return exports


def mark_feedback_retrain_exports_stale(
    model_name: str,
    feedback_ids_to_check: list[int],
    *,
    stale_by: str = "",
    force_all: bool = False,
) -> list[dict]:
    root = _feedback_dataset_dir(model_name)
    if not root.exists():
        return []
    deleted_ids = {int(v) for v in feedback_ids_to_check if str(v).strip()}
    stale_exports = []
    for meta_path in sorted(root.glob("*.json")):
        try:
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        source_ids = {int(v) for v in metadata.get("source_feedback_ids") or [] if str(v).strip()}
        matched_ids = sorted(source_ids & deleted_ids)
        should_mark = bool(matched_ids) or (force_all and (metadata.get("model_name") == model_name))
        if not should_mark:
            continue
        existing = {int(v) for v in metadata.get("stale_feedback_ids") or [] if str(v).strip()}
        metadata["stale"] = True
        metadata["stale_reason"] = "feedback_deleted"
        metadata["stale_feedback_ids"] = sorted(existing | set(matched_ids) | (deleted_ids if force_all else set()))
        metadata["stale_at"] = _now()
        metadata["stale_by"] = stale_by
        meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        stale_exports.append({k: v for k, v in metadata.items() if k != "token"})
    return stale_exports


def create_feedback_retrain_dataset(
    *,
    model_name: str,
    model_version: str | None,
    target_column: str,
    feature_columns: list[str] | None = None,
    include_all_versions: bool = False,
    min_rows: int = 1,
    created_by: str = "",
) -> dict:
    target_column = str(target_column or "target").strip() or "target"
    feature_columns = [str(c) for c in (feature_columns or []) if str(c or "").strip()]
    version_filter = str(model_version or "").strip()
    with _lock:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        where = ["f.model_name=?", "f.prediction_id IS NOT NULL", "f.prediction_id != ''"]
        params: list[Any] = [model_name]
        if version_filter and not include_all_versions:
            where.append("(f.model_version=? OR (f.model_version='' AND p.model_version=?))")
            params.extend([version_filter, version_filter])
        rows = conn.execute(
            f"""
            SELECT
                f.id, f.prediction_id, f.model_version AS feedback_version,
                f.task, f.y_true, f.submitted_at,
                p.model_version AS prediction_version,
                p.namespace, p.request_payload, p.created_at AS prediction_at
            FROM feedback f
            JOIN prediction_log p
              ON p.prediction_id = f.prediction_id
             AND p.model_name = f.model_name
            WHERE {' AND '.join(where)}
            ORDER BY f.submitted_at ASC, f.id ASC
            """,
            params,
        ).fetchall()
        conn.close()

    output_rows: list[dict[str, Any]] = []
    used_feedback_ids: list[int] = []
    skipped_no_features = 0
    skipped_multirow_payload = 0
    tasks: set[str] = set()
    versions: set[str] = set()
    for row in rows:
        tasks.add(str(row["task"] or ""))
        version = str(row["feedback_version"] or row["prediction_version"] or "")
        if version:
            versions.add(version)
        feature_rows = _feature_rows_from_payload(row["request_payload"], feature_columns)
        if not feature_rows:
            skipped_no_features += 1
            continue
        if len(feature_rows) > 1:
            skipped_multirow_payload += len(feature_rows) - 1
        features = dict(feature_rows[0])
        features.pop(target_column, None)
        if not features:
            skipped_no_features += 1
            continue
        features[target_column] = row["y_true"]
        output_rows.append(features)
        used_feedback_ids.append(int(row["id"]))

    if len(output_rows) < max(1, int(min_rows or 1)):
        raise ValueError(
            f"재학습 데이터가 부족합니다: {len(output_rows)}건 "
            f"(최소 {max(1, int(min_rows or 1))}건). "
            "운영 테스트 Prediction ID와 실제값 피드백이 연결된 데이터가 필요합니다."
        )

    feature_order = [c for c in feature_columns if c != target_column]
    for row in output_rows:
        for key in row.keys():
            if key != target_column and key not in feature_order:
                feature_order.append(key)
    header = feature_order + [target_column]

    export_id = f"fb-{uuid.uuid4().hex[:12]}"
    token = secrets.token_urlsafe(24)
    root = _feedback_dataset_dir(model_name)
    root.mkdir(parents=True, exist_ok=True)
    csv_path = root / f"{export_id}.csv"
    meta_path = root / f"{export_id}.json"
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=header, extrasaction="ignore")
        writer.writeheader()
        for row in output_rows:
            writer.writerow(row)
    metadata = {
        "export_id": export_id,
        "token": token,
        "model_name": model_name,
        "model_version": version_filter,
        "include_all_versions": include_all_versions,
        "target_column": target_column,
        "feature_columns": feature_order,
        "row_count": len(output_rows),
        "source_feedback_count": len(rows),
        "source_feedback_ids": used_feedback_ids,
        "skipped_no_features": skipped_no_features,
        "skipped_multirow_payload": skipped_multirow_payload,
        "tasks": sorted(t for t in tasks if t),
        "versions": sorted(versions, key=lambda v: (0, int(v)) if str(v).isdigit() else (1, str(v))),
        "created_by": created_by,
        "created_at": _now(),
        "file_name": csv_path.name,
        "size_bytes": csv_path.stat().st_size,
    }
    meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    dataset_url = (
        f"{FEEDBACK_DATASET_INTERNAL_BASE_URL}/api/models/{quote(model_name)}/feedback-datasets/{quote(export_id)}/download"
        f"?token={quote(token)}"
    )
    return {k: v for k, v in {**metadata, "dataset_url": dataset_url, "file_path": str(csv_path)}.items() if k != "token"}


def feedback_retrain_dataset_download_response(model_name: str, export_id: str, token: str):
    safe_export = _safe_segment(export_id, "export")
    root = _feedback_dataset_dir(model_name)
    meta_path = root / f"{safe_export}.json"
    csv_path = root / f"{safe_export}.csv"
    if not meta_path.exists() or not csv_path.exists():
        raise FileNotFoundError("feedback retrain dataset not found")
    metadata = json.loads(meta_path.read_text(encoding="utf-8"))
    if not token or token != metadata.get("token"):
        raise PermissionError("invalid feedback dataset token")
    return FileResponse(
        csv_path,
        media_type="text/csv",
        filename=metadata.get("file_name") or csv_path.name,
    )


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
