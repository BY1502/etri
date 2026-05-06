from fastapi import HTTPException, Request
from kubernetes import client, config

try:
    config.load_incluster_config()
except config.ConfigException:
    config.load_kube_config()

custom_api = client.CustomObjectsApi()

ADMIN_EMAILS = ["admin@example.com"]

# 익명/미인증 요청 표식. 실제 이메일과 충돌하지 않는 값.
# 프론트 개발 시 `ALLOW_UNAUTHENTICATED=true` + `DEV_USER_EMAIL=...` 로 우회 가능.
_ANONYMOUS_SENTINEL = "__anonymous__@__unauthenticated__"

import os as _os

_ALLOW_UNAUTH = _os.environ.get("ALLOW_UNAUTHENTICATED", "").lower() in ("1", "true", "yes")
_DEV_USER_EMAIL = _os.environ.get("DEV_USER_EMAIL", "")


def get_user_email(request: Request) -> str:
    """인증된 사용자의 email. Istio RequestAuthentication이 JWT claim으로 설정한 값.

    Istio 측에서 클라이언트가 송신한 `kubeflow-userid` 헤더는 이미 strip 됨
    (istio-system/strip-client-auth-headers EnvoyFilter). 이 함수가 반환하는 값은
    반드시 gateway에서 검증한 JWT claim에서 유래.
    """
    email = (
        request.headers.get("kubeflow-userid")
        or request.headers.get("x-auth-request-email")
    )
    if email:
        return email
    # 헤더 없음: 개발 환경 예외만 허용
    if _ALLOW_UNAUTH and _DEV_USER_EMAIL:
        return _DEV_USER_EMAIL
    return _ANONYMOUS_SENTINEL


def require_authenticated(request: Request) -> str:
    """신원 헤더가 없으면 401. 엔드포인트에서 early return 용."""
    email = get_user_email(request)
    if email == _ANONYMOUS_SENTINEL:
        raise HTTPException(status_code=401, detail="인증되지 않은 요청")
    return email


def _get_owner_namespace(request: Request) -> str:
    """이메일로 Profile owner 검색해서 기본 네임스페이스 반환"""
    email = get_user_email(request)
    try:
        resp = custom_api.list_cluster_custom_object(
            "kubeflow.org", "v1", "profiles"
        )
        for p in resp.get("items", []):
            owner = p.get("spec", {}).get("owner", {})
            if owner.get("name") == email:
                return p["metadata"]["name"]
    except Exception:
        pass
    ns_suffix = email.replace("@", "-").replace(".", "-")
    return f"kubeflow-{ns_suffix}"


def get_owner_namespace(request: Request) -> str:
    """Contributor override를 무시하고 사용자가 소유한 Profile namespace를 반환."""
    return _get_owner_namespace(request)


def get_user_namespace(request: Request) -> str:
    """작업 대상 namespace.

    우선순위:
    1. 요청 쿼리 파라미터 ?ns= (권한 있는 namespace만 허용)
    2. 요청 헤더 x-pm-namespace
    3. Profile owner (기본)
    """
    override = request.query_params.get("ns") or request.headers.get("x-pm-namespace")
    if override:
        if is_admin(request):
            return override
        accessible = {a["namespace"] for a in get_user_accessible_namespaces(request)}
        if override in accessible:
            return override
    return _get_owner_namespace(request)


def is_admin(request: Request) -> bool:
    email = get_user_email(request)
    if email == _ANONYMOUS_SENTINEL:
        return False
    return email in ADMIN_EMAILS


def get_all_kubeflow_namespaces() -> list[str]:
    """모든 Kubeflow Profile 네임스페이스 목록"""
    resp = custom_api.list_cluster_custom_object(
        "kubeflow.org", "v1", "profiles"
    )
    return [p["metadata"]["name"] for p in resp.get("items", [])]


def get_user_accessible_namespaces(request: Request) -> list[dict]:
    """
    사용자가 접근 가능한 namespace 목록 (자기 것 + contributor)
    KFAM API의 RoleBinding을 검색
    """
    email = get_user_email(request)
    if is_admin(request):
        # 관리자는 모든 네임스페이스
        return [
            {"namespace": ns, "role": "admin"}
            for ns in get_all_kubeflow_namespaces()
        ]

    result = []
    rbac_api = client.RbacAuthorizationV1Api()
    for ns in get_all_kubeflow_namespaces():
        try:
            bindings = rbac_api.list_namespaced_role_binding(ns)
            for b in bindings.items:
                annotations = (b.metadata.annotations or {})
                user_anno = annotations.get("user")
                if user_anno == email:
                    role = annotations.get("role", "viewer")
                    result.append({"namespace": ns, "role": role})
                    break
                # Profile owner인 경우 (annotation 없을 수 있음)
                for sub in (b.subjects or []):
                    if sub.kind == "User" and sub.name == email:
                        if {"namespace": ns} not in [
                            {"namespace": r["namespace"]} for r in result
                        ]:
                            result.append({"namespace": ns, "role": "owner"})
                        break
        except Exception:
            pass
    return result
