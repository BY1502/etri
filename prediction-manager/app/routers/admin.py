from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, EmailStr
from kubernetes import client, config
from kubernetes.client.rest import ApiException

from app.auth import is_admin, get_user_email, ADMIN_EMAILS
from app.services import keycloak_service

try:
    config.load_incluster_config()
except config.ConfigException:
    config.load_kube_config()

custom_api = client.CustomObjectsApi()
core_v1 = client.CoreV1Api()
rbac_api = client.RbacAuthorizationV1Api()

router = APIRouter()


class QuotaUpdateRequest(BaseModel):
    cpu: str = "8"
    memory: str = "32Gi"
    gpu: str = "2"
    pvc: str = "5"
    storage: str = "50Gi"


class UserCreateRequest(BaseModel):
    email: EmailStr
    first_name: str = ""
    last_name: str = ""
    password: str
    cpu: str = "4"
    memory: str = "16Gi"
    gpu: str = "1"
    pvc: str = "3"
    storage: str = "50Gi"


class PasswordResetRequest(BaseModel):
    password: str
    temporary: bool = True


class ContributorRequest(BaseModel):
    email: EmailStr
    role: str = "edit"  # edit | view


def _check_admin(request: Request):
    if not is_admin(request):
        raise HTTPException(status_code=403, detail="관리자만 접근 가능합니다")


def _email_to_namespace(email: str) -> str:
    return "kubeflow-" + email.replace("@", "-").replace(".", "-")


def _quota_used(namespace: str) -> dict:
    used = {"cpu": "0", "memory": "0", "gpu": "0", "pvc": "0", "storage": "0"}
    try:
        quotas = core_v1.list_namespaced_resource_quota(namespace)
        for q in quotas.items:
            u = q.status.used or {}
            used["cpu"] = str(u.get("requests.cpu", "0"))
            used["memory"] = str(u.get("requests.memory", "0"))
            used["gpu"] = str(u.get("requests.nvidia.com/gpu", "0"))
            used["pvc"] = str(u.get("persistentvolumeclaims", "0"))
            used["storage"] = str(u.get("requests.storage", "0"))
    except Exception:
        pass
    return used


@router.get("/gpu-info")
async def gpu_info(request: Request):
    """GPU 하드웨어 정보 (모델명, VRAM, time-slicing 슬롯 수)"""
    _check_admin(request)
    from app.services import gpu_service
    return gpu_service.get_gpu_hardware_info()


def _parse_cpu(v: str) -> float:
    s = str(v or "0").strip()
    if s.endswith("m"):
        try:
            return int(s[:-1]) / 1000.0
        except ValueError:
            return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _parse_memory_bytes(v: str) -> int:
    s = str(v or "0").strip()
    units = {"Ki": 1024, "Mi": 1024**2, "Gi": 1024**3, "Ti": 1024**4,
             "K": 1000, "M": 1000**2, "G": 1000**3, "T": 1000**4}
    for suf, mul in units.items():
        if s.endswith(suf):
            try:
                return int(float(s[:-len(suf)]) * mul)
            except ValueError:
                return 0
    try:
        return int(s)
    except ValueError:
        return 0


