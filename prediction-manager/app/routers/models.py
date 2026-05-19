import asyncio
import base64
import datetime
import json
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field

from app.auth import get_owner_namespace, get_user_email, get_user_namespace, is_admin
from app.models.automl_models import AutoMLJobRequest
from app.services import automl_service
from app.services import registry_model_service as registry
from app.services import production_deploy_service as prod_deploy
from app.services import deployment_history_service as deploy_history
from app.services import accuracy_service
from app.services import onnx_service
from app.services import model_repository_service as model_repo
from app.services import tenant_resources

router = APIRouter()

MODEL_UPLOAD_MAX_BYTES = int(os.environ.get("MODEL_UPLOAD_MAX_BYTES", str(500 * 1024 * 1024)))
FEEDBACK_CSV_MAX_BYTES = int(os.environ.get("FEEDBACK_CSV_MAX_BYTES", str(10 * 1024 * 1024)))


def _record_deploy_history(**kwargs) -> dict | None:
    try:
        return deploy_history.record_event(**kwargs)
    except Exception as e:
        import logging as _l
        _l.getLogger("prediction-manager").warning(
            "[deployment_history] record failed: %s", e, exc_info=True
        )
        return None


def _requested_model_namespace(request: Request) -> str | None:
    return (
        request.query_params.get("namespace")
        or request.query_params.get("ns")
        or request.headers.get("x-pm-namespace")
    )


def _check_read_access(name: str, request: Request) -> str | None:
    """읽기 권한: owner namespace only. Admin은 전체."""
    requested_ns = _requested_model_namespace(request)
    if is_admin(request):
        return requested_ns or registry.get_model_owner_namespace(name)
    user_ns = get_owner_namespace(request)
    if requested_ns and requested_ns != user_ns:
        raise HTTPException(status_code=403, detail="자기 namespace 모델만 조회할 수 있습니다")
    owner_ns = registry.get_model_owner_namespace(name, namespace=user_ns)
    if owner_ns is None:
        raise HTTPException(status_code=403, detail="이 모델에 접근 권한이 없습니다")
    return owner_ns


def _check_write_access(name: str, request: Request) -> str | None:
    """쓰기/변경 권한: owner namespace 소유자만 (admin은 전체)."""
    requested_ns = _requested_model_namespace(request)
    if is_admin(request):
        return requested_ns or registry.get_model_owner_namespace(name)
    user_ns = get_owner_namespace(request)
    if requested_ns and requested_ns != user_ns:
        raise HTTPException(status_code=403, detail="자기 namespace 모델만 변경할 수 있습니다")
    owner_ns = registry.get_model_owner_namespace(name, namespace=user_ns)
    if owner_ns is None:
        raise HTTPException(
            status_code=403,
            detail="이 모델의 소유 namespace를 판별할 수 없어 변경이 제한됩니다",
        )
    if owner_ns != user_ns:
        raise HTTPException(
            status_code=403,
            detail=f"이 모델({owner_ns})은 현재 사용자({user_ns})가 변경할 수 없습니다",
        )
    return owner_ns


def _check_create_access(request: Request) -> str:
    requested_ns = _requested_model_namespace(request)
    user_ns = get_owner_namespace(request)
    if is_admin(request):
        return requested_ns or user_ns
    if requested_ns and requested_ns != user_ns:
        raise HTTPException(status_code=403, detail="자기 namespace에만 모델을 등록할 수 있습니다")
    return user_ns


def _safe_upload_filename(value: str | None) -> str:
    name = (value or "model.bin").strip().split("/")[-1].split("\\")[-1]
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip(".-")
    return name or "model.bin"


def _upload_metadata(request: Request) -> dict:
    raw = request.headers.get("x-pm-model-metadata-b64")
    if raw:
        try:
            return json.loads(base64.b64decode(raw).decode("utf-8"))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"metadata 파싱 실패: {e}")
    raw = request.headers.get("x-pm-model-metadata")
    if raw:
        try:
            return json.loads(raw)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"metadata 파싱 실패: {e}")
    return {}


async def _save_raw_upload(request: Request, filename: str) -> tuple[str, str]:
    tmp_dir = tempfile.mkdtemp(prefix="model-upload-")
    path = Path(tmp_dir) / filename
    total = 0
    try:
        with path.open("wb") as f:
            async for chunk in request.stream():
                if not chunk:
                    continue
                total += len(chunk)
                if total > MODEL_UPLOAD_MAX_BYTES:
                    raise HTTPException(status_code=413, detail="업로드 파일이 너무 큽니다")
                f.write(chunk)
        if total == 0:
            raise HTTPException(status_code=400, detail="업로드 파일이 비어 있습니다")
        return str(path), tmp_dir
    except Exception:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise


class StageChangeRequest(BaseModel):
    stage: str  # None | Staging | Production | Archived
    archive_existing: bool = True


class DescriptionRequest(BaseModel):
    description: str


class OperationTagsRequest(BaseModel):
    tags: list[str] = Field(default_factory=list)


class LifecycleStatusRequest(BaseModel):
    status: str
    target_namespace: str | None = None
    scale_to_zero: bool = False
    reason: str | None = None


class RollbackRequest(BaseModel):
    target_namespace: str | None = None
    scale_to_zero: bool = False
    reason: str | None = None


class UndeployRequest(BaseModel):
    reason: str | None = None


