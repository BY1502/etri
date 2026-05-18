import asyncio
import json
import os
import urllib.request
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.auth import get_user_email, get_user_namespace, is_admin
from app.models.automl_models import AutoMLJobRequest
from app.services import automl_service, tenant_resources
from app.services import model_repository_service as model_repo

router = APIRouter()


# 데이터셋 크기 임계값 (bytes)
DATASET_WARN_BYTES = int(os.environ.get("DATASET_WARN_BYTES", 1 * 1024**3))   # 1 GB 경고
DATASET_HARD_BYTES = int(os.environ.get("DATASET_HARD_BYTES", 10 * 1024**3))  # 10 GB 차단


def _fmt_size(n: int) -> str:
    if n >= 1024**3:
        return f"{n / 1024**3:.2f} GB"
    if n >= 1024**2:
        return f"{n / 1024**2:.1f} MB"
    if n >= 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n} B"


@router.get("/dataset-size")
async def dataset_size(path: str, request: Request):
    """데이터셋 크기 사전 조회. 제출 전 사용자에게 경고 표시용.

    - URL: HEAD 요청으로 Content-Length 조회
    - 로컬 경로: os.path.getsize
    - 결과: {size_bytes, size_human, level: "ok"|"warn"|"block", message}
    """
    size = None
    try:
        if path.startswith(("http://", "https://")):
            req = urllib.request.Request(path, method="HEAD")
            with urllib.request.urlopen(req, timeout=8) as r:
                cl = r.headers.get("Content-Length")
                if cl:
                    size = int(cl)
        elif os.path.exists(path):
            size = os.path.getsize(path)
    except Exception as e:
        return {"size_bytes": None, "size_human": None, "level": "unknown",
                "message": f"크기 확인 실패 ({type(e).__name__}). 서버가 크기 정보를 제공하지 않을 수 있습니다."}

    if size is None:
        return {"size_bytes": None, "size_human": None, "level": "unknown",
                "message": "크기 정보 없음 (Content-Length 헤더 부재)"}

    warn = DATASET_WARN_BYTES
    hard = DATASET_HARD_BYTES
    if size > hard:
        return {"size_bytes": size, "size_human": _fmt_size(size), "level": "block",
                "message": f"데이터셋이 너무 큽니다 ({_fmt_size(size)}). 최대 {_fmt_size(hard)}까지 허용됩니다. 제출이 차단됩니다."}
    if size > warn:
        return {"size_bytes": size, "size_human": _fmt_size(size), "level": "warn",
                "message": f"데이터셋이 큽니다 ({_fmt_size(size)}). 학습에 시간이 오래 걸릴 수 있고 Ray worker 디스크가 부족할 수 있습니다."}
    return {"size_bytes": size, "size_human": _fmt_size(size), "level": "ok",
            "message": f"데이터셋 크기: {_fmt_size(size)}"}


@router.post("/jobs")
async def submit_job(req: AutoMLJobRequest, request: Request):
    email = get_user_email(request)
    ns = get_user_namespace(request)
    info = await automl_service.submit(req, email, ns)
    if info["status"] == "FAILED":
        raise HTTPException(status_code=500, detail=info.get("message"))
    return info


@router.get("/jobs")
async def list_jobs(request: Request):
    admin = is_admin(request)
    ns = get_user_namespace(request)
    results = []
    for info in automl_service.list_jobs(ns, admin):
        if info.get("ray_job_id") and info["status"] not in ("SUCCEEDED", "FAILED", "STOPPED", "CANCELED"):
            await automl_service.refresh_status(info["job_id"])
        cur = automl_service.get(info["job_id"]).copy()
        pos = automl_service.queue_position(info["job_id"])
        if pos is not None:
            cur["queue_position"] = pos
        results.append(cur)
    return results


@router.get("/queue-config")
async def queue_config(request: Request):
    return {"max_concurrent_per_namespace": automl_service.MAX_CONCURRENT_PER_NS}


@router.post("/jobs/{job_id}/cancel")
async def cancel_queued(job_id: str, request: Request):
    info = automl_service.get(job_id)
    if not info:
        raise HTTPException(status_code=404, detail="job not found")
    if not is_admin(request) and info["namespace"] != get_user_namespace(request):
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    ok = automl_service.cancel(job_id, get_user_email(request), is_admin(request))
    if not ok:
        raise HTTPException(status_code=400, detail="취소 불가 (QUEUED 상태만 취소 가능)")
    return {"canceled": True}


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, request: Request):
    info = automl_service.get(job_id)
    if not info:
        raise HTTPException(status_code=404, detail="job not found")
    if not is_admin(request) and info["namespace"] != get_user_namespace(request):
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    try:
        res = automl_service.delete(job_id, get_user_email(request), is_admin(request))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not res or not res.get("deleted"):
        raise HTTPException(status_code=400, detail=(res or {}).get("reason", "삭제 실패"))
    return res


@router.post("/jobs/{job_id}/promote")
async def promote_job(job_id: str, request: Request):
    info = automl_service.get(job_id)
    if not info:
        raise HTTPException(status_code=404, detail="job not found")
    if not is_admin(request):
        raise HTTPException(status_code=403, detail="관리자만 가능")
    ok = automl_service.promote(job_id, get_user_email(request), True)
    if not ok:
        raise HTTPException(status_code=400, detail="promote 실패")
    return {"promoted": True}


class DeployRequest(BaseModel):
    run_id: str
    rank: int
    model_id: str
    target_namespace: str | None = None
    target_notebook: str | None = None
    serving_name: str | None = None  # 사용자 입력 이름. ISVC 이름으로 사용 (없으면 자동 생성).


