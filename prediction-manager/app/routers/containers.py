from fastapi import APIRouter, Request

from app.models.notebook_models import NotebookCreateRequest
from app.services import notebook_service
from app.auth import get_user_email, get_user_namespace, is_admin, get_all_kubeflow_namespaces

router = APIRouter()


@router.get("")
async def list_containers(request: Request):
    if is_admin(request):
        all_notebooks = []
        for ns in get_all_kubeflow_namespaces():
            all_notebooks.extend(notebook_service.list_notebooks(namespace=ns))
        return all_notebooks
    ns = get_user_namespace(request)
    return notebook_service.list_notebooks(namespace=ns)


@router.post("")
async def create_container(req: NotebookCreateRequest, request: Request):
    ns = get_user_namespace(request)
    email = get_user_email(request)
    image = req.custom_image.strip() if req.custom_image else req.image
    notebook_service.create_notebook(
        name=req.name,
        image=image,
        cpu_request=req.cpu_request,
        cpu_limit=req.cpu_limit,
        memory_request=req.memory_request,
        memory_limit=req.memory_limit,
        gpu_count=req.gpu_count,
        gpu_vendor=req.gpu_vendor,
        workspace_source=req.workspace_source,
        workspace_name=req.workspace_name,
        workspace_size=req.workspace_size,
        workspace_storage_class=req.workspace_storage_class,
        workspace_access_mode=req.workspace_access_mode,
        workspace_mount_path=req.workspace_mount_path,
        data_volumes=[dv.model_dump() for dv in req.data_volumes],
        enable_shared_memory=req.enable_shared_memory,
        env_vars=[e.model_dump() for e in req.env_vars],
        notebook_type=req.notebook_type,
        image_pull_policy=req.image_pull_policy,
        affinity_config=req.affinity_config,
        toleration_group=req.toleration_group,
        pod_defaults=req.pod_defaults,
        namespace=ns,
        creator=email,
    )
    return {"status": "created", "name": req.name}


@router.get("/pvcs")
async def list_user_pvcs(request: Request):
    """현재 사용자 namespace의 PVC 목록 (기존 볼륨 선택용)."""
    ns = get_user_namespace(request)
    return notebook_service.list_pvcs(ns)


@router.get("/spawner-config")
async def get_spawner_config(request: Request):
    """Kubeflow JWA spawner config (이미지·GPU vendor·affinity 등 기본값).
    이미지 옵션은 사용자 namespace 의 Registry 이미지로 동적 보강 + 시스템 이미지 제외.
    """
    ns = get_user_namespace(request)
    return notebook_service.get_spawner_config(user_namespace=ns)


@router.get("/pod-defaults")
async def get_pod_defaults(request: Request):
    """사용자 namespace의 PodDefault 목록 (Configurations 체크박스)."""
    ns = get_user_namespace(request)
    return notebook_service.list_pod_defaults(ns)


@router.delete("/{name}")
async def delete_container(name: str, request: Request):
    ns = get_user_namespace(request)
    notebook_service.delete_notebook(name, namespace=ns)
    return {"status": "deleted", "name": name}


@router.patch("/{name}/stop")
async def stop_container(name: str, request: Request):
    ns = get_user_namespace(request)
    notebook_service.stop_notebook(name, namespace=ns)
    return {"status": "stopped", "name": name}


@router.patch("/{name}/start")
async def start_container(name: str, request: Request):
    ns = get_user_namespace(request)
    notebook_service.start_notebook(name, namespace=ns)
    return {"status": "started", "name": name}