class RetrainRequest(BaseModel):
    job_name: str | None = None
    dataset_path: str | None = None
    target_column: str | None = None
    task: str | None = None
    models: list[str] | None = None
    num_trials: int = Field(10, ge=1, le=200)
    timeout_minutes: int = Field(60, ge=1, le=720)
    metric: str | None = "auto"
    test_size: float = Field(0.2, ge=0.05, le=0.5)
    random_state: int = 42
    cpu_per_trial: float = Field(1.0, ge=0.1, le=16)
    gpu_per_trial: float = Field(0.0, ge=0.0, le=4)
    memory_per_trial_gb: float = Field(2.0, ge=0.5, le=128)
    top_n: int = Field(3, ge=1, le=10)


class FeedbackRetrainRequest(RetrainRequest):
    include_all_versions: bool = False
    min_rows: int = Field(1, ge=1, le=1000000)


class RelatedAutoMLDeleteRequest(BaseModel):
    job_ids: list[str] = Field(default_factory=list)


_VALID_AUTOML_MODELS = {"rf", "xgb", "lgbm", "mlp", "tabnet"}
_VALID_AUTOML_TASKS = {"regression", "classification"}
_VALID_AUTOML_METRICS = {
    "auto", "mse", "rmse", "mae", "r2",
    "accuracy", "f1", "precision", "recall", "roc_auc",
}


def _safe_automl_job_name(value: str | None, fallback: str) -> str:
    raw = (value or fallback).strip()
    raw = re.sub(r"[^A-Za-z0-9._-]+", "-", raw).strip(".-_")
    return raw[:80] or fallback


def _infer_automl_model(tags: dict, params: dict) -> str:
    explicit = str(tags.get("automl.model") or "").strip().lower()
    if explicit in _VALID_AUTOML_MODELS:
        return explicit
    framework = str(tags.get("framework") or "").strip().lower()
    if "xgboost" in framework:
        return "xgb"
    if "lightgbm" in framework:
        return "lgbm"
    if "tabnet" in framework:
        return "tabnet"
    if "hidden_layer_sizes" in params or "activation" in params:
        return "mlp"
    return "rf"


