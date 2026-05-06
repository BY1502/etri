import asyncio
import shutil

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel

from app.auth import get_owner_namespace, get_user_email, get_user_namespace, is_admin
from app.services import registry_model_service as registry
from app.services import production_deploy_service as prod_deploy
from app.services import accuracy_service
from app.services import onnx_service

router = APIRouter()


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


class StageChangeRequest(BaseModel):
    stage: str  # None | Staging | Production | Archived
    archive_existing: bool = True


class DescriptionRequest(BaseModel):
    description: str


@router.get("")
async def list_models(request: Request):
    requested_ns = _requested_model_namespace(request)
    if is_admin(request):
        ns_filter = [requested_ns] if requested_ns else None
    else:
        # MLflow Registry는 학습정보를 포함하므로 contributor 공유를 적용하지 않는다.
        user_ns = get_owner_namespace(request)
        if requested_ns and requested_ns != user_ns:
            raise HTTPException(status_code=403, detail="자기 namespace 모델만 조회할 수 있습니다")
        ns_filter = [requested_ns or user_ns]
    return registry.list_registered_models(namespace_filter=ns_filter)


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
            if not prod_ver:
                if owner_ns:
                    extra["undeploy"] = prod_deploy.undeploy_production(name, owner_ns)
        except Exception:
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


@router.post("/{name}/undeploy")
async def undeploy_model(name: str, request: Request):
    """KServe InferenceService 즉시 제거 + 모든 Production 버전을 Archived 로 전환."""
    owner_ns = _check_write_access(name, request)
    if not owner_ns:
        raise HTTPException(status_code=400, detail="소유 namespace 판별 불가")

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
    except Exception:
        raise HTTPException(status_code=500, detail="ISVC 제거 실패")
    return {"status": "ok", "archived_versions": archived, **result}


@router.post("/{name}/rollback")
async def rollback_model(name: str, request: Request):
    owner_ns = _check_write_access(name, request)
    try:
        registry.rollback(name, namespace=owner_ns)
        return {
            "status": "ok",
            "new_production": registry.find_production_version(name, namespace=owner_ns),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="롤백 실패")


class DeployProductionRequest(BaseModel):
    version: str
    target_namespace: str | None = None
    scale_to_zero: bool = False


@router.post("/{name}/deploy-production")
async def deploy_production(name: str, req: DeployProductionRequest, request: Request):
    """버전을 Production Stage로 변경 + KServe ISVC 생성/교체."""
    owner_ns = _check_write_access(name, request)
    ns = req.target_namespace or owner_ns or get_user_namespace(request)
    if not is_admin(request) and ns != owner_ns:
        raise HTTPException(status_code=403, detail="운영 배포는 자기 namespace로만 가능합니다")
    try:
        return await prod_deploy.deploy_production(
            name,
            req.version,
            ns,
            scale_to_zero=req.scale_to_zero,
            mlflow_namespace=owner_ns,
        )
    except Exception:
        raise HTTPException(status_code=500, detail="운영 배포 실패")


@router.get("/{name}/production-status")
async def production_status(request: Request, name: str, namespace: str | None = None):
    owner_ns = _check_read_access(name, request)
    ns = namespace or owner_ns or get_user_namespace(request)
    status = prod_deploy.get_production_status(name, ns)
    if status is None:
        return {"deployed": False, "namespace": ns}
    return {"deployed": True, **status}


class FeedbackEntry(BaseModel):
    task: str  # regression | classification
    y_true: float
    y_pred: float
    model_version: str | None = None
    prediction_id: str | None = None


class FeedbackBatch(BaseModel):
    entries: list[FeedbackEntry]


@router.post("/{name}/feedback")
async def submit_feedback(name: str, batch: FeedbackBatch, request: Request):
    """운영 중 모델의 실제 결과(Ground truth + 예측값)를 업로드."""
    _check_write_access(name, request)
    email = get_user_email(request)
    entries = [e.model_dump() for e in batch.entries]
    return accuracy_service.submit_feedback(name, entries, submitted_by=email)


@router.get("/{name}/accuracy-history")
async def get_accuracy_history(request: Request, name: str, hours: int = 24, bucket_minutes: int = 60):
    _check_read_access(name, request)
    return accuracy_service.accuracy_history(name, hours=hours, bucket_minutes=bucket_minutes)


@router.delete("/{name}/feedback")
async def clear_feedback(name: str, request: Request):
    if not is_admin(request):
        raise HTTPException(status_code=403, detail="admin only")
    n = accuracy_service.clear_feedback(name)
    return {"deleted": n}


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