@router.get("/cluster-capacity")
async def cluster_capacity(request: Request):
    """클러스터 총 용량 vs 현재 할당 합계"""
    _check_admin(request)

    # 노드 총 용량
    nodes = core_v1.list_node()
    total_cpu = 0.0
    total_mem = 0
    total_gpu = 0
    total_storage = 0
    for node in nodes.items:
        cap = node.status.capacity or {}
        total_cpu += _parse_cpu(cap.get("cpu", "0"))
        total_mem += _parse_memory_bytes(cap.get("memory", "0"))
        total_gpu += int(cap.get("nvidia.com/gpu", 0))
        total_storage += _parse_memory_bytes(cap.get("ephemeral-storage", "0"))

    # 모든 Profile의 quota 합계 + 실제 사용량 합계
    allocated = {"cpu": 0.0, "memory": 0, "gpu": 0, "pvc": 0, "storage": 0}
    used = {"cpu": 0.0, "memory": 0, "gpu": 0, "pvc": 0, "storage": 0}
    try:
        profiles = custom_api.list_cluster_custom_object("kubeflow.org", "v1", "profiles")
        for p in profiles.get("items", []):
            hard = p.get("spec", {}).get("resourceQuotaSpec", {}).get("hard", {})
            allocated["cpu"] += _parse_cpu(hard.get("requests.cpu", "0"))
            allocated["memory"] += _parse_memory_bytes(hard.get("requests.memory", "0"))
            allocated["gpu"] += int(str(hard.get("requests.nvidia.com/gpu", "0")) or 0)
            allocated["pvc"] += int(str(hard.get("persistentvolumeclaims", "0")) or 0)
            allocated["storage"] += _parse_memory_bytes(hard.get("requests.storage", "0"))

            ns = p["metadata"]["name"]
            u = _quota_used(ns)
            used["cpu"] += _parse_cpu(u.get("cpu", "0"))
            used["memory"] += _parse_memory_bytes(u.get("memory", "0"))
            used["gpu"] += int(str(u.get("gpu", "0")) or 0)
            used["pvc"] += int(str(u.get("pvc", "0")) or 0)
            used["storage"] += _parse_memory_bytes(u.get("storage", "0"))
    except Exception:
        pass

    return {
        "total": {
            "cpu": round(total_cpu, 1),
            "memory_gb": round(total_mem / (1024**3), 1),
            "gpu_slots": total_gpu,
            "storage_gb": round(total_storage / (1024**3), 1),
        },
        "allocated": {
            "cpu": round(allocated["cpu"], 1),
            "memory_gb": round(allocated["memory"] / (1024**3), 1),
            "gpu_slots": allocated["gpu"],
            "pvc": allocated["pvc"],
            "storage_gb": round(allocated["storage"] / (1024**3), 1),
        },
        "used": {
            "cpu": round(used["cpu"], 2),
            "memory_gb": round(used["memory"] / (1024**3), 2),
            "gpu_slots": used["gpu"],
            "pvc": used["pvc"],
            "storage_gb": round(used["storage"] / (1024**3), 2),
        },
        "over_committed": {
            "cpu": allocated["cpu"] > total_cpu,
            "memory": allocated["memory"] > total_mem,
            "gpu": allocated["gpu"] > total_gpu,
            "storage": allocated["storage"] > total_storage,
        },
    }


@router.get("/users")
async def list_users(request: Request):
    """Profile + Keycloak 정보 조인"""
    _check_admin(request)

    profiles = custom_api.list_cluster_custom_object("kubeflow.org", "v1", "profiles")
    profile_by_email = {}
    for p in profiles.get("items", []):
        owner = p.get("spec", {}).get("owner", {}).get("name", "")
        if owner:
            profile_by_email[owner] = p

    try:
        kc_users = keycloak_service.list_users()
    except Exception as e:
        kc_users = []

    users = []
    seen_emails = set()

    for kc in kc_users:
        email = kc.get("email") or kc.get("username") or ""
        if not email:
            continue
        seen_emails.add(email)
        profile = profile_by_email.get(email)
        ns = profile["metadata"]["name"] if profile else None
        quota_spec = (profile or {}).get("spec", {}).get("resourceQuotaSpec", {}).get("hard", {})
        users.append({
            "email": email,
            "first_name": kc.get("firstName", ""),
            "last_name": kc.get("lastName", ""),
            "enabled": kc.get("enabled", False),
            "namespace": ns,
            "is_admin": email in ADMIN_EMAILS,
            "quota": {
                "cpu": str(quota_spec.get("requests.cpu", "0")),
                "memory": str(quota_spec.get("requests.memory", "0")),
                "gpu": str(quota_spec.get("requests.nvidia.com/gpu", "0")),
                "pvc": str(quota_spec.get("persistentvolumeclaims", "0")),
                "storage": str(quota_spec.get("requests.storage", "0")),
            },
            "used": _quota_used(ns) if ns else {"cpu": "0", "memory": "0", "gpu": "0", "pvc": "0"},
        })

    # Profile은 있지만 Keycloak에 없는 경우 (orphan)
    for email, profile in profile_by_email.items():
        if email in seen_emails:
            continue
        ns = profile["metadata"]["name"]
        quota_spec = profile.get("spec", {}).get("resourceQuotaSpec", {}).get("hard", {})
        users.append({
            "email": email,
            "first_name": "",
            "last_name": "",
            "enabled": None,
            "namespace": ns,
            "is_admin": email in ADMIN_EMAILS,
            "orphan": True,
            "quota": {
                "cpu": str(quota_spec.get("requests.cpu", "0")),
                "memory": str(quota_spec.get("requests.memory", "0")),
                "gpu": str(quota_spec.get("requests.nvidia.com/gpu", "0")),
                "pvc": str(quota_spec.get("persistentvolumeclaims", "0")),
                "storage": str(quota_spec.get("requests.storage", "0")),
            },
            "used": _quota_used(ns),
        })

    users.sort(key=lambda u: (not u["is_admin"], u["email"]))
    return users


