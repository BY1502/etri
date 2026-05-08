import asyncio
from fastapi import APIRouter, Request
from app.auth import get_user_namespace, is_admin
from app.services import monitoring_service

router = APIRouter()


@router.get("/summary")
async def summary(request: Request, ns: str | None = None):
    namespace = ns or get_user_namespace(request)
    admin = is_admin(request)

    gpu, system = await asyncio.gather(
        monitoring_service.get_gpu_metrics(),
        monitoring_service.get_system_metrics(namespace),
    )

    return {
        "namespace": namespace,
        "gpu": gpu,
        "system": system,
        "automl_jobs": monitoring_service.get_automl_jobs(
            namespace=None if admin else namespace,
            is_admin=admin,
        ),
        "ray": monitoring_service.get_ray_status(namespace),
        "kserve": monitoring_service.get_kserve_endpoints(),
    }


@router.get("/gpu")
async def gpu(request: Request):
    return await monitoring_service.get_gpu_metrics()


@router.get("/ray")
async def ray(request: Request, ns: str | None = None):
    return {"message": "ray metrics - not implemented yet"}


@router.get("/kserve")
async def kserve(request: Request, ns: str | None = None):
    return {"message": "kserve metrics - not implemented yet"}
