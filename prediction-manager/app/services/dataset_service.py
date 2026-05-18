from __future__ import annotations

import csv
import io
import json
import os
import re
import secrets
import shutil
import sqlite3
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi.responses import FileResponse, RedirectResponse

from app.services import tenant_resources

try:
    from PIL import Image, ImageOps, UnidentifiedImageError
except Exception:  # pragma: no cover - handled at runtime with a clear API error.
    Image = None
    ImageOps = None
    UnidentifiedImageError = Exception

DATASET_STORE_ROOT = Path(os.environ.get("DATASET_STORE_ROOT", "/datasets"))
DATASET_CATALOG_DB = Path(os.environ.get("DATASET_CATALOG_DB", str(DATASET_STORE_ROOT / "catalog.db")))
DATASET_INTERNAL_BASE_URL = os.environ.get(
    "DATASET_INTERNAL_BASE_URL",
    "http://prediction-manager.kubeflow.svc.cluster.local",
).rstrip("/")
MAX_DATASET_UPLOAD_BYTES = int(os.environ.get("DATASET_UPLOAD_MAX_BYTES", str(200 * 1024 * 1024)))
SUPPORTED_UPLOAD_EXTS = {".csv", ".json", ".jsonl", ".jpg", ".jpeg", ".png", ".zip"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png"}
VERSION_STATUSES = {"registered", "ready", "published", "deprecated", "archived"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_loads(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _json_dumps(value: Any) -> str:
    return json.dumps(value or {}, ensure_ascii=False, sort_keys=True)


def _safe_name(value: str, fallback: str = "dataset") -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", str(value or "").strip())
    name = re.sub(r"^[._-]+|[._-]+$", "", name)
    return (name or fallback)[:80]


def _version_label(version: int | str) -> str:
    value = str(version)
    return value if value.startswith("v") else f"v{value}"


def _connect() -> sqlite3.Connection:
    DATASET_STORE_ROOT.mkdir(parents=True, exist_ok=True)
    DATASET_CATALOG_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DATASET_CATALOG_DB), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS datasets (
                id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL,
                name TEXT NOT NULL,
                safe_name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                data_type TEXT NOT NULL DEFAULT 'csv',
                task TEXT NOT NULL DEFAULT 'unknown',
                target_column TEXT NOT NULL DEFAULT '',
                created_by TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(namespace, safe_name)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS dataset_versions (
                dataset_id TEXT NOT NULL,
                namespace TEXT NOT NULL,
                version INTEGER NOT NULL,
                source_kind TEXT NOT NULL,
                source_uri TEXT NOT NULL DEFAULT '',
                file_name TEXT NOT NULL DEFAULT '',
                file_path TEXT NOT NULL DEFAULT '',
                data_type TEXT NOT NULL DEFAULT 'csv',
                size_bytes INTEGER NOT NULL DEFAULT 0,
                row_count INTEGER,
                status TEXT NOT NULL DEFAULT 'registered',
                pipeline_ready INTEGER NOT NULL DEFAULT 0,
                download_token TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_by TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                PRIMARY KEY(dataset_id, version),
                FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
            )
            """
        )
        conn.commit()


init_db()


def _dataset_root(namespace: str, safe_name: str) -> Path:
    return DATASET_STORE_ROOT / _safe_name(namespace, "namespace") / safe_name


def _version_root(namespace: str, safe_name: str, version: int) -> Path:
    return _dataset_root(namespace, safe_name) / _version_label(version)


def _row_to_dataset(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "namespace": row["namespace"],
        "name": row["name"],
        "safe_name": row["safe_name"],
        "description": row["description"],
        "data_type": row["data_type"],
        "task": row["task"],
        "target_column": row["target_column"],
        "created_by": row["created_by"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _row_to_version(row: sqlite3.Row, include_token: bool = False) -> dict:
    metadata = _json_loads(row["metadata_json"], {})
    out = {
        "dataset_id": row["dataset_id"],
        "namespace": row["namespace"],
        "version": row["version"],
        "version_label": _version_label(row["version"]),
        "source_kind": row["source_kind"],
        "source_uri": row["source_uri"],
        "file_name": row["file_name"],
        "file_path": row["file_path"],
        "data_type": row["data_type"],
        "size_bytes": row["size_bytes"],
        "row_count": row["row_count"],
        "status": row["status"],
        "pipeline_ready": bool(row["pipeline_ready"]),
        "metadata": metadata,
        "created_by": row["created_by"],
        "created_at": row["created_at"],
    }
    if include_token:
        out["download_token"] = row["download_token"]
    return out


def _write_metadata_file(dataset: dict, version: dict, path: Path) -> None:
    payload = {"dataset": dataset, "version": {k: v for k, v in version.items() if k != "download_token"}}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_json_dumps(payload), encoding="utf-8")


def _zip_image_count(path: Path) -> int:
    try:
        with zipfile.ZipFile(path) as zf:
            return sum(1 for info in zf.infolist() if not info.is_dir() and Path(info.filename).suffix.lower() in IMAGE_EXTS)
    except Exception:
        return 0


def _count_rows_for_file(path: Path, data_type: str) -> int | None:
    try:
        if data_type == "csv":
            with path.open("r", encoding="utf-8-sig", newline="") as f:
                return max(0, sum(1 for _ in csv.DictReader(f)))
        if data_type == "jsonl":
            with path.open("r", encoding="utf-8") as f:
                return sum(1 for line in f if line.strip())
        if data_type == "json":
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return len(data)
            if isinstance(data, dict) and isinstance(data.get("data"), list):
                return len(data["data"])
        if data_type == "image":
            ext = path.suffix.lower()
            if ext == ".zip":
                return _zip_image_count(path)
            if ext in IMAGE_EXTS:
                return 1
    except Exception:
        return None
    return None


def _infer_data_type(file_name: str, fallback: str) -> str:
    ext = Path(file_name or "").suffix.lower()
    if ext == ".csv":
        return "csv"
    if ext == ".json":
        return "json"
    if ext == ".jsonl":
        return "jsonl"
    if ext == ".parquet":
        return "parquet"
    if ext in IMAGE_EXTS:
        return "image"
    if ext == ".zip" and fallback == "image":
        return "image"
    return fallback or "csv"


def _image_metadata(path: Path) -> dict:
    if Image is None:
        return {}
    try:
        with Image.open(path) as img:
            return {"width": img.width, "height": img.height, "format": img.format, "mode": img.mode}
    except Exception:
        return {}


def _uploaded_file_summary(path: Path, data_type: str) -> dict:
    if data_type != "image":
        return {}
    if path.suffix.lower() == ".zip":
        return {"image_count": _zip_image_count(path), "archive": True}
    if path.suffix.lower() in IMAGE_EXTS:
        meta = _image_metadata(path)
        meta.update({"image_count": 1, "archive": False})
        return meta
    return {}


def list_datasets(namespace: str) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM datasets WHERE namespace=? ORDER BY updated_at DESC, name ASC",
            (namespace,),
        ).fetchall()
        out = []
        for row in rows:
            ds = _row_to_dataset(row)
            version_rows = conn.execute(
                "SELECT * FROM dataset_versions WHERE dataset_id=? ORDER BY version DESC",
                (ds["id"],),
            ).fetchall()
            versions = [_row_to_version(v) for v in version_rows]
            ds["latest_version"] = versions[0] if versions else None
            ds["version_count"] = len(versions)
            out.append(ds)
        return out


def create_dataset(namespace: str, user_email: str, payload) -> dict:
    safe = _safe_name(payload.name)
    dataset_id = f"ds-{secrets.token_hex(5)}"
    now = _now()
    try:
        with _connect() as conn:
            conn.execute(
                """
                INSERT INTO datasets(id, namespace, name, safe_name, description, data_type, task, target_column, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    dataset_id,
                    namespace,
                    payload.name.strip(),
                    safe,
                    payload.description or "",
                    payload.data_type,
                    payload.task,
                    payload.target_column or "",
                    user_email,
                    now,
                    now,
                ),
            )
            conn.commit()
    except sqlite3.IntegrityError as e:
        raise ValueError(f"이미 같은 이름의 데이터셋이 있습니다: {payload.name}") from e
    _dataset_root(namespace, safe).mkdir(parents=True, exist_ok=True)
    return get_dataset(namespace, dataset_id)


def get_dataset(namespace: str, dataset_id: str) -> dict:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM datasets WHERE id=? AND namespace=?",
            (dataset_id, namespace),
        ).fetchone()
        if not row:
            raise ValueError("dataset not found")
        ds = _row_to_dataset(row)
        versions = conn.execute(
            "SELECT * FROM dataset_versions WHERE dataset_id=? ORDER BY version DESC",
            (dataset_id,),
        ).fetchall()
        ds["versions"] = [_row_to_version(v) for v in versions]
        return ds


def delete_dataset(namespace: str, dataset_id: str, user_email: str = "") -> dict:
    ds = get_dataset(namespace, dataset_id)
    root = _dataset_root(namespace, ds["safe_name"])
    version_count = len(ds.get("versions", []))
    with _connect() as conn:
        conn.execute(
            "DELETE FROM dataset_versions WHERE dataset_id=? AND namespace=?",
            (dataset_id, namespace),
        )
        deleted = conn.execute(
            "DELETE FROM datasets WHERE id=? AND namespace=?",
            (dataset_id, namespace),
        ).rowcount
        conn.commit()
    if not deleted:
        raise ValueError("dataset not found")
    if root.exists():
        resolved_root = root.resolve()
        resolved_store = DATASET_STORE_ROOT.resolve()
        if resolved_root == resolved_store or resolved_store not in resolved_root.parents:
            raise ValueError("dataset storage path is not safe to delete")
        shutil.rmtree(resolved_root)
    return {
        "deleted": True,
        "dataset_id": dataset_id,
        "name": ds["name"],
        "namespace": namespace,
        "version_count": version_count,
        "deleted_by": user_email,
    }


def _next_version(conn: sqlite3.Connection, dataset_id: str) -> int:
    row = conn.execute(
        "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM dataset_versions WHERE dataset_id=?",
        (dataset_id,),
    ).fetchone()
    return int(row["next_version"])


def _insert_version(
    conn: sqlite3.Connection,
    dataset: dict,
    namespace: str,
    user_email: str,
    *,
    source_kind: str,
    source_uri: str,
    file_name: str,
    file_path: str,
    data_type: str,
    size_bytes: int,
    row_count: int | None,
    pipeline_ready: bool,
    metadata: dict,
    status: str = "registered",
) -> dict:
    version = _next_version(conn, dataset["id"])
    now = _now()
    token = secrets.token_urlsafe(24)
    metadata = dict(metadata or {})
    metadata.setdefault("target_column", dataset.get("target_column", ""))
    metadata.setdefault("lineage", {})
    if status not in VERSION_STATUSES:
        raise ValueError(f"지원하지 않는 version status입니다: {status}")
    conn.execute(
        """
        INSERT INTO dataset_versions(dataset_id, namespace, version, source_kind, source_uri, file_name, file_path, data_type, size_bytes, row_count, status, pipeline_ready, download_token, metadata_json, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            dataset["id"],
            namespace,
            version,
            source_kind,
            source_uri or "",
            file_name or "",
            file_path or "",
            data_type,
            int(size_bytes or 0),
            row_count,
            status,
            1 if pipeline_ready else 0,
            token,
            _json_dumps(metadata),
            user_email,
            now,
        ),
    )
    conn.execute("UPDATE datasets SET updated_at=? WHERE id=?", (now, dataset["id"]))
    row = conn.execute(
        "SELECT * FROM dataset_versions WHERE dataset_id=? AND version=?",
        (dataset["id"], version),
    ).fetchone()
    return _row_to_version(row, include_token=True)


def create_version_from_bytes(
    namespace: str,
    dataset_id: str,
    user_email: str,
    *,
    file_name: str,
    content: bytes,
    source_kind: str = "raw",
    pipeline_ready: bool = False,
    notes: str = "",
    metadata: dict | None = None,
) -> dict:
    if len(content) > MAX_DATASET_UPLOAD_BYTES:
        raise ValueError(f"업로드 파일이 너무 큽니다. 최대 {MAX_DATASET_UPLOAD_BYTES} bytes")
    ext = Path(file_name or "").suffix.lower()
    if ext not in SUPPORTED_UPLOAD_EXTS:
        raise ValueError("업로드는 CSV/JSON/JSONL/JPEG/PNG/ZIP만 지원합니다")
    ds = get_dataset(namespace, dataset_id)
    if ext == ".zip" and ds.get("data_type") != "image":
        raise ValueError("ZIP 업로드는 image 데이터셋에서만 지원합니다")
    data_type = _infer_data_type(file_name, ds["data_type"])
    if data_type == "image" and ext not in IMAGE_EXTS | {".zip"}:
        raise ValueError("image 데이터셋 업로드는 JPEG/PNG/ZIP만 지원합니다")
    with _connect() as conn:
        version = _next_version(conn, dataset_id)
        root = _version_root(namespace, ds["safe_name"], version)
        staging = root.with_name(root.name + f".tmp-{secrets.token_hex(4)}")
        if staging.exists():
            shutil.rmtree(staging)
        staging.mkdir(parents=True, exist_ok=False)
        safe_file = _safe_name(file_name, f"data{ext or '.csv'}")
        data_path = staging / safe_file
        data_path.write_bytes(content)
        row_count = _count_rows_for_file(data_path, data_type)
        meta = dict(metadata or {})
        meta.update({"notes": notes or "", "storage": "pvc", "original_file_name": file_name})
        meta.update(_uploaded_file_summary(data_path, data_type))
        if root.exists():
            shutil.rmtree(root)
        staging.rename(root)
        final_path = root / safe_file
        version_info = _insert_version(
            conn,
            ds,
            namespace,
            user_email,
            source_kind=source_kind,
            source_uri="",
            file_name=safe_file,
            file_path=str(final_path),
            data_type=data_type,
            size_bytes=final_path.stat().st_size,
            row_count=row_count,
            pipeline_ready=pipeline_ready,
            metadata=meta,
        )
        _write_metadata_file(ds, version_info, root / "metadata.json")
        conn.commit()
        return version_info


def create_version_from_uri(namespace: str, dataset_id: str, user_email: str, payload) -> dict:
    ds = get_dataset(namespace, dataset_id)
    file_name = payload.file_name or Path(payload.source_uri.rstrip("/")).name or "external-dataset"
    data_type = _infer_data_type(file_name, ds["data_type"])
    metadata = dict(payload.metadata or {})
    metadata.update({"notes": payload.notes or "", "storage": "external", "original_source_uri": payload.source_uri})
    with _connect() as conn:
        version_info = _insert_version(
            conn,
            ds,
            namespace,
            user_email,
            source_kind=payload.source_kind,
            source_uri=payload.source_uri,
            file_name=file_name,
            file_path="",
            data_type=data_type,
            size_bytes=0,
            row_count=None,
            pipeline_ready=payload.pipeline_ready,
            metadata=metadata,
        )
        root = _version_root(namespace, ds["safe_name"], int(version_info["version"]))
        _write_metadata_file(ds, version_info, root / "metadata.json")
        conn.commit()
        return version_info


def _get_dataset_and_version_by_token(dataset_id: str, version: int, token: str) -> tuple[dict, dict]:
    with _connect() as conn:
        ds_row = conn.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        ver_row = conn.execute(
            "SELECT * FROM dataset_versions WHERE dataset_id=? AND version=?",
            (dataset_id, int(version)),
        ).fetchone()
        if not ds_row or not ver_row:
            raise ValueError("dataset version not found")
        if not token or token != ver_row["download_token"]:
            raise PermissionError("invalid dataset download token")
        return _row_to_dataset(ds_row), _row_to_version(ver_row, include_token=True)


def download_response(dataset_id: str, version: int, token: str):
    _ds, ver = _get_dataset_and_version_by_token(dataset_id, version, token)
    file_path = ver.get("file_path") or ""
    if file_path and Path(file_path).exists():
        return FileResponse(path=file_path, filename=ver.get("file_name") or Path(file_path).name)
    source_uri = ver.get("source_uri") or ""
    if source_uri.startswith(("http://", "https://")):
        return RedirectResponse(source_uri, status_code=307)
    raise FileNotFoundError("dataset file is not available for download")


def _clean_column(value: str) -> str:
    cleaned = re.sub(r"[^0-9A-Za-z가-힣_]+", "_", str(value or "").strip())
    cleaned = re.sub(r"_+", "_", cleaned).strip("_").lower()
    return cleaned or "column"


def _unique_columns(columns: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    out = []
    for col in columns:
        base = _clean_column(col)
        count = seen.get(base, 0)
        seen[base] = count + 1
        out.append(base if count == 0 else f"{base}_{count + 1}")
    return out


def _load_csv_version(ver: dict) -> tuple[list[str], list[dict[str, str]]]:
    path = ver.get("file_path") or ""
    if not path or not Path(path).exists():
        raise ValueError(f"CSV file not found for version v{ver.get('version')}")
    with Path(path).open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), [dict(r) for r in reader]


def _is_float(value: Any) -> bool:
    if value is None or value == "":
        return False
    try:
        float(value)
        return True
    except Exception:
        return False


def _numeric_columns(rows: list[dict[str, str]], columns: list[str], target_column: str = "") -> set[str]:
    nums = set()
    for col in columns:
        if col == target_column:
            continue
        values = [r.get(col, "") for r in rows if r.get(col, "") not in (None, "")]
        if values and all(_is_float(v) for v in values):
            nums.add(col)
    return nums


def preprocess_version(namespace: str, dataset_id: str, version: int, user_email: str, req) -> dict:
    ds = get_dataset(namespace, dataset_id)
    version_numbers = req.source_versions or [int(version)]
    existing = {int(v["version"]): v for v in ds.get("versions", [])}
    all_rows: list[dict[str, str]] = []
    columns: list[str] = []
    source_versions: list[int] = []
    for vnum in version_numbers:
        ver = existing.get(int(vnum))
        if not ver:
            raise ValueError(f"version not found: v{vnum}")
        if ver.get("data_type") != "csv":
            raise ValueError("CSV 전처리는 CSV 버전만 지원합니다")
        fieldnames, rows = _load_csv_version(ver)
        if not columns:
            columns = fieldnames
        elif fieldnames != columns:
            for col in fieldnames:
                if col not in columns:
                    columns.append(col)
        all_rows.extend(rows)
        source_versions.append(int(vnum))
    if not columns:
        raise ValueError("CSV 컬럼이 없습니다")
    if req.clean_columns:
        new_columns = _unique_columns(columns)
        mapping = dict(zip(columns, new_columns))
        all_rows = [{mapping.get(k, k): v for k, v in row.items()} for row in all_rows]
        columns = new_columns
    target_column = ds.get("target_column") or ""
    cleaned_target = _clean_column(target_column) if req.clean_columns and target_column else target_column
    numeric = _numeric_columns(all_rows, columns, cleaned_target)
    if req.fill_missing:
        for row in all_rows:
            for col in columns:
                val = row.get(col)
                if val not in (None, ""):
                    continue
                row[col] = "0" if col in numeric else "unknown"
    if req.normalize_numeric:
        for col in numeric:
            vals = [float(row.get(col) or 0) for row in all_rows]
            if not vals:
                continue
            lo, hi = min(vals), max(vals)
            span = hi - lo
            for row in all_rows:
                val = float(row.get(col) or 0)
                row[col] = "0" if span == 0 else f"{(val - lo) / span:.10g}"
    if req.sample_rows:
        all_rows = all_rows[: int(req.sample_rows)]
    output_name = req.output_name or "preprocessed.csv"
    if not output_name.lower().endswith(".csv"):
        output_name += ".csv"
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns)
    writer.writeheader()
    writer.writerows(all_rows)
    meta = {
        "preprocess": {
            "source_versions": source_versions,
            "clean_columns": bool(req.clean_columns),
            "fill_missing": bool(req.fill_missing),
            "normalize_numeric": bool(req.normalize_numeric),
            "sample_rows": req.sample_rows,
            "row_count": len(all_rows),
        },
        "lineage": {"parent_versions": source_versions, "operation": "csv_preprocess"},
        "target_column": cleaned_target,
        "notes": req.notes or "",
    }
    return create_version_from_bytes(
        namespace,
        dataset_id,
        user_email,
        file_name=output_name,
        content=buffer.getvalue().encode("utf-8"),
        source_kind="preprocessed",
        pipeline_ready=bool(req.pipeline_ready),
        notes=req.notes or "",
        metadata=meta,
    )


def _find_version(ds: dict, version: int) -> dict:
    ver = next((v for v in ds.get("versions", []) if int(v["version"]) == int(version)), None)
    if not ver:
        raise ValueError("dataset version not found")
    return ver


def _image_payloads_from_version(ver: dict) -> list[tuple[str, bytes]]:
    file_path = ver.get("file_path") or ""
    if not file_path or not Path(file_path).exists():
        raise ValueError("이미지 파일이 저장소에 없습니다")
    path = Path(file_path)
    ext = path.suffix.lower()
    if ext in IMAGE_EXTS:
        return [(path.name, path.read_bytes())]
    if ext != ".zip":
        raise ValueError("이미지 표준화는 JPEG/PNG 파일 또는 이미지 ZIP만 지원합니다")
    out = []
    with zipfile.ZipFile(path) as zf:
        for info in zf.infolist():
            if info.is_dir() or Path(info.filename).suffix.lower() not in IMAGE_EXTS:
                continue
            out.append((info.filename, zf.read(info)))
    return out


def _parse_color(value: str) -> tuple[int, int, int]:
    text = (value or "#ffffff").strip()
    if re.match(r"^#[0-9A-Fa-f]{6}$", text):
        return tuple(int(text[i:i + 2], 16) for i in (1, 3, 5))
    if re.match(r"^[0-9]{1,3},[0-9]{1,3},[0-9]{1,3}$", text):
        parts = [max(0, min(255, int(p))) for p in text.split(",")]
        return parts[0], parts[1], parts[2]
    return 255, 255, 255


def _standardized_name(name: str, index: int, ext: str) -> str:
    stem = _safe_name(Path(name).stem, f"image-{index}")
    return f"images/{index:05d}-{stem}{ext}"


def standardize_image_version(namespace: str, dataset_id: str, version: int, user_email: str, req) -> dict:
    if Image is None or ImageOps is None:
        raise ValueError("이미지 표준화에는 Pillow 패키지가 필요합니다")
    ds = get_dataset(namespace, dataset_id)
    ver = _find_version(ds, version)
    if ver.get("data_type") != "image":
        raise ValueError("이미지 표준화는 image 데이터셋 버전만 지원합니다")
    payloads = _image_payloads_from_version(ver)
    if not payloads:
        raise ValueError("표준화할 JPEG/PNG 이미지가 없습니다")
    target_format = (req.target_format or "jpeg").lower()
    pil_format = "JPEG" if target_format == "jpeg" else "PNG"
    out_ext = ".jpg" if target_format == "jpeg" else ".png"
    output_name = req.output_name or "standardized-images.zip"
    if not output_name.lower().endswith(".zip"):
        output_name += ".zip"
    bg = _parse_color(req.background_color)
    ds_root = _dataset_root(namespace, ds["safe_name"])
    with _connect() as conn:
        new_version = _next_version(conn, dataset_id)
        root = _version_root(namespace, ds["safe_name"], new_version)
        staging = root.with_name(root.name + f".tmp-{secrets.token_hex(4)}")
        if staging.exists():
            shutil.rmtree(staging)
        staging.mkdir(parents=True, exist_ok=False)
        zip_name = _safe_name(output_name, "standardized-images.zip")
        zip_path = staging / zip_name
        manifest_path = staging / "manifest.csv"
        rows = []
        failures = []
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for idx, (source_name, content) in enumerate(payloads, start=1):
                try:
                    with Image.open(io.BytesIO(content)) as opened:
                        img = ImageOps.exif_transpose(opened)
                        original = {"width": img.width, "height": img.height, "format": img.format, "mode": img.mode}
                        if req.keep_aspect_ratio:
                            bound = (req.max_width or img.width, req.max_height or img.height)
                            img = img.copy()
                            img.thumbnail(bound)
                        else:
                            img = img.resize((req.max_width or img.width, req.max_height or img.height))
                        if pil_format == "JPEG":
                            canvas = Image.new("RGB", img.size, bg)
                            if img.mode in ("RGBA", "LA"):
                                canvas.paste(img, mask=img.getchannel("A"))
                            else:
                                canvas.paste(img.convert("RGB"))
                            img = canvas
                        elif img.mode not in ("RGB", "RGBA"):
                            img = img.convert("RGBA")
                        out_name = _standardized_name(source_name, idx, out_ext)
                        buf = io.BytesIO()
                        save_kwargs = {"format": pil_format}
                        if pil_format == "JPEG":
                            save_kwargs.update({"quality": int(req.quality), "optimize": True})
                        img.save(buf, **save_kwargs)
                        zf.writestr(out_name, buf.getvalue())
                        rows.append({
                            "source_file": source_name,
                            "file_name": out_name,
                            "width": img.width,
                            "height": img.height,
                            "format": pil_format.lower(),
                            "original_width": original["width"],
                            "original_height": original["height"],
                            "original_format": original.get("format") or "",
                        })
                except (UnidentifiedImageError, OSError, ValueError) as e:
                    failures.append({"source_file": source_name, "error": str(e)})
        if not rows:
            shutil.rmtree(staging)
            raise ValueError("표준화에 성공한 이미지가 없습니다")
        with manifest_path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=["source_file", "file_name", "width", "height", "format", "original_width", "original_height", "original_format"],
            )
            writer.writeheader()
            writer.writerows(rows)
        if root.exists():
            shutil.rmtree(root)
        staging.rename(root)
        final_zip = root / zip_name
        final_manifest = root / "manifest.csv"
        rel_manifest = str(final_manifest.relative_to(ds_root)) if final_manifest.exists() else "manifest.csv"
        meta = {
            "notes": req.notes or "",
            "storage": "pvc",
            "image_count": len(rows),
            "failed_image_count": len(failures),
            "failed_images": failures[:50],
            "manifest_path": str(final_manifest),
            "manifest_relative_path": rel_manifest,
            "standardize": {
                "target_format": target_format,
                "max_width": req.max_width,
                "max_height": req.max_height,
                "keep_aspect_ratio": bool(req.keep_aspect_ratio),
                "background_color": req.background_color,
                "quality": req.quality,
            },
            "lineage": {"parent_versions": [int(version)], "operation": "image_standardize"},
        }
        version_info = _insert_version(
            conn,
            ds,
            namespace,
            user_email,
            source_kind="image_standardized",
            source_uri="",
            file_name=zip_name,
            file_path=str(final_zip),
            data_type="image",
            size_bytes=final_zip.stat().st_size,
            row_count=len(rows),
            pipeline_ready=bool(req.pipeline_ready),
            metadata=meta,
        )
        _write_metadata_file(ds, version_info, root / "metadata.json")
        conn.commit()
        return version_info


def _read_label_studio_export(file_name: str, content: bytes) -> Any:
    ext = Path(file_name or "").suffix.lower()
    text = content.decode("utf-8-sig")
    if ext == ".jsonl":
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    data = json.loads(text)
    return data


def _flatten_label_value(value: Any) -> list[str]:
    labels = []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        for item in value:
            labels.extend(_flatten_label_value(item))
        return labels
    if isinstance(value, dict):
        for key in ("choices", "labels", "rectanglelabels", "polygonlabels", "brushlabels", "keypointlabels", "taxonomy", "text"):
            if key in value:
                labels.extend(_flatten_label_value(value.get(key)))
    return [str(v) for v in labels if str(v)]


def _extract_task_image(data: dict) -> str:
    task_data = data.get("data") if isinstance(data.get("data"), dict) else {}
    for key in ("image", "Image", "img", "url", "path"):
        if task_data.get(key):
            return str(task_data[key])
    for key, value in task_data.items():
        if isinstance(value, str) and any(token in value.lower() for token in (".jpg", ".jpeg", ".png", "http://", "https://")):
            return value
    return ""


def _label_studio_rows(payload: Any) -> tuple[list[dict], dict]:
    if isinstance(payload, dict) and isinstance(payload.get("images"), list) and isinstance(payload.get("annotations"), list):
        categories = {c.get("id"): c.get("name") for c in payload.get("categories", []) if isinstance(c, dict)}
        by_image: dict[Any, list[dict]] = {}
        for ann in payload.get("annotations", []):
            if isinstance(ann, dict):
                by_image.setdefault(ann.get("image_id"), []).append(ann)
        rows = []
        labels = set()
        for image in payload.get("images", []):
            if not isinstance(image, dict):
                continue
            anns = by_image.get(image.get("id"), [])
            image_labels = sorted({str(categories.get(a.get("category_id"), a.get("category_id"))) for a in anns if a.get("category_id") is not None})
            labels.update(image_labels)
            rows.append({
                "task_id": image.get("id", ""),
                "image": image.get("file_name", ""),
                "labels": ";".join(image_labels),
                "annotation_count": len(anns),
                "prediction_count": 0,
                "raw_annotation": json.dumps(anns, ensure_ascii=False),
            })
        return rows, {"format": "coco", "labels": sorted(labels)}

    tasks = payload if isinstance(payload, list) else payload.get("tasks", []) if isinstance(payload, dict) else []
    rows = []
    all_labels = set()
    for idx, task in enumerate(tasks, start=1):
        if not isinstance(task, dict):
            continue
        annotations = task.get("annotations") or task.get("completions") or []
        predictions = task.get("predictions") or []
        labels = []
        for ann in annotations:
            if not isinstance(ann, dict):
                continue
            for result in ann.get("result", []) or []:
                if isinstance(result, dict):
                    labels.extend(_flatten_label_value(result.get("value")))
        cleaned = sorted({str(label) for label in labels if str(label)})
        all_labels.update(cleaned)
        rows.append({
            "task_id": task.get("id", idx),
            "image": _extract_task_image(task),
            "labels": ";".join(cleaned),
            "annotation_count": len(annotations),
            "prediction_count": len(predictions),
            "raw_annotation": json.dumps(annotations, ensure_ascii=False),
        })
    return rows, {"format": "label_studio_tasks", "labels": sorted(all_labels)}


def create_label_studio_export_version(
    namespace: str,
    dataset_id: str,
    source_version: int,
    user_email: str,
    *,
    file_name: str,
    content: bytes,
    output_name: str = "label-studio-export.csv",
    pipeline_ready: bool = True,
    notes: str = "",
) -> dict:
    if len(content) > MAX_DATASET_UPLOAD_BYTES:
        raise ValueError(f"업로드 파일이 너무 큽니다. 최대 {MAX_DATASET_UPLOAD_BYTES} bytes")
    ext = Path(file_name or "").suffix.lower()
    if ext not in {".json", ".jsonl"}:
        raise ValueError("Label Studio export는 JSON 또는 JSONL만 지원합니다")
    ds = get_dataset(namespace, dataset_id)
    _find_version(ds, source_version)
    payload = _read_label_studio_export(file_name, content)
    rows, summary = _label_studio_rows(payload)
    if not rows:
        raise ValueError("Label Studio export에서 task를 찾지 못했습니다")
    output_name = output_name or "label-studio-export.csv"
    if not output_name.lower().endswith(".csv"):
        output_name += ".csv"
    with _connect() as conn:
        new_version = _next_version(conn, dataset_id)
        root = _version_root(namespace, ds["safe_name"], new_version)
        staging = root.with_name(root.name + f".tmp-{secrets.token_hex(4)}")
        if staging.exists():
            shutil.rmtree(staging)
        staging.mkdir(parents=True, exist_ok=False)
        raw_name = _safe_name(file_name, "label-studio-export.json")
        csv_name = _safe_name(output_name, "label-studio-export.csv")
        raw_path = staging / raw_name
        csv_path = staging / csv_name
        raw_path.write_bytes(content)
        with csv_path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["task_id", "image", "labels", "annotation_count", "prediction_count", "raw_annotation"])
            writer.writeheader()
            writer.writerows(rows)
        if root.exists():
            shutil.rmtree(root)
        staging.rename(root)
        final_csv = root / csv_name
        final_raw = root / raw_name
        meta = {
            "notes": notes or "",
            "storage": "pvc",
            "raw_export_file": str(final_raw),
            "label_studio": {
                "format": summary.get("format"),
                "labels": summary.get("labels", []),
                "task_count": len(rows),
                "annotated_task_count": sum(1 for row in rows if int(row.get("annotation_count") or 0) > 0),
            },
            "lineage": {"parent_versions": [int(source_version)], "operation": "label_studio_export"},
        }
        version_info = _insert_version(
            conn,
            ds,
            namespace,
            user_email,
            source_kind="labeling_export",
            source_uri="",
            file_name=csv_name,
            file_path=str(final_csv),
            data_type="csv",
            size_bytes=final_csv.stat().st_size,
            row_count=len(rows),
            pipeline_ready=bool(pipeline_ready),
            metadata=meta,
            status="ready" if pipeline_ready else "registered",
        )
        _write_metadata_file(ds, version_info, root / "metadata.json")
        conn.commit()
        return version_info


def update_version(namespace: str, dataset_id: str, version: int, user_email: str, req) -> dict:
    ds = get_dataset(namespace, dataset_id)
    ver = _find_version(ds, version)
    metadata = dict(ver.get("metadata") or {})
    if req.target_column is not None:
        metadata["target_column"] = req.target_column
    if req.notes is not None:
        metadata["notes"] = req.notes
    if req.metadata:
        metadata.update(req.metadata)
    status = req.status or ver.get("status") or "registered"
    if status not in VERSION_STATUSES:
        raise ValueError(f"지원하지 않는 version status입니다: {status}")
    pipeline_ready = ver.get("pipeline_ready", False) if req.pipeline_ready is None else bool(req.pipeline_ready)
    if status == "published":
        pipeline_ready = True
        metadata["published_at"] = _now()
        metadata["published_by"] = user_email
    with _connect() as conn:
        conn.execute(
            """
            UPDATE dataset_versions
            SET status=?, pipeline_ready=?, metadata_json=?
            WHERE dataset_id=? AND version=? AND namespace=?
            """,
            (status, 1 if pipeline_ready else 0, _json_dumps(metadata), dataset_id, int(version), namespace),
        )
        conn.execute("UPDATE datasets SET updated_at=? WHERE id=?", (_now(), dataset_id))
        row = conn.execute(
            "SELECT * FROM dataset_versions WHERE dataset_id=? AND version=? AND namespace=?",
            (dataset_id, int(version), namespace),
        ).fetchone()
        if not row:
            raise ValueError("dataset version not found")
        version_info = _row_to_version(row)
        root = _version_root(namespace, ds["safe_name"], int(version))
        _write_metadata_file(ds, version_info, root / "metadata.json")
        conn.commit()
        return version_info


def publish_version(namespace: str, dataset_id: str, version: int, user_email: str) -> dict:
    class _Req:
        status = "published"
        pipeline_ready = True
        target_column = None
        notes = None
        metadata = {}

    return update_version(namespace, dataset_id, version, user_email, _Req())


def build_pipeline_inputs(namespace: str, dataset_id: str, version: int, req) -> dict:
    ds = get_dataset(namespace, dataset_id)
    ver = _find_version(ds, version)
    token = _get_download_token(dataset_id, int(version))
    dataset_url = (
        f"{DATASET_INTERNAL_BASE_URL}/api/datasets/{quote(dataset_id)}/versions/{int(version)}/download"
        f"?token={quote(token)}"
    )
    target_column = req.target_column or (ver.get("metadata") or {}).get("target_column") or ds.get("target_column") or "target"
    registered_name = req.registered_name or ds.get("safe_name") or ds.get("name")
    mlflow_uri = tenant_resources.mlflow_tracking_uri(namespace)
    params = {
        "dataset_url": dataset_url,
        "target_column": target_column,
        "threshold": req.threshold,
        "max_attempts": req.max_attempts,
        "registered_name": registered_name,
        "namespace": namespace,
        "mlflow_uri": mlflow_uri,
    }
    return {
        "dataset": {"id": ds["id"], "name": ds["name"], "version": int(version)},
        "pipeline": {
            "name": "weekly-retrain",
            "dsl_file": "examples/weekly_retrain_pipeline.py",
            "yaml_file": "examples/weekly_retrain_pipeline.yaml",
            "upload_method": "Kubeflow Pipelines UI에서 Upload pipeline -> Upload a file 사용",
        },
        "params": params,
        "copy_text": "\n".join(f"{k}: {v}" for k, v in params.items()),
    }


def _get_download_token(dataset_id: str, version: int) -> str:
    with _connect() as conn:
        row = conn.execute(
            "SELECT download_token FROM dataset_versions WHERE dataset_id=? AND version=?",
            (dataset_id, int(version)),
        ).fetchone()
        if not row:
            raise ValueError("dataset version not found")
        return row["download_token"]