@router.post("/users")
async def create_user(req: UserCreateRequest, request: Request):
    """Keycloak 사용자 + Kubeflow Profile 동시 생성"""
    _check_admin(request)

    email = req.email
    namespace = _email_to_namespace(email)

    # 1) Keycloak 사용자 생성
    try:
        keycloak_service.create_user(
            email=email,
            first_name=req.first_name,
            last_name=req.last_name,
            password=req.password,
            temporary=True,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Keycloak 사용자 생성 실패: {e}")

    # 2) Kubeflow Profile 생성 (실패 시 Keycloak 롤백)
    profile = {
        "apiVersion": "kubeflow.org/v1",
        "kind": "Profile",
        "metadata": {"name": namespace},
        "spec": {
            "owner": {"kind": "User", "name": email},
            "resourceQuotaSpec": {
                "hard": {
                    "requests.cpu": req.cpu,
                    "requests.memory": req.memory,
                    "requests.nvidia.com/gpu": req.gpu,
                    "persistentvolumeclaims": req.pvc,
                    "requests.storage": req.storage,
                }
            },
        },
    }
    try:
        custom_api.create_cluster_custom_object("kubeflow.org", "v1", "profiles", profile)
    except ApiException as e:
        # 롤백
        try:
            keycloak_service.delete_user(email)
        except Exception:
            pass
        if e.status == 409:
            raise HTTPException(status_code=409, detail=f"이미 존재하는 namespace: {namespace}")
        raise HTTPException(status_code=500, detail=f"Profile 생성 실패: {e}")

    return {"status": "created", "email": email, "namespace": namespace}


@router.delete("/users/{email}")
async def delete_user(email: str, request: Request):
    """Profile + Keycloak 사용자 동시 삭제 (위험!)"""
    _check_admin(request)

    if email == get_user_email(request):
        raise HTTPException(status_code=400, detail="자기 자신은 삭제할 수 없습니다")
    if email in ADMIN_EMAILS:
        raise HTTPException(status_code=400, detail="관리자 계정은 삭제할 수 없습니다")

    namespace = _email_to_namespace(email)

    # 1) Profile 삭제 (namespace + 모든 리소스 삭제됨)
    try:
        custom_api.delete_cluster_custom_object("kubeflow.org", "v1", "profiles", namespace)
        profile_deleted = True
    except ApiException as e:
        if e.status == 404:
            profile_deleted = False
        else:
            raise HTTPException(status_code=500, detail=f"Profile 삭제 실패: {e}")

    # 2) 다른 namespace에 있는 contributor RoleBinding 정리
    contributor_bindings_deleted = []
    try:
        profiles = custom_api.list_cluster_custom_object("kubeflow.org", "v1", "profiles")
        for p in profiles.get("items", []):
            other_ns = p["metadata"]["name"]
            if other_ns == namespace:
                continue
            try:
                bindings = rbac_api.list_namespaced_role_binding(other_ns)
            except ApiException:
                continue
            for b in bindings.items:
                annotations = b.metadata.annotations or {}
                if annotations.get("user") == email:
                    try:
                        rbac_api.delete_namespaced_role_binding(b.metadata.name, other_ns)
                        contributor_bindings_deleted.append(f"{other_ns}/{b.metadata.name}")
                    except ApiException:
                        pass
    except ApiException:
        pass

    # 3) Keycloak 사용자 삭제
    try:
        kc_deleted = keycloak_service.delete_user(email)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Profile은 삭제했으나 Keycloak 삭제 실패: {e}",
        )

    return {
        "status": "deleted",
        "email": email,
        "profile_deleted": profile_deleted,
        "keycloak_deleted": kc_deleted,
        "contributor_bindings_deleted": contributor_bindings_deleted,
    }


@router.post("/users/{email}/reset-password")
async def reset_password(email: str, req: PasswordResetRequest, request: Request):
    _check_admin(request)
    try:
        keycloak_service.reset_password(email, req.password, temporary=req.temporary)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"비밀번호 재설정 실패: {e}")
    return {"status": "reset", "email": email, "temporary": req.temporary}