@router.get("/notebooks")
async def list_notebooks(request: Request):
    """배포 대상 후보 노트북 목록. admin은 전체, 일반은 자기+접근 가능 namespace."""
    from app.auth import get_user_accessible_namespaces, get_all_kubeflow_namespaces
    if is_admin(request):
        namespaces = get_all_kubeflow_namespaces()
    else:
        accessible = get_user_accessible_namespaces(request)
        namespaces = [a["namespace"] for a in accessible]
    return automl_service.list_available_notebooks(namespaces)


class RegisterRequest(BaseModel):
    run_id: str
    rank: int
    model_id: str
    registered_name: str


@router.post("/jobs/{job_id}/register")
async def register_model(job_id: str, req: RegisterRequest, request: Request):
    """Top-N Run을 MLflow Model Registry에 등록."""
    info = automl_service.get(job_id)
    if not info:
        raise HTTPException(status_code=404, detail="job not found")
    if not is_admin(request) and info["namespace"] != get_user_namespace(request):
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    import httpx
    MLFLOW = info.get("mlflow_uri") or tenant_resources.mlflow_tracking_uri(info["namespace"])
    try:
        source = automl_service._resolve_mlflow_model_artifact_uri(MLFLOW, req.run_id)
        # registered model 생성 (없으면)
        httpx.post(
            f"{MLFLOW}/api/2.0/mlflow/registered-models/create",
            json={"name": req.registered_name, "tags": [
                {"key": "automl.job_id", "value": job_id},
                {"key": "automl.model", "value": req.model_id},
                {"key": "automl.rank", "value": str(req.rank)},
            ]},
            timeout=15,
        )
        # 버전 생성
        vr = httpx.post(
            f"{MLFLOW}/api/2.0/mlflow/model-versions/create",
            json={
                "name": req.registered_name,
                "source": source,
                "run_id": req.run_id,
                "tags": [
                    {"key": "automl.job_id", "value": job_id},
                    {"key": "automl.model", "value": req.model_id},
                    {"key": "automl.rank", "value": str(req.rank)},
                ],
            },
            timeout=20,
        )
        vr.raise_for_status()
        version = vr.json().get("model_version", {}).get("version")
        repository = None
        if version:
            try:
                repository = await asyncio.to_thread(
                    model_repo.materialize_mlflow_model_version,
                    mlflow_uri=MLFLOW,
                    model_name=req.registered_name,
                    version=version,
                    source_uri=source,
                    run_id=req.run_id,
                    project=info.get("namespace"),
                    namespace=info.get("namespace"),
                    creator=get_user_email(request),
                    extra_metadata={
                        "automl": {
                            "job_id": job_id,
                            "model": req.model_id,
                            "rank": req.rank,
                            "task": info.get("task"),
                            "metric": info.get("metric"),
                        },
                        "dataset": {
                            "path": info.get("dataset_path"),
                            "target": info.get("target_column"),
                        },
                    },
                )
            except Exception as repo_error:
                repository = model_repo.mark_sync_failed(
                    mlflow_uri=MLFLOW,
                    model_name=req.registered_name,
                    version=version,
                    error=repo_error,
                )
                if model_repo.MODEL_STORE_STRICT:
                    raise
        return {"status": "ok", "name": req.registered_name, "version": version, "repository": repository}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/{job_id}/notebook")
async def create_notebook(job_id: str, req: DeployRequest, request: Request):
    info = automl_service.get(job_id)
    if not info:
        raise HTTPException(status_code=404, detail="job not found")
    ns = get_user_namespace(request)
    if not is_admin(request) and info["namespace"] != ns:
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    try:
        return automl_service.create_notebook_file(
            job_id, req.run_id, req.rank, req.model_id, ns,
            target_namespace=req.target_namespace,
            target_notebook=req.target_notebook,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/{job_id}/deploy")
async def deploy_model(job_id: str, req: DeployRequest, request: Request):
    import logging as _logging
    _logger = _logging.getLogger("prediction-manager")
    info = automl_service.get(job_id)
    if not info:
        raise HTTPException(status_code=404, detail="job not found")
    ns = get_user_namespace(request)
    if not is_admin(request) and info["namespace"] != ns:
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    try:
        result = await automl_service.deploy_to_kserve(
            job_id, req.run_id, req.rank, req.model_id, ns, serving_name=req.serving_name
        )
        return result
    except Exception as e:
        _logger.exception(f"[automl deploy] job={job_id} rank={req.rank} failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, request: Request):
    info = automl_service.get(job_id)
    if not info:
        raise HTTPException(status_code=404, detail="job not found")
    if not is_admin(request) and info["namespace"] != get_user_namespace(request):
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    await automl_service.refresh_status(job_id)
    return automl_service.get(job_id)


@router.get("/jobs/{job_id}/logs")
async def stream_logs(job_id: str, request: Request):
    info = automl_service.get(job_id)
    if not info:
        raise HTTPException(status_code=404, detail="job not found")
    if not is_admin(request) and info["namespace"] != get_user_namespace(request):
        raise HTTPException(status_code=403, detail="권한이 없습니다")

    async def stream():
        async for event in automl_service.stream_logs(job_id):
            yield event

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/jobs/{job_id}/stop")
async def stop_job(job_id: str, request: Request):
    info = automl_service.get(job_id)
    if not info:
        raise HTTPException(status_code=404, detail="job not found")
    if not is_admin(request) and info["namespace"] != get_user_namespace(request):
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    ok = await automl_service.stop(job_id)
    return {"stopped": ok}