def _version_retrain_defaults(name: str, version: str, version_info: dict) -> dict:
    tags = version_info.get("tags") or {}
    params = version_info.get("params") or {}
    model_id = _infer_automl_model(tags, params)
    task = str(tags.get("automl.task") or "regression").strip().lower()
    if task not in _VALID_AUTOML_TASKS:
        task = "regression"
    metric = str(tags.get("automl.metric") or "auto").strip().lower()
    if metric not in _VALID_AUTOML_METRICS:
        metric = "auto"
    return {
        "job_name": _safe_automl_job_name(
            None,
            f"retrain-{name}-v{version}-{datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        ),
        "dataset_path": str(tags.get("dataset.path") or ""),
        "target_column": str(tags.get("dataset.target") or ""),
        "task": task,
        "models": [model_id],
        "metric": metric,
    }


def _version_feature_columns(version_info: dict) -> list[str]:
    schema = version_info.get("input_schema") or {}
    raw_columns = schema.get("columns") or []
    columns: list[str] = []
    for item in raw_columns:
        if isinstance(item, dict):
            value = item.get("name")
        else:
            value = item
        text = str(value or "").strip()
        if text and text not in columns:
            columns.append(text)
    return columns


@router.get("")
async def list_models(request: Request):
    qp = request.query_params
    requested_ns = _requested_model_namespace(request)
    if is_admin(request):
        ns_filter = [requested_ns] if requested_ns else None
    else:
        # MLflow Registry는 학습정보를 포함하므로 contributor 공유를 적용하지 않는다.
        user_ns = get_owner_namespace(request)
        if requested_ns and requested_ns != user_ns:
            raise HTTPException(status_code=403, detail="자기 namespace 모델만 조회할 수 있습니다")
        ns_filter = [requested_ns or user_ns]
    return registry.list_registered_models(
        namespace_filter=ns_filter,
        query=qp.get("q") or qp.get("search") or qp.get("filter"),
        project=qp.get("project"),
        stage=qp.get("stage"),
        status=qp.get("status"),
        framework=qp.get("framework"),
        dataset=qp.get("dataset") or qp.get("dataset_id"),
        task=qp.get("task"),
        tag=qp.get("tag"),
        tag_key=qp.get("tag_key"),
        tag_value=qp.get("tag_value"),
        sort=qp.get("sort") or "name",
        order=qp.get("order") or "asc",
    )


@router.post("")
async def upload_model(request: Request):
    """Raw model artifact upload.

    Body: application/octet-stream or application/zip
    Metadata: query params and optional x-pm-model-metadata-b64 JSON header.
    """
    owner_ns = _check_create_access(request)
    qp = request.query_params
    metadata = _upload_metadata(request)
    model_name = (
        qp.get("name")
        or qp.get("model_name")
        or metadata.get("name")
        or metadata.get("model_name")
    )
    if not model_name:
        raise HTTPException(status_code=400, detail="model_name이 필요합니다")
    filename = _safe_upload_filename(qp.get("filename") or metadata.get("filename"))
    metadata.update({
        "framework": qp.get("framework") or metadata.get("framework"),
        "framework_version": qp.get("framework_version") or metadata.get("framework_version"),
        "dataset_id": qp.get("dataset_id") or metadata.get("dataset_id"),
        "dataset_path": qp.get("dataset_path") or metadata.get("dataset_path"),
        "dataset_rows": qp.get("dataset_rows") or metadata.get("dataset_rows"),
        "dataset_target": qp.get("dataset_target") or metadata.get("dataset_target"),
        "task": qp.get("task") or metadata.get("task"),
        "description": qp.get("description") or metadata.get("description"),
        "content_type": request.headers.get("content-type", ""),
    })
    upload_path, cleanup_dir = await _save_raw_upload(request, filename)
    try:
        mlflow_uri = tenant_resources.mlflow_tracking_uri(owner_ns)
        result = await asyncio.to_thread(
            model_repo.register_uploaded_model,
            mlflow_uri=mlflow_uri,
            upload_path=upload_path,
            filename=filename,
            model_name=model_name,
            namespace=owner_ns,
            creator=get_user_email(request),
            metadata=metadata,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"모델 업로드 실패: {type(e).__name__}: {e}")
    finally:
        shutil.rmtree(cleanup_dir, ignore_errors=True)


@router.get("/operation-tags/options")
async def list_operation_tag_options():
    return {"tags": registry.operation_tag_options()}


@router.get("/status/options")
async def list_lifecycle_status_options():
    return {"statuses": registry.lifecycle_status_options()}


@router.get("/{name}")
async def get_model(name: str, request: Request):
    ns = _check_read_access(name, request)
    return registry.get_model_detail(name, namespace=ns)


@router.put("/{name}/versions/{version}/stage")
async def change_stage(name: str, version: str, req: StageChangeRequest, request: Request):
    owner_ns = _check_write_access(name, request)
    try:
        registry.set_stage(
            name, version, req.stage,
            archive_existing=req.archive_existing,
            namespace=owner_ns,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="stage 변경 실패")

    # Archived / None 으로 전환 시: 해당 모델의 운영 버전이 없으면 KServe ISVC 제거
    extra = {}
    if req.stage in ("Archived", "None"):
        try:
            prod_ver = registry.find_production_version(name, namespace=owner_ns)
            if not prod_ver and owner_ns:
                undeploy_result = prod_deploy.undeploy_production(name, owner_ns)
                extra["undeploy"] = undeploy_result
                _record_deploy_history(
                    event_type="undeploy",
                    outcome="success",
                    model_name=name,
                    model_version=version,
                    namespace=owner_ns,
                    target_namespace=owner_ns,
                    actor=get_user_email(request),
                    reason=f"stage changed to {req.stage}",
                    result=undeploy_result,
                )
        except Exception as e:
            _record_deploy_history(
                event_type="undeploy",
                outcome="failed",
                model_name=name,
                model_version=version,
                namespace=owner_ns,
                target_namespace=owner_ns,
                actor=get_user_email(request),
                reason=f"stage changed to {req.stage}",
                error=str(e),
            )
            pass  # 정리 실패해도 stage 변경 자체는 성공
    return {"status": "ok", "name": name, "version": version, "new_stage": req.stage, **extra}


@router.put("/{name}/versions/{version}/description")
async def change_description(name: str, version: str, req: DescriptionRequest, request: Request):
    owner_ns = _check_write_access(name, request)
    try:
        registry.update_description(name, version, req.description, namespace=owner_ns)
        return {"status": "ok"}
    except Exception:
        raise HTTPException(status_code=500, detail="description 변경 실패")


@router.put("/{name}/versions/{version}/operation-tags")
async def change_operation_tags(name: str, version: str, req: OperationTagsRequest, request: Request):
    owner_ns = _check_write_access(name, request)
    try:
        result = registry.set_operation_tags(
            name,
            version,
            req.tags,
            updated_by=get_user_email(request),
            namespace=owner_ns,
        )
        return {"status": "ok", **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"운영 태그 변경 실패: {type(e).__name__}: {e}")


@router.put("/{name}/versions/{version}/status")
async def change_lifecycle_status(name: str, version: str, req: LifecycleStatusRequest, request: Request):
    owner_ns = _check_write_access(name, request)
    try:
        requested_status = registry.normalize_lifecycle_status(req.status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    email = get_user_email(request)

    if requested_status == "production":
        ns = req.target_namespace or owner_ns or get_user_namespace(request)
        if not is_admin(request) and ns != owner_ns:
            raise HTTPException(status_code=403, detail="운영 배포는 자기 namespace로만 가능합니다")
        previous_version = None
        try:
            previous_version = registry.find_production_version(name, namespace=owner_ns)
            result = await prod_deploy.deploy_production(
                name,
                version,
                ns,
                scale_to_zero=req.scale_to_zero,
                mlflow_namespace=owner_ns,
                stage_after_deploy=True,
            )
            registry.set_operation_tags(name, version, [], updated_by=email, namespace=owner_ns)
            _record_deploy_history(
                event_type="deploy",
                outcome="success",
                model_name=name,
                model_version=version,
                previous_version=previous_version,
                namespace=owner_ns,
                target_namespace=ns,
                actor=email,
                reason=req.reason,
                result=result,
            )
            return {
                "status": "ok",
                "lifecycle_status": "production",
                "deployed": True,
                **result,
            }
        except Exception as e:
            _record_deploy_history(
                event_type="deploy",
                outcome="failed",
                model_name=name,
                model_version=version,
                previous_version=previous_version,
                namespace=owner_ns,
                target_namespace=ns,
                actor=email,
                reason=req.reason,
                error=str(e),
            )
            raise HTTPException(status_code=500, detail=f"운영 상태 변경 실패: {type(e).__name__}: {e}")

    try:
        result = registry.set_lifecycle_status(
            name,
            version,
            requested_status,
            updated_by=email,
            namespace=owner_ns,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"상태 변경 실패: {type(e).__name__}: {e}")

    extra = {}
    if requested_status != "production":
        try:
            prod_ver = registry.find_production_version(name, namespace=owner_ns)
            if not prod_ver and owner_ns:
                undeploy_result = prod_deploy.undeploy_production(name, owner_ns)
                extra["undeploy"] = undeploy_result
                _record_deploy_history(
                    event_type="undeploy",
                    outcome="success",
                    model_name=name,
                    model_version=version,
                    namespace=owner_ns,
                    target_namespace=owner_ns,
                    actor=email,
                    reason=req.reason or f"status changed to {requested_status}",
                    result=undeploy_result,
                )
        except Exception as e:
            _record_deploy_history(
                event_type="undeploy",
                outcome="failed",
                model_name=name,
                model_version=version,
                namespace=owner_ns,
                target_namespace=owner_ns,
                actor=email,
                reason=req.reason or f"status changed to {requested_status}",
                error=str(e),
            )
            pass
    return {"status": "ok", **result, **extra}




@router.post("/{name}/versions/{version}/retrain")
async def retrain_model_version(name: str, version: str, req: RetrainRequest, request: Request):
    """기존 모델 버전의 학습 메타데이터를 바탕으로 AutoML 재학습 Job을 생성.

    기존 모델 버전을 덮어쓰지 않고 새 AutoML Job을 생성한다.
    학습 완료 후 AutoML 결과에서 같은 registered model 이름으로 등록하면 새 버전이 된다.
    """
    owner_ns = _check_write_access(name, request)
    namespace = owner_ns or get_user_namespace(request)
    try:
        version_info = registry.get_version_info(name, version, namespace=owner_ns)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    defaults = _version_retrain_defaults(name, version, version_info)
    dataset_path = (req.dataset_path or defaults["dataset_path"]).strip()
    target_column = (req.target_column or defaults["target_column"]).strip()
    if not dataset_path:
        raise HTTPException(status_code=400, detail="재학습할 dataset_path가 필요합니다")
    if not target_column:
        raise HTTPException(status_code=400, detail="재학습할 target_column이 필요합니다")

    task = str(req.task or defaults["task"]).strip().lower()
    if task not in _VALID_AUTOML_TASKS:
        raise HTTPException(status_code=400, detail="task는 regression 또는 classification이어야 합니다")

    metric = str(req.metric or defaults["metric"] or "auto").strip().lower()
    if metric not in _VALID_AUTOML_METRICS:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 metric입니다: {metric}")

    raw_models = req.models or defaults["models"]
    models = []
    for model_id in raw_models:
        normalized = str(model_id or "").strip().lower()
        if normalized:
            models.append(normalized)
    if not models:
        raise HTTPException(status_code=400, detail="재학습할 모델 후보가 필요합니다")
    invalid = [m for m in models if m not in _VALID_AUTOML_MODELS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 모델 후보입니다: {', '.join(invalid)}")

    job_name = _safe_automl_job_name(req.job_name, defaults["job_name"])
    try:
        automl_req = AutoMLJobRequest(
            name=job_name,
            task=task,
            dataset_path=dataset_path,
            target_column=target_column,
            models=models,
            num_trials=req.num_trials,
            timeout_minutes=req.timeout_minutes,
            metric=metric,
            test_size=req.test_size,
            random_state=req.random_state,
            cpu_per_trial=req.cpu_per_trial,
            gpu_per_trial=req.gpu_per_trial,
            memory_per_trial_gb=req.memory_per_trial_gb,
            top_n=req.top_n,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"재학습 Job 설정이 올바르지 않습니다: {e}")

    info = await automl_service.submit(automl_req, get_user_email(request), namespace)
    return {
        "status": "queued",
        "source_model": name,
        "source_version": version,
        "register_suggestion": name,
        "job": info,
        "message": "재학습 Job이 생성되었습니다. 완료 후 AutoML 결과를 같은 모델명으로 등록하면 새 버전이 됩니다.",
    }


@router.post("/{name}/versions/{version}/retrain-from-feedback")
async def retrain_model_version_from_feedback(
    name: str,
    version: str,
    req: FeedbackRetrainRequest,
    request: Request,
):
    """Prediction ID가 연결된 피드백을 학습 CSV로 변환한 뒤 AutoML 재학습 Job 생성."""
    owner_ns = _check_write_access(name, request)
    namespace = owner_ns or get_user_namespace(request)
    try:
        version_info = registry.get_version_info(name, version, namespace=owner_ns)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    defaults = _version_retrain_defaults(name, version, version_info)
    target_column = (req.target_column or defaults["target_column"] or "target").strip()
    if not target_column:
        raise HTTPException(status_code=400, detail="target_column이 필요합니다")

    task = str(req.task or defaults["task"]).strip().lower()
    if task not in _VALID_AUTOML_TASKS:
        raise HTTPException(status_code=400, detail="task는 regression 또는 classification이어야 합니다")

    metric = str(req.metric or defaults["metric"] or "auto").strip().lower()
    if metric not in _VALID_AUTOML_METRICS:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 metric입니다: {metric}")

    raw_models = req.models or defaults["models"]
    models = []
    for model_id in raw_models:
        normalized = str(model_id or "").strip().lower()
        if normalized:
            models.append(normalized)
    if not models:
        raise HTTPException(status_code=400, detail="재학습할 모델 후보가 필요합니다")
    invalid = [m for m in models if m not in _VALID_AUTOML_MODELS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 모델 후보입니다: {', '.join(invalid)}")

    try:
        dataset = accuracy_service.create_feedback_retrain_dataset(
            model_name=name,
            model_version=version,
            target_column=target_column,
            feature_columns=_version_feature_columns(version_info),
            include_all_versions=req.include_all_versions,
            min_rows=req.min_rows,
            created_by=get_user_email(request),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"피드백 재학습 데이터 생성 실패: {type(e).__name__}: {e}")

    fallback_name = _safe_automl_job_name(
        None,
        f"feedback-retrain-{name}-v{version}-{datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
    )
    job_name = _safe_automl_job_name(req.job_name, fallback_name)
    try:
        automl_req = AutoMLJobRequest(
            name=job_name,
            task=task,
            dataset_path=dataset["dataset_url"],
            target_column=target_column,
            models=models,
            num_trials=req.num_trials,
            timeout_minutes=req.timeout_minutes,
            metric=metric,
            test_size=req.test_size,
            random_state=req.random_state,
            cpu_per_trial=req.cpu_per_trial,
            gpu_per_trial=req.gpu_per_trial,
            memory_per_trial_gb=req.memory_per_trial_gb,
            top_n=req.top_n,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"피드백 재학습 Job 설정이 올바르지 않습니다: {e}")

    info = await automl_service.submit(
        automl_req,
        get_user_email(request),
        namespace,
        extra={
            "source": "feedback",
            "source_model": name,
            "source_version": version,
            "feedback_export_id": dataset.get("export_id"),
            "source_feedback_ids": dataset.get("source_feedback_ids") or [],
            "feedback_dataset_stale": False,
        },
    )
    return {
        "status": "queued",
        "source_model": name,
        "source_version": version,
        "source": "feedback",
        "register_suggestion": name,
        "feedback_dataset": dataset,
        "job": info,
        "message": "피드백 기반 재학습 Job이 생성되었습니다. 완료 후 AutoML 결과를 같은 모델명으로 등록하면 새 버전이 됩니다.",
    }


@router.post("/{name}/versions/{version}/repository-sync")
async def sync_model_repository(name: str, version: str, request: Request):
    """모델 버전 artifact를 표준 모델 저장소 경로로 동기화."""
    owner_ns = _check_write_access(name, request)
    try:
        info = registry.get_version_info(name, version, namespace=owner_ns)
        source = info.get("source")
        if not source:
            raise HTTPException(status_code=400, detail="model version source가 없습니다")
        mlflow_uri = tenant_resources.mlflow_tracking_uri(owner_ns) if owner_ns else None
        if not mlflow_uri:
            raise HTTPException(status_code=400, detail="MLflow URI를 확인할 수 없습니다")
        repository = await asyncio.to_thread(
            model_repo.materialize_mlflow_model_version,
            mlflow_uri=mlflow_uri,
            model_name=name,
            version=version,
            source_uri=source,
            run_id=info.get("run_id"),
            project=owner_ns,
            namespace=owner_ns,
            creator=get_user_email(request),
            extra_metadata={
                "current_stage": info.get("current_stage"),
                "experiment_name": info.get("experiment_name"),
            },
        )
        return {"status": "ok", "repository": repository}
    except HTTPException:
        raise
    except Exception as e:
        if owner_ns:
            model_repo.mark_sync_failed(
                mlflow_uri=tenant_resources.mlflow_tracking_uri(owner_ns),
                model_name=name,
                version=version,
                error=e,
            )
        if model_repo.MODEL_STORE_STRICT:
            raise HTTPException(status_code=500, detail=f"저장소 동기화 실패: {e}")
        return {
            "status": "warning",
            "repository": {
                "status": "failed",
                "error": str(e),
                "backend": model_repo.MODEL_STORE_BACKEND,
                "root": str(model_repo.MODEL_STORE_ROOT),
            },
        }


@router.get("/{name}/repository-consistency")
async def check_model_repository_consistency(name: str, request: Request):
    """Registry metadata와 실제 /models 저장소 파일 간 정합성 검사."""
    owner_ns = _check_read_access(name, request)
    detail = registry.get_model_detail(name, namespace=owner_ns)
    return model_repo.check_model_consistency(detail, project=owner_ns, namespace=owner_ns)


@router.post("/{name}/repository-repair")
async def repair_model_repository(name: str, request: Request):
    """정합성 문제가 있는 버전을 MLflow artifact에서 다시 물리화."""
    owner_ns = _check_write_access(name, request)
    detail = registry.get_model_detail(name, namespace=owner_ns)
    consistency = model_repo.check_model_consistency(detail, project=owner_ns, namespace=owner_ns)
    mlflow_uri = tenant_resources.mlflow_tracking_uri(owner_ns) if owner_ns else None
    if not mlflow_uri:
        raise HTTPException(status_code=400, detail="MLflow URI를 확인할 수 없습니다")

    repaired = []
    failed = []
    by_version = {str(v.get("version")): v for v in detail.get("versions", [])}
    for item in consistency.get("versions", []):
        if item.get("ok"):
            continue
        version_id = item.get("version")
        version_info = by_version.get(str(version_id))
        if not version_info:
            continue
        source = version_info.get("source")
        if not source:
            failed.append({
                "version": version_id,
                "error": "model version source가 없습니다",
                "issues": item.get("issues", []),
            })
            continue
        try:
            repo = await asyncio.to_thread(
                model_repo.materialize_mlflow_model_version,
                mlflow_uri=mlflow_uri,
                model_name=name,
                version=version_id,
                source_uri=source,
                run_id=version_info.get("run_id"),
                project=owner_ns,
                namespace=owner_ns,
                creator=get_user_email(request),
                extra_metadata={
                    "repair": True,
                    "repaired_from_issues": item.get("issues", []),
                    "current_stage": version_info.get("current_stage"),
                    "experiment_name": version_info.get("experiment_name"),
                },
            )
            repaired.append({"version": version_id, "repository": repo})
        except Exception as e:
            model_repo.mark_sync_failed(
                mlflow_uri=mlflow_uri,
                model_name=name,
                version=version_id,
                error=e,
            )
            failed.append({
                "version": version_id,
                "error": str(e),
                "issues": item.get("issues", []),
            })

    refreshed = registry.get_model_detail(name, namespace=owner_ns)
    after = model_repo.check_model_consistency(refreshed, project=owner_ns, namespace=owner_ns)
    return {
        "status": "ok" if not failed else "warning",
        "repaired": repaired,
        "failed": failed,
        "before": consistency,
        "after": after,
    }


@router.delete("/{name}")
async def delete_registered_model(name: str, request: Request):
    """등록된 모델 완전 삭제 (ISVC + PVC + Run + Registry)."""
    owner_ns = _check_write_access(name, request)
    try:
        result = registry.delete_model(name, namespace=owner_ns)
        return {"status": "ok", "deleted": name, **result}
    except Exception as e:
        import logging as _l
        _l.getLogger("prediction-manager").exception(f"[delete_model] {name} failed")
        raise HTTPException(status_code=500, detail=f"모델 삭제 실패: {type(e).__name__}")


@router.delete("/{name}/versions/{version}")
async def delete_model_version(name: str, version: str, request: Request, force: bool = False):
    """모델 버전 단위 삭제 (Repository 경로 + Registry 버전)."""
    owner_ns = _check_write_access(name, request)
    try:
        result = registry.delete_model_version(name, version, namespace=owner_ns, force=force)
        return {**result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        import logging as _l
        _l.getLogger("prediction-manager").exception(
            f"[delete_model_version] {name} v{version} failed"
        )
        raise HTTPException(status_code=500, detail=f"버전 삭제 실패: {type(e).__name__}")


@router.post("/{name}/undeploy")
async def undeploy_model(name: str, request: Request, req: UndeployRequest | None = None):
    """KServe InferenceService 즉시 제거 + 모든 Production 버전을 Archived 로 전환."""
    owner_ns = _check_write_access(name, request)
    if not owner_ns:
        raise HTTPException(status_code=400, detail="소유 namespace 판별 불가")
    body = req or UndeployRequest()
    actor = get_user_email(request)

    # 1) 모든 Production 버전을 Archived 로
    archived = []
    try:
        data = registry.get_model_detail(name, namespace=owner_ns)
        for v in data.get("versions", []):
            if v.get("current_stage") == "Production":
                try:
                    registry.set_stage(
                        name, v["version"], "Archived",
                        archive_existing=False,
                        namespace=owner_ns,
                    )
                    archived.append(v["version"])
                except Exception:
                    pass
    except Exception:
        pass

    # 2) ISVC + PVC 제거
    try:
        result = prod_deploy.undeploy_production(name, owner_ns)
    except Exception as e:
        _record_deploy_history(
            event_type="undeploy",
            outcome="failed",
            model_name=name,
            namespace=owner_ns,
            target_namespace=owner_ns,
            actor=actor,
            reason=body.reason,
            error=str(e),
            extra={"archived_versions": archived},
        )
        raise HTTPException(status_code=500, detail="ISVC 제거 실패")
    _record_deploy_history(
        event_type="undeploy",
        outcome="success",
        model_name=name,
        model_version=archived[0] if archived else None,
        namespace=owner_ns,
        target_namespace=owner_ns,
        actor=actor,
        reason=body.reason,
        result=result,
        extra={"archived_versions": archived},
    )
    return {"status": "ok", "archived_versions": archived, **result}


@router.post("/{name}/rollback")
async def rollback_model(name: str, request: Request, req: RollbackRequest | None = None):
    owner_ns = _check_write_access(name, request)
    body = req or RollbackRequest()
    ns = body.target_namespace or owner_ns or get_user_namespace(request)
    if not is_admin(request) and ns != owner_ns:
        raise HTTPException(status_code=403, detail="롤백 배포는 자기 namespace로만 가능합니다")
    actor = get_user_email(request)
    current = None
    previous = None
    try:
        current = registry.find_production_version(name, namespace=owner_ns)
        previous = registry.find_previous_production(name, namespace=owner_ns)
        if not previous:
            raise ValueError("롤백할 이전 Production 버전(Archived)이 없습니다")
        result = await prod_deploy.deploy_production(
            name,
            previous,
            ns,
            scale_to_zero=body.scale_to_zero,
            mlflow_namespace=owner_ns,
            stage_after_deploy=True,
        )
        _record_deploy_history(
            event_type="rollback",
            outcome="success",
            model_name=name,
            model_version=previous,
            previous_version=current,
            namespace=owner_ns,
            target_namespace=ns,
            actor=actor,
            reason=body.reason,
            result=result,
        )
        return {
            "status": "ok",
            "rolled_back_from": current,
            "new_production": previous,
            "redeployed": True,
            **result,
        }
    except ValueError as e:
        _record_deploy_history(
            event_type="rollback",
            outcome="failed",
            model_name=name,
            model_version=previous,
            previous_version=current,
            namespace=owner_ns,
            target_namespace=ns,
            actor=actor,
            reason=body.reason,
            error=str(e),
        )
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _record_deploy_history(
            event_type="rollback",
            outcome="failed",
            model_name=name,
            model_version=previous,
            previous_version=current,
            namespace=owner_ns,
            target_namespace=ns,
            actor=actor,
            reason=body.reason,
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=f"롤백 배포 실패: {type(e).__name__}")


class DeployProductionRequest(BaseModel):
    version: str
    target_namespace: str | None = None
    scale_to_zero: bool = False
    reason: str | None = None


class ProductionTestRequest(BaseModel):
    target_namespace: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    timeout_seconds: float = Field(60, ge=1, le=180)


@router.post("/{name}/deploy-production")
async def deploy_production(name: str, req: DeployProductionRequest, request: Request):
    """버전을 Production Stage로 변경 + KServe ISVC 생성/교체."""
    owner_ns = _check_write_access(name, request)
    ns = req.target_namespace or owner_ns or get_user_namespace(request)
    if not is_admin(request) and ns != owner_ns:
        raise HTTPException(status_code=403, detail="운영 배포는 자기 namespace로만 가능합니다")
    actor = get_user_email(request)
    previous_version = None
    try:
        previous_version = registry.find_production_version(name, namespace=owner_ns)
        result = await prod_deploy.deploy_production(
            name,
            req.version,
            ns,
            scale_to_zero=req.scale_to_zero,
            mlflow_namespace=owner_ns,
        )
        _record_deploy_history(
            event_type="deploy",
            outcome="success",
            model_name=name,
            model_version=req.version,
            previous_version=previous_version,
            namespace=owner_ns,
            target_namespace=ns,
            actor=actor,
            reason=req.reason,
            result=result,
        )
        return result
    except Exception as e:
        _record_deploy_history(
            event_type="deploy",
            outcome="failed",
            model_name=name,
            model_version=req.version,
            previous_version=previous_version,
            namespace=owner_ns,
            target_namespace=ns,
            actor=actor,
            reason=req.reason,
            error=str(e),
        )
        raise HTTPException(status_code=500, detail="운영 배포 실패")


@router.get("/{name}/deployment-history")
async def deployment_history(
    name: str,
    request: Request,
    limit: int = 50,
    event_type: str | None = None,
):
    owner_ns = _check_read_access(name, request)
    return {
        "events": deploy_history.list_events(
            model_name=name,
            namespace=owner_ns,
            event_type=event_type,
            limit=limit,
        )
    }


@router.get("/{name}/production-status")
async def production_status(request: Request, name: str, namespace: str | None = None):
    owner_ns = _check_read_access(name, request)
    ns = namespace or owner_ns or get_user_namespace(request)
    status = prod_deploy.get_production_status(name, ns)
    if status is None:
        return {"deployed": False, "namespace": ns}
    return {"deployed": True, **status}


@router.get("/{name}/production-metrics")
async def production_metrics(
    request: Request,
    name: str,
    hours: int = 72,
    bucket_minutes: int = 60,
    limit: int = 20,
):
    owner_ns = _check_read_access(name, request)
    return accuracy_service.production_metrics(
        name,
        namespace=owner_ns,
        hours=hours,
        bucket_minutes=bucket_minutes,
        limit=limit,
    )


@router.post("/{name}/production-test")
async def production_test(name: str, req: ProductionTestRequest, request: Request):
    owner_ns = _check_read_access(name, request)
    ns = req.target_namespace or owner_ns or get_user_namespace(request)
    if not is_admin(request) and ns != owner_ns:
        raise HTTPException(status_code=403, detail="자기 namespace의 운영 배포만 테스트할 수 있습니다")
    if not req.payload:
        raise HTTPException(status_code=400, detail="테스트 payload가 필요합니다")
    try:
        result = prod_deploy.test_production(
            name,
            ns,
            req.payload,
            timeout_seconds=req.timeout_seconds,
        )
        response_body = result.get("response")
        if response_body is None:
            response_body = result.get("response_text", "")
        try:
            prediction_log = accuracy_service.log_prediction(
                model_name=name,
                model_version=result.get("deployed_version"),
                namespace=ns,
                request_url=result.get("request_url"),
                request_payload=req.payload,
                response_body=response_body,
                ok=bool(result.get("ok")),
                status_code=result.get("status_code"),
                elapsed_ms=result.get("elapsed_ms"),
                created_by=get_user_email(request),
            )
            return {**result, "prediction_log": prediction_log}
        except Exception as e:
            return {**result, "prediction_log_error": f"{type(e).__name__}: {e}"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"운영 테스트 요청 실패: {type(e).__name__}: {e}")


@router.get("/{name}/feedback-datasets/{export_id}/download")
async def download_feedback_retrain_dataset(name: str, export_id: str, token: str = ""):
    try:
        return accuracy_service.feedback_retrain_dataset_download_response(name, export_id, token)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"피드백 재학습 데이터 다운로드 실패: {type(e).__name__}")


def _mark_feedback_lineage_stale(
    name: str,
    feedback_ids: list[int],
    request: Request,
    *,
    force_all: bool = False,
) -> dict:
    if not feedback_ids and not force_all:
        return {"stale_exports": [], "related_automl_jobs": []}
    actor = get_user_email(request)
    stale_exports = accuracy_service.mark_feedback_retrain_exports_stale(
        name,
        feedback_ids,
        stale_by=actor,
        force_all=force_all,
    )
    related_jobs = automl_service.mark_feedback_jobs_stale(
        name,
        feedback_ids=feedback_ids,
        export_ids=[e.get("export_id") for e in stale_exports],
        stale_by=actor,
        force_all=force_all,
    )
    return {
        "stale_exports": stale_exports,
        "related_automl_jobs": related_jobs,
    }


class FeedbackEntry(BaseModel):
    task: str  # regression | classification
    y_true: float
    y_pred: float
    model_version: str | None = None
    prediction_id: str | None = None


class FeedbackBatch(BaseModel):
    entries: list[FeedbackEntry]


@router.get("/{name}/feedback")
async def list_feedback(request: Request, name: str, limit: int = 50):
    _check_read_access(name, request)
    data = accuracy_service.list_feedback(name, limit=limit)
    data["stale_exports"] = accuracy_service.list_feedback_retrain_exports(name, stale_only=True)
    data["related_automl_jobs"] = automl_service.feedback_jobs_for_model(name, stale_only=True)
    return data


@router.post("/{name}/feedback")
async def submit_feedback(name: str, batch: FeedbackBatch, request: Request):
    """운영 중 모델의 실제 결과(Ground truth + 예측값)를 업로드."""
    _check_write_access(name, request)
    email = get_user_email(request)
    entries = [e.model_dump() for e in batch.entries]
    return accuracy_service.submit_feedback(name, entries, submitted_by=email)


@router.post("/{name}/feedback-csv")
async def submit_feedback_csv(
    name: str,
    request: Request,
    task: str = "regression",
    skip_existing: bool = True,
):
    """CSV로 실제값을 일괄 업로드.

    권장 헤더: prediction_id,y_true
    선택 헤더: y_pred,model_version,task
    """
    _check_write_access(name, request)
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="CSV 파일이 비어 있습니다")
    if len(body) > FEEDBACK_CSV_MAX_BYTES:
        raise HTTPException(status_code=413, detail="CSV 파일이 너무 큽니다")
    try:
        csv_text = body.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV는 UTF-8 인코딩이어야 합니다")
    return accuracy_service.submit_feedback_csv(
        name,
        csv_text,
        submitted_by=get_user_email(request),
        default_task=task,
        skip_existing=skip_existing,
    )


@router.get("/{name}/accuracy-history")
async def get_accuracy_history(request: Request, name: str, hours: int = 24, bucket_minutes: int = 60):
    _check_read_access(name, request)
    return accuracy_service.accuracy_history(name, hours=hours, bucket_minutes=bucket_minutes)


@router.get("/{name}/predictions")
async def get_recent_predictions(request: Request, name: str, limit: int = 20):
    _check_read_access(name, request)
    return accuracy_service.recent_predictions(name, limit=limit)


@router.post("/{name}/feedback/related-automl/delete")
async def delete_related_feedback_automl(name: str, req: RelatedAutoMLDeleteRequest, request: Request):
    _check_write_access(name, request)
    actor = get_user_email(request)
    results = []
    deleted = 0
    for raw_job_id in req.job_ids:
        job_id = str(raw_job_id or "").strip()
        if not job_id:
            continue
        job = automl_service.get(job_id)
        if not job:
            results.append({"job_id": job_id, "deleted": False, "reason": "job_not_found"})
            continue
        if job.get("source") != "feedback" or job.get("source_model") != name:
            results.append({"job_id": job_id, "deleted": False, "reason": "not_feedback_related"})
            continue
        try:
            result = automl_service.delete(job_id, actor, True)
        except ValueError as e:
            results.append({"job_id": job_id, "deleted": False, "reason": str(e)})
            continue
        except Exception as e:
            results.append({"job_id": job_id, "deleted": False, "reason": f"{type(e).__name__}: {e}"})
            continue
        if result.get("deleted"):
            deleted += 1
        results.append(result)
    return {"deleted": deleted, "results": results}


@router.delete("/{name}/feedback/{feedback_id}")
async def delete_feedback_entry(name: str, feedback_id: int, request: Request):
    _check_write_access(name, request)
    n = accuracy_service.delete_feedback(name, feedback_id)
    if not n:
        raise HTTPException(status_code=404, detail="feedback not found")
    lineage = _mark_feedback_lineage_stale(name, [feedback_id], request)
    return {"deleted": n, "feedback_id": feedback_id, **lineage}


@router.delete("/{name}/feedback")
async def clear_feedback(name: str, request: Request):
    _check_write_access(name, request)
    feedback_ids = accuracy_service.feedback_ids(name)
    n = accuracy_service.clear_feedback(name)
    lineage = _mark_feedback_lineage_stale(name, feedback_ids, request, force_all=True)
    return {"deleted": n, "feedback_ids": feedback_ids, **lineage}


@router.get("/{name}/versions/{version}/download")
async def download_version(name: str, version: str, request: Request):
    """모델 버전의 artifact 전체를 zip으로 다운로드.

    권한: 소유 namespace 모델만 가능 (admin은 전체)
    """
    owner_ns = _check_read_access(name, request)
    try:
        # MLflow artifact 다운로드 + zip 생성은 sync I/O — 이벤트 루프 블록 방지 위해 스레드풀로
        zip_path, filename, cleanup_dir = await asyncio.to_thread(
            registry.download_version_zip, name, version, owner_ns
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="다운로드 실패")
    # 스트리밍 후 tmp 폴더 정리 (BackgroundTask 는 응답 전송 완료 후 실행)
    cleanup = BackgroundTask(shutil.rmtree, cleanup_dir, ignore_errors=True)
    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=filename,
        background=cleanup,
    )


@router.post("/{name}/versions/{version}/to-onnx")
async def convert_version_to_onnx(name: str, version: str, request: Request):
    """sklearn/XGBoost/LightGBM 모델을 ONNX로 변환하여 새 레지스트리 모델 생성."""
    owner_ns = _check_write_access(name, request)
    import logging as _logging
    _logger = _logging.getLogger("prediction-manager")
    try:
        result = onnx_service.convert_to_onnx(
            name, version, get_user_email(request), namespace=owner_ns
        )
        return {"status": "ok", **result}
    except Exception as e:
        _logger.exception(f"[onnx] convert {name} v{version} failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"ONNX 변환 실패: {type(e).__name__}: {e}")
