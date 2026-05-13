import asyncio
from fastapi import APIRouter, Request
from app.auth import get_user_namespace, is_admin
from app.services import monitoring_service

router = APIRouter()


@router.get("/gpu-trend")
async def gpu_trend(window_minutes: int = 60, step: str = "1m"):
    return await monitoring_service.get_gpu_trend(window_minutes=window_minutes, step=step)


@router.get("/summary")
async def summary(request: Request, ns: str | None = None):
    namespace = ns or get_user_namespace(request)
    admin = is_admin(request)

    gpu, system, ray, mlflow, mlflow_models, mlflow_experiment_runs, notebook_resources, running_notebooks, pvc, gpu_trend, kserve_rps, kserve_latency_p95, kserve_error_rate, kserve_top5_latency = await asyncio.gather(
        monitoring_service.get_gpu_metrics(),
        monitoring_service.get_system_metrics(namespace),
        monitoring_service.get_ray_status(namespace),
        monitoring_service.get_mlflow_stats(),
        monitoring_service.get_mlflow_model_versions(),
        monitoring_service.get_mlflow_experiment_runs(),
        monitoring_service.get_notebook_resources(),
        monitoring_service.get_running_notebooks(),
        monitoring_service.get_pvc_storage(),
        monitoring_service.get_gpu_trend(window_minutes=60, step="1m"),
        monitoring_service.get_kserve_rps(window_minutes=30, step="1m"),
        monitoring_service.get_kserve_latency_p95(window_minutes=30, step="1m"),
        monitoring_service.get_kserve_error_rate(),
        monitoring_service.get_kserve_top5_latency(),
    )

    return {
        "namespace": namespace,
        "gpu": gpu,
        "gpu_trend": gpu_trend,
        "kserve_rps": kserve_rps,
        "kserve_latency_p95": kserve_latency_p95,
        "kserve_error_rate": kserve_error_rate,
        "kserve_top5_latency": kserve_top5_latency,
        "system": system,
        "ray": ray,
        "automl": monitoring_service.get_automl_jobs(
            namespace=None if admin else namespace,
            is_admin=admin,
        ),
        "kserve": monitoring_service.get_kserve_endpoints(),
        "mlflow": mlflow,
        "mlflow_models": mlflow_models,
        "mlflow_experiment_runs": mlflow_experiment_runs,
        "notebook_resources": notebook_resources,
        "running_notebooks": running_notebooks,
        "pvc": pvc,
    }
