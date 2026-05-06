"""Tenant-scoped dashboard and tracking endpoints.

MLflow, Ray, and NiFi contain training metadata, logs, and artifacts.  They are
therefore treated as owner-private resources even when a Kubeflow Profile has
contributors.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass

from fastapi import HTTPException, Request
from kubernetes import client, config
from kubernetes.client.rest import ApiException

from app.auth import ADMIN_EMAILS, get_user_email, get_user_namespace, is_admin

try:
    config.load_incluster_config()
except config.ConfigException:
    config.load_kube_config()

core_v1 = client.CoreV1Api()
custom_api = client.CustomObjectsApi()

TENANT_RESOURCES_ENABLED = os.environ.get(
    "PM_TENANT_RESOURCES_ENABLED", "true"
).lower() in ("1", "true", "yes")

MLFLOW_SERVICE_NAME = os.environ.get("PM_MLFLOW_SERVICE_NAME", "pm-mlflow")
MLFLOW_POD_SELECTOR = os.environ.get("PM_MLFLOW_POD_SELECTOR", "app=pm-mlflow")
RAY_CLUSTER_NAME = os.environ.get("PM_RAY_CLUSTER_NAME", "pm-ray")
NIFI_SERVICE_NAME = os.environ.get("PM_NIFI_SERVICE_NAME", "nifi")

LEGACY_MLFLOW_URI = os.environ.get(
    "MLFLOW_URI", "http://mlflow-service.ray-system:5000"
)
LEGACY_RAY_DASHBOARD_URL = os.environ.get(
    "RAY_DASHBOARD_URL",
    "http://ray-optuna-mlflow-cluster-head-svc.ray-system:8265",
)

_NS_RE = re.compile(r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$")


@dataclass
class TenantDashboard:
    namespace: str
    owner_email: str | None
    path: str
    internal_url: str | None
    ready: bool
    provisioned: bool


def validate_namespace(namespace: str) -> str:
    if not namespace or len(namespace) > 63 or not _NS_RE.match(namespace):
        raise HTTPException(status_code=400, detail="잘못된 namespace")
    return namespace


def namespace_owner(namespace: str) -> str | None:
    validate_namespace(namespace)
    try:
        profile = custom_api.get_cluster_custom_object(
            "kubeflow.org", "v1", "profiles", namespace
        )
    except ApiException:
        return None
    return profile.get("spec", {}).get("owner", {}).get("name")


def known_profile_namespaces() -> list[str]:
    try:
        resp = custom_api.list_cluster_custom_object(
            "kubeflow.org", "v1", "profiles"
        )
    except Exception:
        return []
    return [p["metadata"]["name"] for p in resp.get("items", [])]


def resolve_private_namespace(request: Request, namespace: str | None = None) -> str:
    """Resolve a dashboard namespace with owner-only semantics.

    Unlike general Prediction Manager resources, private dashboards deliberately
    ignore contributor access.  Admins may open every tenant; regular users may
    open only the Profile they own.
    """
    ns = validate_namespace(
        namespace
        or request.query_params.get("ns")
        or request.query_params.get("namespace")
        or get_user_namespace(request)
    )
    owner = namespace_owner(ns)
    if not owner:
        raise HTTPException(status_code=404, detail=f"Profile namespace 없음: {ns}")
    if is_admin(request):
        return ns
    email = get_user_email(request)
    if owner != email:
        raise HTTPException(status_code=403, detail="자기 namespace만 열 수 있습니다")
    return ns


def allowed_dashboard_users(namespace: str) -> list[str]:
    owner = namespace_owner(namespace)
    users = [u for u in [owner, *ADMIN_EMAILS] if u]
    return sorted(set(users))


def mlflow_tracking_uri(namespace: str | None = None) -> str:
    if not TENANT_RESOURCES_ENABLED or not namespace:
        return LEGACY_MLFLOW_URI
    validate_namespace(namespace)
    return f"http://{MLFLOW_SERVICE_NAME}.{namespace}.svc.cluster.local:5000"


def ray_dashboard_url(namespace: str | None = None) -> str:
    if not TENANT_RESOURCES_ENABLED or not namespace:
        return LEGACY_RAY_DASHBOARD_URL
    validate_namespace(namespace)
    return f"http://{RAY_CLUSTER_NAME}-head-svc.{namespace}.svc.cluster.local:8265"


def mlflow_public_path(namespace: str) -> str:
    return f"/mlflow/{validate_namespace(namespace)}/"


def ray_public_path(namespace: str) -> str:
    return f"/ray/{validate_namespace(namespace)}/"


def nifi_public_path(namespace: str) -> str:
    return f"/nifi/{validate_namespace(namespace)}/"


def mlflow_kubernetes_namespace(namespace: str | None = None) -> str:
    if not TENANT_RESOURCES_ENABLED or not namespace:
        return "ray-system"
    return validate_namespace(namespace)


def mlflow_pod_selector(namespace: str | None = None) -> str:
    if not TENANT_RESOURCES_ENABLED or not namespace:
        return "app=mlflow"
    return MLFLOW_POD_SELECTOR


def find_mlflow_pod(core_api: client.CoreV1Api, namespace: str | None = None) -> tuple[str, str] | None:
    pod_ns = mlflow_kubernetes_namespace(namespace)
    selector = mlflow_pod_selector(namespace)
    pods = core_api.list_namespaced_pod(pod_ns, label_selector=selector)
    for pod in pods.items:
        if pod.status.phase == "Running":
            return pod_ns, pod.metadata.name
    return None


def _service_ready(namespace: str, service_name: str, port_name: str | None = None) -> bool:
    try:
        svc = core_v1.read_namespaced_service(service_name, namespace)
    except ApiException:
        return False
    if port_name:
        names = {p.name for p in (svc.spec.ports or [])}
        if port_name not in names:
            return False
    return True


def mlflow_status(namespace: str) -> TenantDashboard:
    namespace = validate_namespace(namespace)
    ready = _service_ready(namespace, MLFLOW_SERVICE_NAME)
    return TenantDashboard(
        namespace=namespace,
        owner_email=namespace_owner(namespace),
        path=mlflow_public_path(namespace),
        internal_url=mlflow_tracking_uri(namespace),
        ready=ready,
        provisioned=ready,
    )


def ray_status(namespace: str) -> TenantDashboard:
    namespace = validate_namespace(namespace)
    ready = _service_ready(namespace, f"{RAY_CLUSTER_NAME}-head-svc", "dashboard")
    return TenantDashboard(
        namespace=namespace,
        owner_email=namespace_owner(namespace),
        path=ray_public_path(namespace),
        internal_url=ray_dashboard_url(namespace),
        ready=ready,
        provisioned=ready,
    )


def nifi_status(namespace: str) -> TenantDashboard:
    namespace = validate_namespace(namespace)
    ready = _service_ready(namespace, NIFI_SERVICE_NAME, "http")
    return TenantDashboard(
        namespace=namespace,
        owner_email=namespace_owner(namespace),
        path=nifi_public_path(namespace),
        internal_url=f"http://{NIFI_SERVICE_NAME}.{namespace}.svc.cluster.local:8080",
        ready=ready,
        provisioned=ready,
    )
