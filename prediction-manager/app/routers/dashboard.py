from fastapi import APIRouter, Request
from kubernetes import client, config

from app.services import registry_service, notebook_service, gpu_service
from app.auth import get_user_namespace, is_admin, get_all_kubeflow_namespaces

try:
    config.load_incluster_config()
except config.ConfigException:
    config.load_kube_config()

core_v1 = client.CoreV1Api()
custom_api = client.CustomObjectsApi()

router = APIRouter()


def _get_ns_resource_detail(ns: str) -> dict:
    """단일 namespace의 쿼터 + 사용량 + 노트북 수."""
    quota_spec = {}
    email = ""
    try:
        prof = custom_api.get_cluster_custom_object("kubeflow.org", "v1", "profiles", ns)
        email = prof.get("spec", {}).get("owner", {}).get("name", "")
        quota_spec = prof.get("spec", {}).get("resourceQuotaSpec", {}).get("hard", {})
    except Exception:
        pass

    used = {"cpu": "0", "memory": "0", "gpu": "0", "pvc": "0", "storage": "0"}
    try:
        quotas = core_v1.list_namespaced_resource_quota(ns)
        for q in quotas.items:
            u = q.status.used or {}
            used["cpu"] = str(u.get("requests.cpu", "0"))
            used["memory"] = str(u.get("requests.memory", "0"))
            used["gpu"] = str(u.get("requests.nvidia.com/gpu", "0"))
            used["pvc"] = str(u.get("persistentvolumeclaims", "0"))
            used["storage"] = str(u.get("requests.storage", "0"))
    except Exception:
        pass

    try:
        nbs = custom_api.list_namespaced_custom_object("kubeflow.org", "v1", ns, "notebooks")
        nb_count = len(nbs.get("items", []))
    except Exception:
        nb_count = 0

    return {
        "namespace": ns,
        "email": email,
        "quota": {
            "cpu": str(quota_spec.get("requests.cpu", "0")),
            "memory": str(quota_spec.get("requests.memory", "0")),
            "gpu": str(quota_spec.get("requests.nvidia.com/gpu", "0")),
            "pvc": str(quota_spec.get("persistentvolumeclaims", "0")),
            "storage": str(quota_spec.get("requests.storage", "0")),
        },
        "used": used,
        "notebook_count": nb_count,
    }


def _get_user_resource_summary() -> list[dict]:
    """사용자별 namespace 리소스 할당/사용 현황 (admin 용 전체 목록)."""
    profiles = custom_api.list_cluster_custom_object("kubeflow.org", "v1", "profiles")
    return [_get_ns_resource_detail(p["metadata"]["name"]) for p in profiles.get("items", [])]


def _count_by(items: list[dict], key: str) -> dict:
    counts = {}
    for item in items:
        value = str(item.get(key) or "Unknown")
        counts[value] = counts.get(value, 0) + 1
    return counts


@router.get("/summary")
async def get_summary(request: Request):
    admin = is_admin(request)
    my_ns = get_user_namespace(request)
    if admin:
        images = await registry_service.list_all_repositories()
        all_notebooks = []
        for ns in get_all_kubeflow_namespaces():
            all_notebooks.extend(notebook_service.list_notebooks(namespace=ns))
        notebooks = all_notebooks
        gpu = gpu_service.get_gpu_status()
        user_resources = _get_user_resource_summary()
    else:
        images = await registry_service.list_repositories(namespace=my_ns)
        notebooks = notebook_service.list_notebooks(namespace=my_ns)
        gpu = gpu_service.get_user_gpu_status(my_ns)
        user_resources = []

    # 모든 사용자 (admin 포함) 에게 본인 namespace 쿼터·사용량 제공
    try:
        my_resource = _get_ns_resource_detail(my_ns)
    except Exception:
        my_resource = None

    # 이미지에 소유자 정보 추가
    images_with_owner = []
    for img in images:
        owner = "-"
        if "/" in img["name"]:
            owner = img["name"].split("/")[0]
        images_with_owner.append({**img, "owner": owner})

    # AutoML 최근 Jobs (admin은 전체, 일반 사용자는 자기 namespace)
    automl_jobs = []
    automl_status_counts = {}
    try:
        from app.services import automl_service
        jobs = automl_service.list_jobs(
            namespace=None if admin else my_ns,
            is_admin=admin,
        )
        automl_status_counts = _count_by(jobs, "status")
        automl_jobs = jobs[:5]
    except Exception:
        pass

    return {
        "is_admin": admin,
        "image_count": len(images),
        "notebook_count": len(notebooks),
        "gpu_total": gpu["total"],
        "gpu_used": gpu["used"],
        "gpu_available": gpu["available"],
        "gpu_hardware": gpu.get("hardware", {}),
        "notebook_status_counts": _count_by(notebooks, "status"),
        "recent_images": images_with_owner[:5],
        "recent_notebooks": notebooks[:5],
        "user_resources": user_resources,
        "my_resource": my_resource,
        "automl_status_counts": automl_status_counts,
        "automl_jobs": automl_jobs,
    }