@router.get("/users/{namespace}/contributors")
async def list_contributors(namespace: str, request: Request):
    """해당 namespace에 대한 contributor(RoleBinding) 목록"""
    _check_admin(request)
    result = []
    try:
        bindings = rbac_api.list_namespaced_role_binding(namespace)
    except ApiException as e:
        raise HTTPException(status_code=500, detail=f"RoleBinding 조회 실패: {e}")

    # Keycloak에 실제 존재하는 사용자 이메일 집합
    try:
        kc_users = keycloak_service.list_users()
        existing_emails = {u.get("email", "").lower() for u in kc_users if u.get("email")}
    except Exception:
        existing_emails = None  # 조회 실패 시 orphan 판단 보류

    for b in bindings.items:
        annotations = b.metadata.annotations or {}
        user_anno = annotations.get("user")
        role_anno = annotations.get("role")
        if user_anno and role_anno:
            orphan = False
            if existing_emails is not None and user_anno.lower() not in existing_emails:
                orphan = True
            result.append({
                "email": user_anno,
                "role": role_anno,
                "binding_name": b.metadata.name,
                "orphan": orphan,
            })
    return result


@router.post("/users/{namespace}/contributors")
async def add_contributor(namespace: str, req: ContributorRequest, request: Request):
    """KFAM 호환 RoleBinding 생성 (cross-namespace access 부여)"""
    _check_admin(request)

    if req.role not in ("edit", "view"):
        raise HTTPException(status_code=400, detail="role은 edit 또는 view여야 합니다")

    profile = None
    try:
        profile = custom_api.get_cluster_custom_object("kubeflow.org", "v1", "profiles", namespace)
    except ApiException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail=f"존재하지 않는 namespace: {namespace}")
        raise
    owner_email = profile.get("spec", {}).get("owner", {}).get("name", "")
    if req.email == owner_email:
        raise HTTPException(status_code=400, detail="owner는 이미 모든 권한이 있습니다")

    safe_email = req.email.replace("@", "-").replace(".", "-")
    binding_name = f"user-{safe_email}-clusterrole-{req.role}"
    cluster_role = f"kubeflow-{req.role}"

    body = client.V1RoleBinding(
        api_version="rbac.authorization.k8s.io/v1",
        kind="RoleBinding",
        metadata=client.V1ObjectMeta(
            name=binding_name,
            namespace=namespace,
            annotations={"role": req.role, "user": req.email},
        ),
        role_ref=client.V1RoleRef(
            api_group="rbac.authorization.k8s.io",
            kind="ClusterRole",
            name=cluster_role,
        ),
        subjects=[client.RbacV1Subject(
            api_group="rbac.authorization.k8s.io",
            kind="User",
            name=req.email,
        )],
    )
    try:
        rbac_api.create_namespaced_role_binding(namespace, body)
    except ApiException as e:
        if e.status == 409:
            raise HTTPException(status_code=409, detail="이미 부여된 권한입니다")
        raise HTTPException(status_code=500, detail=f"RoleBinding 생성 실패: {e}")

    return {"status": "created", "namespace": namespace, "email": req.email, "role": req.role}


@router.delete("/users/{namespace}/contributors/{email}")
async def remove_contributor(namespace: str, email: str, request: Request):
    _check_admin(request)

    bindings = rbac_api.list_namespaced_role_binding(namespace)
    deleted = []
    for b in bindings.items:
        annotations = b.metadata.annotations or {}
        if annotations.get("user") == email:
            try:
                rbac_api.delete_namespaced_role_binding(b.metadata.name, namespace)
                deleted.append(b.metadata.name)
            except ApiException as e:
                raise HTTPException(status_code=500, detail=f"삭제 실패: {e}")

    if not deleted:
        raise HTTPException(status_code=404, detail=f"{email}의 RoleBinding이 없습니다")

    return {"status": "deleted", "deleted": deleted}


@router.put("/users/{namespace}/quota")
async def update_quota(namespace: str, req: QuotaUpdateRequest, request: Request):
    """사용자의 할당량 변경"""
    _check_admin(request)
    profile = custom_api.get_cluster_custom_object(
        "kubeflow.org", "v1", "profiles", namespace
    )
    profile["spec"]["resourceQuotaSpec"] = {
        "hard": {
            "requests.cpu": req.cpu,
            "requests.memory": req.memory,
            "requests.nvidia.com/gpu": req.gpu,
            "persistentvolumeclaims": req.pvc,
            "requests.storage": req.storage,
        }
    }
    custom_api.replace_cluster_custom_object(
        "kubeflow.org", "v1", "profiles", namespace, profile
    )
    return {"status": "updated", "namespace": namespace}


# ============================================================
# MLflow Retention / 디스크 정리
# ============================================================

