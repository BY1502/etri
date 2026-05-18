"""Operational model repository layer.

MLflow remains the experiment/registry source of truth, while this module
materializes registered model artifacts into a predictable filesystem layout:

    /models/<project>/<model_name>/v<version>

The root is expected to be a mounted volume in production.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import mlflow


MODEL_STORE_ROOT = Path(os.environ.get("MODEL_STORE_ROOT", "/models"))
MODEL_STORE_BACKEND = os.environ.get("MODEL_STORE_BACKEND", "local")
MODEL_STORE_ENABLED = os.environ.get("MODEL_STORE_ENABLED", "true").lower() not in {
    "0",
    "false",
    "no",
}
MODEL_STORE_STRICT = os.environ.get("MODEL_STORE_STRICT", "false").lower() in {
    "1",
    "true",
    "yes",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_segment(value: Any, fallback: str) -> str:
    text = str(value or fallback).strip()
    text = re.sub(r"[^A-Za-z0-9._-]+", "-", text).strip(".-")
    if not text or text in {".", ".."}:
        text = fallback
    return text[:120]


def _version_label(version: str | int) -> str:
    text = str(version).strip()
    return text if text.startswith("v") else f"v{text}"


def _project_slug(project: str | None, namespace: str | None = None) -> str:
    return _safe_segment(project or namespace or "default", "default")


def version_dir(
    model_name: str,
    version: str | int,
    *,
    project: str | None = None,
    namespace: str | None = None,
) -> Path:
    return (
        MODEL_STORE_ROOT
        / _project_slug(project, namespace)
        / _safe_segment(model_name, "model")
        / _version_label(version)
    )


def _fetch_run_metadata(mlflow_uri: str, run_id: str | None) -> dict:
    if not run_id:
        return {"metrics": {}, "params": {}, "tags": {}, "run_info": {}}
    try:
        resp = httpx.get(
            f"{mlflow_uri}/api/2.0/mlflow/runs/get",
            params={"run_id": run_id},
            timeout=15,
        )
        resp.raise_for_status()
        run = resp.json().get("run", {})
        data = run.get("data", {})
        info = run.get("info", {})
        return {
            "metrics": {m.get("key"): m.get("value") for m in data.get("metrics", []) if m.get("key")},
            "params": {p.get("key"): p.get("value") for p in data.get("params", []) if p.get("key")},
            "tags": {t.get("key"): t.get("value") for t in data.get("tags", []) if t.get("key")},
            "run_info": info,
        }
    except Exception:
        return {"metrics": {}, "params": {}, "tags": {}, "run_info": {}}


def _copy_artifact_tree(src: Path, dst: Path) -> None:
    if src.is_dir():
        for child in src.iterdir():
            target = dst / child.name
            if child.is_dir():
                shutil.copytree(child, target)
            else:
                shutil.copy2(child, target)
    else:
        shutil.copy2(src, dst / src.name)


def _copy_dir_contents(src: Path, dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    for child in src.iterdir():
        target = dst / child.name
        if child.is_dir():
            shutil.copytree(child, target, dirs_exist_ok=True)
        else:
            shutil.copy2(child, target)


def _summarize_files(path: Path) -> dict:
    total_bytes = 0
    file_count = 0
    sample: list[str] = []
    if path.exists():
        for item in path.rglob("*"):
            if not item.is_file():
                continue
            rel = item.relative_to(path).as_posix()
            if rel == "metadata.json":
                continue
            file_count += 1
            try:
                total_bytes += item.stat().st_size
            except OSError:
                pass
            if len(sample) < 50:
                sample.append(rel)
    return {
        "artifact_file_count": file_count,
        "artifact_bytes": total_bytes,
        "artifact_files_sample": sample,
    }


def _write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _set_model_version_tags(
    mlflow_uri: str,
    model_name: str,
    version: str | int,
    tags: dict[str, Any],
) -> None:
    for key, value in tags.items():
        httpx.post(
            f"{mlflow_uri}/api/2.0/mlflow/model-versions/set-tag",
            json={
                "name": model_name,
                "version": str(version),
                "key": key,
                "value": "" if value is None else str(value),
            },
            timeout=15,
        ).raise_for_status()


def _extract_zip_safe(zip_path: Path, dst: Path) -> None:
    root = dst.resolve()
    with zipfile.ZipFile(zip_path) as zf:
        for member in zf.infolist():
            target = (dst / member.filename).resolve()
            if not target.is_relative_to(root):
                raise ValueError("zip 파일에 허용되지 않는 경로가 포함되어 있습니다")
        zf.extractall(dst)


def _find_artifact_root(path: Path) -> Path:
    if (path / "MLmodel").is_file():
        return path
    direct_dirs = [p for p in path.iterdir() if p.is_dir()]
    for candidate in direct_dirs:
        if (candidate / "MLmodel").is_file():
            return candidate
    if len(direct_dirs) == 1:
        return direct_dirs[0]
    return path


def _prepare_uploaded_artifact(upload_path: Path, filename: str, metadata: dict, work_dir: Path) -> Path:
    artifact_dir = work_dir / "artifact"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(filename).suffix.lower()

    if suffix == ".zip" or zipfile.is_zipfile(upload_path):
        extracted = work_dir / "extracted"
        extracted.mkdir(parents=True, exist_ok=True)
        _extract_zip_safe(upload_path, extracted)
        _copy_dir_contents(_find_artifact_root(extracted), artifact_dir)
    else:
        if suffix == ".onnx":
            target_name = "model.onnx"
        elif suffix in {".joblib", ".pkl", ".pickle"}:
            target_name = "model.joblib" if suffix == ".joblib" else "model.pkl"
        else:
            target_name = _safe_segment(filename, "model.bin")
        shutil.copy2(upload_path, artifact_dir / target_name)

    columns = metadata.get("columns") or metadata.get("features")
    if isinstance(columns, list) and columns and not (artifact_dir / "features.json").exists():
        _write_json(
            artifact_dir / "features.json",
            {
                "columns": columns,
                "target": metadata.get("dataset_target") or (metadata.get("dataset") or {}).get("target"),
            },
        )
    return artifact_dir


def _metric_values(raw: dict | None) -> dict[str, float]:
    out: dict[str, float] = {}
    for key, value in (raw or {}).items():
        try:
            out[str(key)] = float(value)
        except (TypeError, ValueError):
            continue
    return out


def _string_values(raw: dict | None) -> dict[str, str]:
    return {
        str(key): "" if value is None else str(value)
        for key, value in (raw or {}).items()
    }


def register_uploaded_model(
    *,
    mlflow_uri: str,
    upload_path: str | Path,
    filename: str,
    model_name: str,
    namespace: str,
    creator: str,
    metadata: dict | None = None,
) -> dict:
    """Register a user-uploaded artifact as an MLflow model version.

    No extra multipart dependency is required by the API layer; callers pass a
    local temp file produced from the raw request body.
    """
    metadata = dict(metadata or {})
    model_name = _safe_segment(model_name, "uploaded-model")
    filename = filename or "model.bin"
    framework = metadata.get("framework") or ""
    framework_version = metadata.get("framework_version") or metadata.get("framework.version") or ""
    dataset = metadata.get("dataset") if isinstance(metadata.get("dataset"), dict) else {}
    metrics = _metric_values(metadata.get("metrics") if isinstance(metadata.get("metrics"), dict) else {})
    params = _string_values(metadata.get("params") if isinstance(metadata.get("params"), dict) else {})
    custom_tags = _string_values(metadata.get("tags") if isinstance(metadata.get("tags"), dict) else {})

    dataset_id = metadata.get("dataset_id") or dataset.get("id") or ""
    dataset_path = metadata.get("dataset_path") or dataset.get("path") or ""
    dataset_rows = metadata.get("dataset_rows") or dataset.get("rows") or ""
    dataset_target = metadata.get("dataset_target") or dataset.get("target") or ""
    task = metadata.get("task") or ""

    mlflow.set_tracking_uri(mlflow_uri)
    experiment_name = f"models-{namespace}-uploads"
    mlflow.set_experiment(experiment_name)

    run_tags = {
        "created_by": creator,
        "upload.source": "api",
        "upload.filename": filename,
        "framework": framework,
        "framework.version": framework_version,
        "dataset.id": dataset_id,
        "dataset.path": dataset_path,
        "dataset.rows": str(dataset_rows) if dataset_rows != "" else "",
        "dataset.target": dataset_target,
        "automl.task": task,
        **custom_tags,
    }
    run_tags = {k: v for k, v in run_tags.items() if v not in (None, "")}

    with tempfile.TemporaryDirectory(prefix="model-upload-register-") as tmp:
        artifact_dir = _prepare_uploaded_artifact(Path(upload_path), filename, metadata, Path(tmp))
        with mlflow.start_run(run_name=f"upload-{model_name}") as run:
            mlflow.set_tags(run_tags)
            if params:
                mlflow.log_params(params)
            for key, value in metrics.items():
                mlflow.log_metric(key, value)
            mlflow.log_artifacts(str(artifact_dir), artifact_path="model")
            run_id = run.info.run_id

    source_uri = f"runs:/{run_id}/model"
    model_tags = [
        {"key": key, "value": value}
        for key, value in {
            "created_by": creator,
            "upload.source": "api",
            "framework": framework,
            "framework.version": framework_version,
            "dataset.id": dataset_id,
            "dataset.target": dataset_target,
            "automl.task": task,
        }.items()
        if value not in (None, "")
    ]

    try:
        httpx.post(
            f"{mlflow_uri}/api/2.0/mlflow/registered-models/create",
            json={"name": model_name, "tags": model_tags},
            timeout=15,
        )
    except Exception:
        pass

    vr = httpx.post(
        f"{mlflow_uri}/api/2.0/mlflow/model-versions/create",
        json={
            "name": model_name,
            "source": source_uri,
            "run_id": run_id,
            "tags": model_tags,
        },
        timeout=20,
    )
    vr.raise_for_status()
    version = vr.json().get("model_version", {}).get("version")
    if metadata.get("description") and version:
        try:
            httpx.post(
                f"{mlflow_uri}/api/2.0/mlflow/model-versions/update",
                json={"name": model_name, "version": str(version), "description": str(metadata["description"])},
                timeout=15,
            )
        except Exception:
            pass

    repository = None
    if version:
        repository = materialize_mlflow_model_version(
            mlflow_uri=mlflow_uri,
            model_name=model_name,
            version=version,
            source_uri=source_uri,
            run_id=run_id,
            project=namespace,
            namespace=namespace,
            creator=creator,
            extra_metadata={
                "upload": {
                    "filename": filename,
                    "content_type": metadata.get("content_type"),
                    "description": metadata.get("description"),
                },
            },
        )

    return {
        "status": "ok",
        "name": model_name,
        "version": version,
        "run_id": run_id,
        "source": source_uri,
        "repository": repository,
    }


def _is_under_root(path: Path) -> bool:
    try:
        return path.resolve().is_relative_to(MODEL_STORE_ROOT.resolve())
    except Exception:
        return False


def materialize_mlflow_model_version(
    *,
    mlflow_uri: str,
    model_name: str,
    version: str | int,
    source_uri: str,
    run_id: str | None,
    project: str | None = None,
    namespace: str | None = None,
    creator: str | None = None,
    extra_metadata: dict | None = None,
) -> dict:
    """Download an MLflow model artifact into the standard model store path.

    Returns repository metadata suitable for API responses and MLflow tags.
    """
    if not MODEL_STORE_ENABLED:
        return {"status": "disabled", "backend": MODEL_STORE_BACKEND}

    project_name = project or namespace or "default"
    final_dir = version_dir(model_name, version, project=project_name, namespace=namespace)
    parent = final_dir.parent
    parent.mkdir(parents=True, exist_ok=True)

    run_meta = _fetch_run_metadata(mlflow_uri, run_id)
    tags = run_meta.get("tags", {})
    synced_at = _now_iso()

    with tempfile.TemporaryDirectory(prefix="model-repo-download-") as download_tmp:
        mlflow.set_tracking_uri(mlflow_uri)
        local_artifact = Path(
            mlflow.artifacts.download_artifacts(
                artifact_uri=source_uri,
                dst_path=download_tmp,
            )
        )

        staging = Path(tempfile.mkdtemp(prefix=f".{final_dir.name}.", dir=str(parent)))
        backup: Path | None = None
        try:
            _copy_artifact_tree(local_artifact, staging)
            summary = _summarize_files(staging)
            metadata = {
                "schema_version": 1,
                "model_name": model_name,
                "version": _version_label(version),
                "mlflow_version": str(version),
                "project": project_name,
                "namespace": namespace,
                "created_by": creator or tags.get("created_by") or tags.get("converted_by") or "",
                "created_at": synced_at,
                "framework": {
                    "name": tags.get("framework", ""),
                    "version": tags.get("framework.version", ""),
                },
                "dataset": {
                    "id": tags.get("dataset.id", ""),
                    "path": tags.get("dataset.path", ""),
                    "rows": tags.get("dataset.rows", ""),
                    "target": tags.get("dataset.target", ""),
                },
                "source": {
                    "type": "mlflow",
                    "uri": source_uri,
                    "run_id": run_id,
                    "tracking_uri": mlflow_uri,
                },
                "storage": {
                    "backend": MODEL_STORE_BACKEND,
                    "root": str(MODEL_STORE_ROOT),
                    "path": str(final_dir),
                    "metadata_path": str(final_dir / "metadata.json"),
                },
                "metrics": run_meta.get("metrics", {}),
                "params": run_meta.get("params", {}),
                "tags": tags,
                **summary,
            }
            if extra_metadata:
                metadata["extra"] = extra_metadata
            _write_json(staging / "metadata.json", metadata)

            if final_dir.exists():
                backup = parent / f".{final_dir.name}.bak-{uuid.uuid4().hex[:8]}"
                final_dir.rename(backup)
            staging.rename(final_dir)
            if backup:
                shutil.rmtree(backup, ignore_errors=True)
        except Exception:
            shutil.rmtree(staging, ignore_errors=True)
            if backup and backup.exists() and not final_dir.exists():
                backup.rename(final_dir)
            raise

    repo = {
        "status": "synced",
        "backend": MODEL_STORE_BACKEND,
        "root": str(MODEL_STORE_ROOT),
        "project": _project_slug(project_name, namespace),
        "path": str(final_dir),
        "version": _version_label(version),
        "metadata_path": str(final_dir / "metadata.json"),
        "source_uri": source_uri,
        "synced_at": synced_at,
    }
    repo.update(_summarize_files(final_dir))

    try:
        _set_model_version_tags(
            mlflow_uri,
            model_name,
            version,
            {
                "repository.status": repo["status"],
                "repository.backend": repo["backend"],
                "repository.root": repo["root"],
                "repository.project": repo["project"],
                "repository.path": repo["path"],
                "repository.version": repo["version"],
                "repository.metadata_path": repo["metadata_path"],
                "repository.source_uri": source_uri,
                "repository.synced_at": synced_at,
            },
        )
        repo["tag_status"] = "synced"
    except Exception as tag_error:
        repo["tag_status"] = "failed"
        repo["tag_error"] = str(tag_error)
        if MODEL_STORE_STRICT:
            raise
    return repo


def mark_sync_failed(
    *,
    mlflow_uri: str,
    model_name: str,
    version: str | int,
    error: Exception | str,
) -> dict:
    msg = str(error)
    if len(msg) > 500:
        msg = msg[:500] + "...(truncated)"
    repo = {
        "status": "failed",
        "backend": MODEL_STORE_BACKEND,
        "root": str(MODEL_STORE_ROOT),
        "error": msg,
        "synced_at": _now_iso(),
    }
    try:
        _set_model_version_tags(
            mlflow_uri,
            model_name,
            version,
            {
                "repository.status": "failed",
                "repository.backend": MODEL_STORE_BACKEND,
                "repository.root": str(MODEL_STORE_ROOT),
                "repository.error": msg,
                "repository.synced_at": repo["synced_at"],
            },
        )
    except Exception:
        pass
    return repo


def repository_info_from_tags(tags: dict[str, Any]) -> dict | None:
    path_text = tags.get("repository.path")
    status = tags.get("repository.status")
    if not path_text and not status:
        return None

    info = {
        "status": status or "unknown",
        "backend": tags.get("repository.backend") or MODEL_STORE_BACKEND,
        "root": tags.get("repository.root") or str(MODEL_STORE_ROOT),
        "project": tags.get("repository.project"),
        "path": path_text,
        "version": tags.get("repository.version"),
        "metadata_path": tags.get("repository.metadata_path"),
        "source_uri": tags.get("repository.source_uri"),
        "synced_at": tags.get("repository.synced_at"),
        "error": tags.get("repository.error"),
        "exists": False,
        "metadata": None,
    }
    if path_text:
        path = Path(path_text)
        info["exists"] = path.exists() and _is_under_root(path)
        metadata_path = path / "metadata.json"
        if info["exists"] and metadata_path.is_file():
            try:
                info["metadata"] = json.loads(metadata_path.read_text(encoding="utf-8"))
            except Exception:
                info["metadata"] = None
    return info


def delete_repository_paths(versions: list[dict]) -> list[str]:
    """Best-effort removal of materialized repository folders for model versions."""
    deleted: list[str] = []
    for version in versions:
        repo = version.get("repository") or repository_info_from_tags(version.get("tags") or {})
        path_text = (repo or {}).get("path")
        if not path_text:
            continue
        path = Path(path_text)
        if not _is_under_root(path):
            continue
        try:
            if path.exists():
                shutil.rmtree(path)
                deleted.append(str(path))
                model_dir = path.parent
                project_dir = model_dir.parent
                for candidate in (model_dir, project_dir):
                    try:
                        candidate.rmdir()
                    except OSError:
                        pass
        except Exception:
            continue
    return deleted


def check_version_consistency(version: dict, *, model_name: str, project: str | None = None, namespace: str | None = None) -> dict:
    """Compare registry metadata with the materialized repository files."""
    version_id = str(version.get("version", ""))
    repo = version.get("repository") or repository_info_from_tags(version.get("tags") or {}) or {}
    expected_path = version_dir(
        model_name,
        version_id,
        project=repo.get("project") or project,
        namespace=namespace,
    )
    path = Path(repo.get("path") or expected_path)
    issues: list[str] = []
    checks: dict[str, bool] = {}

    checks["repository_tag"] = bool(repo)
    if not checks["repository_tag"]:
        issues.append("repository tag 없음")

    checks["path_under_root"] = _is_under_root(path)
    if not checks["path_under_root"]:
        issues.append("repository path가 MODEL_STORE_ROOT 밖에 있음")

    checks["path_exists"] = checks["path_under_root"] and path.exists() and path.is_dir()
    if not checks["path_exists"]:
        issues.append("repository path 없음")

    metadata_path = path / "metadata.json"
    checks["metadata_exists"] = checks["path_exists"] and metadata_path.is_file()
    metadata = None
    if checks["metadata_exists"]:
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            checks["metadata_parseable"] = True
        except Exception:
            checks["metadata_parseable"] = False
            issues.append("metadata.json 파싱 실패")
    else:
        checks["metadata_parseable"] = False
        issues.append("metadata.json 없음")

    if metadata:
        checks["metadata_model_match"] = metadata.get("model_name") == model_name
        checks["metadata_version_match"] = metadata.get("mlflow_version") == version_id
        source = metadata.get("source") or {}
        checks["metadata_source_match"] = (
            not version.get("source") or source.get("uri") == version.get("source")
        )
        checks["metadata_run_match"] = (
            not version.get("run_id") or source.get("run_id") == version.get("run_id")
        )
        for key, ok in (
            ("metadata_model_match", checks["metadata_model_match"]),
            ("metadata_version_match", checks["metadata_version_match"]),
            ("metadata_source_match", checks["metadata_source_match"]),
            ("metadata_run_match", checks["metadata_run_match"]),
        ):
            if not ok:
                issues.append(key)
    else:
        checks["metadata_model_match"] = False
        checks["metadata_version_match"] = False
        checks["metadata_source_match"] = False
        checks["metadata_run_match"] = False

    summary = _summarize_files(path) if checks["path_exists"] else {
        "artifact_file_count": 0,
        "artifact_bytes": 0,
        "artifact_files_sample": [],
    }
    checks["artifact_files_exist"] = summary["artifact_file_count"] > 0
    if not checks["artifact_files_exist"]:
        issues.append("artifact 파일 없음")

    return {
        "version": version_id,
        "stage": version.get("current_stage"),
        "ok": not issues,
        "issues": issues,
        "checks": checks,
        "repository": {
            "status": repo.get("status") or "missing",
            "backend": repo.get("backend") or MODEL_STORE_BACKEND,
            "path": str(path),
            "expected_path": str(expected_path),
            "metadata_path": str(metadata_path),
            "synced_at": repo.get("synced_at"),
            "exists": checks["path_exists"],
            **summary,
        },
    }


def check_model_consistency(model_detail: dict, *, project: str | None = None, namespace: str | None = None) -> dict:
    versions = [
        check_version_consistency(v, model_name=model_detail["name"], project=project, namespace=namespace)
        for v in model_detail.get("versions", [])
    ]
    broken = [v for v in versions if not v["ok"]]
    return {
        "model_name": model_detail["name"],
        "project": project or namespace,
        "namespace": namespace,
        "ok": not broken,
        "total_versions": len(versions),
        "inconsistent_versions": len(broken),
        "versions": versions,
    }
