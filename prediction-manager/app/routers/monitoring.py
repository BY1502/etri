import asyncio
import math
import time
from fastapi import APIRouter, Request
from app.auth import get_user_namespace, get_owner_namespace, is_admin, get_user_email
from app.services import monitoring_service

router = APIRouter()


# ── Ray mock (테스트 완료 후 이 블록 전체 삭제) ──────────────────────────────
_MOCK_RAY = True

def _ray_mock():
    now_ms = int(time.time() * 1000)
    ts = [now_ms - (59 - i) * 60_000 for i in range(60)]
    def wave(base, amp, period, noise, i):
        return round(max(0, base + amp * math.sin(2 * math.pi * i / period)
                               + noise * math.sin(2 * math.pi * i / 7 + 1.3)), 2)
    def workers(i):
        if i < 20: return 5
        if i < 35: return 15
        if i < 50: return 25
        return 16
    return {
        "ray_cluster_util": {
            "status": "ok",
            "cpu":  [[ts[i], wave(12, 8, 20, 3, i)] for i in range(60)],
            "mem":  [[ts[i], wave(38, 6, 30, 2, i)] for i in range(60)],
            "disk": [[ts[i], wave(14, 2, 45, 1, i)] for i in range(60)],
        },
        "ray_node_count": {
            "status": "ok",
            "types": [
                {"name": "worker-node-type-0", "data": [[ts[i], workers(i)] for i in range(60)]},
                {"name": "head-node-type",     "data": [[ts[i], 1]          for i in range(60)]},
            ],
            "finished_jobs": 137,
        },
    }
# ────────────────────────────────────────────────────────────────────────────


@router.get("/gpu-trend")
async def gpu_trend(window_minutes: int = 60, step: str = "1m"):
    return await monitoring_service.get_gpu_trend(window_minutes=window_minutes, step=step)


@router.get("/summary")
async def summary(request: Request, ns: str | None = None):
    
    namespace = ns or get_user_namespace(request)
    admin = is_admin(request)
    # admin이 자기 namespace(또는 ns 파라미터 없음)를 보는 경우 → 전체 뷰
    is_admin_view = admin and (ns is None or namespace == get_owner_namespace(request))
    # 필터링할 namespace: 전체 뷰면 None(전체), 아니면 선택된 namespace
    filter_ns = None if is_admin_view else namespace

    gpu, system, ray, mlflow, mlflow_models, mlflow_experiment_runs, notebook_resources, running_notebooks, pvc, gpu_trend, ray_trend, ray_cluster_util, ray_node_count, kserve_rps, kserve_latency_p95, kserve_error_rate, kserve_top5_latency = await asyncio.gather(
        monitoring_service.get_gpu_metrics(),
        monitoring_service.get_system_metrics(namespace),
        monitoring_service.get_ray_status(namespace),
        monitoring_service.get_mlflow_stats(namespace=filter_ns),
        monitoring_service.get_mlflow_model_versions(namespace=filter_ns),
        monitoring_service.get_mlflow_experiment_runs(namespace=filter_ns),
        monitoring_service.get_notebook_resources(namespace=filter_ns),
        monitoring_service.get_running_notebooks(namespace=filter_ns),
        monitoring_service.get_pvc_storage(namespace=filter_ns),
        monitoring_service.get_gpu_trend(window_minutes=60, step="1m"),
        monitoring_service.get_ray_trend(window_minutes=60, step="1m"),
        monitoring_service.get_ray_cluster_util_trend(window_minutes=60, step="1m"),
        monitoring_service.get_ray_node_count_trend(window_minutes=60, step="1m"),
        monitoring_service.get_kserve_rps(namespace=filter_ns, window_minutes=30, step="1m"),
        monitoring_service.get_kserve_latency_p95(namespace=filter_ns, window_minutes=30, step="1m"),
        monitoring_service.get_kserve_error_rate(namespace=filter_ns),
        monitoring_service.get_kserve_top5_latency(namespace=filter_ns),
    )

    # ── mock 적용 (테스트 완료 후 아래 세 줄 삭제) ──
    if _MOCK_RAY:
        _m = _ray_mock()
        ray_cluster_util, ray_node_count = _m["ray_cluster_util"], _m["ray_node_count"]
    # ────────────────────────────────────────────────

    return {
        "namespace": namespace,
        "user_email": get_user_email(request),
        "is_admin": admin,
        "is_admin_view": is_admin_view,
        "gpu": gpu,
        "gpu_trend": gpu_trend,
        "kserve_rps": kserve_rps,
        "kserve_latency_p95": kserve_latency_p95,
        "kserve_error_rate": kserve_error_rate,
        "kserve_top5_latency": kserve_top5_latency,
        "system": system,
        "ray": ray,
        "ray_trend": ray_trend,
        "ray_cluster_util": ray_cluster_util,
        "ray_node_count": ray_node_count,
        "automl": monitoring_service.get_automl_jobs(
            namespace=None if is_admin_view else namespace,
            is_admin=admin,
        ),
        "kserve": monitoring_service.get_kserve_endpoints(namespace=filter_ns),
        "mlflow": mlflow,
        "mlflow_models": mlflow_models,
        "mlflow_experiment_runs": mlflow_experiment_runs,
        "notebook_resources": notebook_resources,
        "running_notebooks": running_notebooks,
        "pvc": pvc,
    }