@router.get("/mlflow/usage")
async def mlflow_usage(request: Request):
    """MLflow PVC 사용량 + run/artifact 통계 조회."""
    _check_admin(request)
    from kubernetes.stream import stream
    pods = core_v1.list_namespaced_pod("ray-system", label_selector="app=mlflow")
    running = [p for p in pods.items if p.status.phase == "Running"]
    if not running:
        raise HTTPException(status_code=503, detail="MLflow pod 없음")
    pod_name = running[0].metadata.name
    try:
        out = stream(
            core_v1.connect_get_namespaced_pod_exec,
            pod_name, "ray-system",
            command=["sh", "-c",
                     "df -B1 /mlflow | awk 'NR==2{print $2,$3,$4}'; "
                     "du -sb /mlflow/mlartifacts 2>/dev/null | awk '{print $1}'; "
                     "du -sb /mlflow/mlflow.db 2>/dev/null | awk '{print $1}'"],
            stderr=True, stdin=False, stdout=True, tty=False,
        )
        lines = [l.strip() for l in out.strip().split("\n") if l.strip()]
        total_b, used_b, avail_b = [int(x) for x in lines[0].split()] if lines else (0, 0, 0)
        artifact_b = int(lines[1]) if len(lines) > 1 else 0
        db_b = int(lines[2]) if len(lines) > 2 else 0
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"exec 실패: {type(e).__name__}")

    # MLflow 메타 통계
    import httpx
    import os as _os
    MLFLOW = _os.environ.get("MLFLOW_URI", "http://mlflow-service.ray-system:5000")
    stats = {"experiments_active": 0, "experiments_deleted": 0,
             "runs_active": 0, "runs_deleted": 0, "registered_models": 0}
    try:
        r = httpx.get(f"{MLFLOW}/api/2.0/mlflow/experiments/search",
                      params={"max_results": 1000, "view_type": "ALL"}, timeout=10)
        if r.status_code == 200:
            for exp in r.json().get("experiments", []):
                if exp.get("lifecycle_stage") == "active":
                    stats["experiments_active"] += 1
                else:
                    stats["experiments_deleted"] += 1
        # 전체 run 조회 (간단 집계)
        r2 = httpx.post(f"{MLFLOW}/api/2.0/mlflow/runs/search",
                        json={"experiment_ids": [str(i) for i in range(100)],
                              "max_results": 50000, "run_view_type": "ALL"}, timeout=15)
        if r2.status_code == 200:
            for run in r2.json().get("runs", []):
                if run.get("info", {}).get("lifecycle_stage") == "active":
                    stats["runs_active"] += 1
                else:
                    stats["runs_deleted"] += 1
        r3 = httpx.get(f"{MLFLOW}/api/2.0/mlflow/registered-models/search",
                       params={"max_results": 1000}, timeout=10)
        if r3.status_code == 200:
            stats["registered_models"] = len(r3.json().get("registered_models", []))
    except Exception:
        pass

    return {
        "total_bytes": total_b,
        "used_bytes": used_b,
        "available_bytes": avail_b,
        "artifact_bytes": artifact_b,
        "db_bytes": db_b,
        "used_pct": round(used_b / total_b * 100, 1) if total_b else 0,
        **stats,
    }


class MLflowGCRequest(BaseModel):
    older_than_days: int = 30


@router.post("/mlflow/gc")
async def mlflow_gc(req: MLflowGCRequest, request: Request):
    """MLflow GC 수동 실행. 지정 일수 이상 지난 deleted run 영구 제거."""
    _check_admin(request)
    from kubernetes.stream import stream
    pods = core_v1.list_namespaced_pod("ray-system", label_selector="app=mlflow")
    running = [p for p in pods.items if p.status.phase == "Running"]
    if not running:
        raise HTTPException(status_code=503, detail="MLflow pod 없음")
    pod_name = running[0].metadata.name
    days = max(0, int(req.older_than_days))
    cmd = (
        "echo '---before---'; "
        "du -sh /mlflow/mlartifacts 2>/dev/null; "
        # mlflow-artifacts://  URI 스킴 해석에는 MLflow 서버의 HTTP tracking URI 필요
        "export MLFLOW_TRACKING_URI=http://localhost:5000; "
        "mlflow gc "
        "--backend-store-uri sqlite:////mlflow/mlflow.db "
        "--artifacts-destination file:///mlflow/mlartifacts "
        f"--older-than {days}d0h0m0s 2>&1 | tail -100; "
        "echo '---after---'; "
        "du -sh /mlflow/mlartifacts 2>/dev/null"
    )
    try:
        out = stream(
            core_v1.connect_get_namespaced_pod_exec,
            pod_name, "ray-system",
            command=["sh", "-c", cmd],
            stderr=True, stdin=False, stdout=True, tty=False,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"exec 실패: {type(e).__name__}")
    return {"status": "ok", "older_than_days": days, "output": out[-4000:]}
