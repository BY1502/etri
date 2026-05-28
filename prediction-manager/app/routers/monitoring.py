import asyncio
import math
import time
from fastapi import APIRouter, Request, Query
from app.auth import get_user_namespace, get_owner_namespace, is_admin, get_user_email
from app.services import monitoring_service, alarm_service

router = APIRouter()

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

    result = {
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
    await alarm_service.update_alarms_async(result)
    result["alarms"] = await alarm_service.get_active_async()
    result["zones"] = alarm_service.ZONES
    return result


@router.get("/alarms/history")
async def alarm_history(limit: int = Query(default=500, ge=1, le=1000)):
    return await alarm_service.get_history_async(limit=limit)
