from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlparse

from kubernetes import client, config
from kubernetes.client.rest import ApiException

from app.auth import ADMIN_EMAILS
from app.config import settings

try:
    config.load_incluster_config()
except config.ConfigException:
    config.load_kube_config()

apps_v1 = client.AppsV1Api()
core_v1 = client.CoreV1Api()
custom_api = client.CustomObjectsApi()

NIFI_IMAGE = "apache/nifi:1.28.1"
NIFI_APP_LABEL = "pm-user-nifi"
NIFI_STORAGE_SIZE = "5Gi"


@dataclass
class NifiInstance:
    namespace: str
    owner_email: str
    path: str
    ready: bool


def _external_host() -> str:
    parsed = urlparse(settings.kubeflow_url)
    return parsed.netloc or settings.kubeflow_url.replace("https://", "").replace("http://", "")


def get_namespace_owner(namespace: str) -> str | None:
    try:
        profile = custom_api.get_cluster_custom_object(
            "kubeflow.org", "v1", "profiles", namespace
        )
    except ApiException:
        return None
    return profile.get("spec", {}).get("owner", {}).get("name")


def _safe_policy_name(namespace: str) -> str:
    return f"nifi-owner-{namespace}"[:63].rstrip("-")


def _nifi_path(namespace: str) -> str:
    return f"/nifi/{namespace}"


def _owner_values(owner_email: str) -> list[str]:
    values = [owner_email]
    values.extend(email for email in ADMIN_EMAILS if email != owner_email)
    return values


def _nifi_proxy_headers(namespace: str) -> dict:
    return {
        "request": {
            "set": {
                "X-ProxyContextPath": _nifi_path(namespace),
                "X-ProxyHost": _external_host(),
                "X-ProxyScheme": "https",
            },
            "remove": ["authorization", "x-forwarded-access-token"],
        }
    }


def _statefulset(namespace: str, owner_email: str) -> client.V1StatefulSet:
    path = _nifi_path(namespace)
    host = _external_host()
    labels = {
        "app": NIFI_APP_LABEL,
        "app.kubernetes.io/name": "nifi",
        "app.kubernetes.io/managed-by": "prediction-manager",
        "prediction-manager.io/owner-namespace": namespace,
    }
    annotations = {"prediction-manager.io/owner-email": owner_email}
    patch_conf = f"""
set -e
mkdir -p /pvc/conf
if [ ! -f /pvc/conf/nifi.properties ]; then
  cp -a /opt/nifi/nifi-current/conf/. /pvc/conf/
fi
P=/pvc/conf/nifi.properties
sed -i 's|^nifi.web.https.port=.*|nifi.web.https.port=|' "$P"
sed -i 's|^nifi.web.https.host=.*|nifi.web.https.host=|' "$P"
sed -i 's|^nifi.web.http.host=.*|nifi.web.http.host=0.0.0.0|' "$P"
sed -i 's|^nifi.web.http.port=.*|nifi.web.http.port=8080|' "$P"
sed -i 's|^nifi.web.proxy.host=.*|nifi.web.proxy.host={host}|' "$P"
sed -i 's|^nifi.web.proxy.context.path=.*|nifi.web.proxy.context.path={path}|' "$P"
sed -i 's|^nifi.sensitive.props.key=.*|nifi.sensitive.props.key=changeMePleaseChangeMePleaseChangeMe|' "$P"
sed -i 's|^nifi.security.user.authorizer=.*|nifi.security.user.authorizer=|' "$P"
sed -i 's|^nifi.security.user.login.identity.provider=.*|nifi.security.user.login.identity.provider=|' "$P"
sed -i 's|^nifi.remote.input.secure=.*|nifi.remote.input.secure=false|' "$P"
sed -i 's|^nifi.remote.input.host=.*|nifi.remote.input.host=|' "$P"
sed -i 's|^nifi.remote.input.socket.port=.*|nifi.remote.input.socket.port=|' "$P"
sed -i 's|^nifi.cluster.protocol.is.secure=.*|nifi.cluster.protocol.is.secure=false|' "$P"
"""
    return client.V1StatefulSet(
        api_version="apps/v1",
        kind="StatefulSet",
        metadata=client.V1ObjectMeta(
            name="nifi",
            namespace=namespace,
            labels=labels,
            annotations=annotations,
        ),
        spec=client.V1StatefulSetSpec(
            service_name="nifi",
            replicas=1,
            selector=client.V1LabelSelector(match_labels={"app": NIFI_APP_LABEL}),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(labels=labels, annotations=annotations),
                spec=client.V1PodSpec(
                    init_containers=[
                        client.V1Container(
                            name="init-conf",
                            image=NIFI_IMAGE,
                            command=["sh", "-c", patch_conf],
                            resources=client.V1ResourceRequirements(
                                requests={"cpu": "50m", "memory": "256Mi"},
                                limits={"cpu": "250m", "memory": "512Mi"},
                            ),
                            volume_mounts=[
                                client.V1VolumeMount(name="data", mount_path="/pvc")
                            ],
                        )
                    ],
                    containers=[
                        client.V1Container(
                            name="nifi",
                            image=NIFI_IMAGE,
                            ports=[
                                client.V1ContainerPort(container_port=8080, name="http")
                            ],
                            env=[
                                client.V1EnvVar(name="NIFI_WEB_HTTP_PORT", value="8080"),
                                client.V1EnvVar(name="NIFI_WEB_PROXY_HOST", value=host),
                                client.V1EnvVar(
                                    name="NIFI_WEB_PROXY_CONTEXT_PATH", value=path
                                ),
                            ],
                            resources=client.V1ResourceRequirements(
                                requests={"cpu": "250m", "memory": "1Gi"},
                                limits={"cpu": "1", "memory": "2Gi"},
                            ),
                            startup_probe=client.V1Probe(
                                http_get=client.V1HTTPGetAction(path="/nifi/", port=8080),
                                initial_delay_seconds=60,
                                period_seconds=10,
                                failure_threshold=60,
                            ),
                            volume_mounts=[
                                client.V1VolumeMount(
                                    name="data",
                                    mount_path="/opt/nifi/nifi-current/conf",
                                    sub_path="conf",
                                ),
                                client.V1VolumeMount(
                                    name="data",
                                    mount_path="/opt/nifi/nifi-current/database_repository",
                                    sub_path="database",
                                ),
                                client.V1VolumeMount(
                                    name="data",
                                    mount_path="/opt/nifi/nifi-current/flowfile_repository",
                                    sub_path="flowfile",
                                ),
                                client.V1VolumeMount(
                                    name="data",
                                    mount_path="/opt/nifi/nifi-current/content_repository",
                                    sub_path="content",
                                ),
                                client.V1VolumeMount(
                                    name="data",
                                    mount_path="/opt/nifi/nifi-current/provenance_repository",
                                    sub_path="provenance",
                                ),
                            ],
                        )
                    ],
                ),
            ),
            volume_claim_templates=[
                client.V1PersistentVolumeClaim(
                    metadata=client.V1ObjectMeta(name="data"),
                    spec=client.V1PersistentVolumeClaimSpec(
                        access_modes=["ReadWriteOnce"],
                        resources=client.V1ResourceRequirements(
                            requests={"storage": NIFI_STORAGE_SIZE}
                        ),
                    ),
                )
            ],
        ),
    )


def _service(namespace: str, owner_email: str) -> client.V1Service:
    return client.V1Service(
        api_version="v1",
        kind="Service",
        metadata=client.V1ObjectMeta(
            name="nifi",
            namespace=namespace,
            labels={
                "app": NIFI_APP_LABEL,
                "app.kubernetes.io/managed-by": "prediction-manager",
            },
            annotations={"prediction-manager.io/owner-email": owner_email},
        ),
        spec=client.V1ServiceSpec(
            selector={"app": NIFI_APP_LABEL},
            ports=[
                client.V1ServicePort(name="http", port=8080, target_port=8080)
            ],
        ),
    )


def _virtual_service(namespace: str, owner_email: str) -> dict:
    path = _nifi_path(namespace)
    host = _external_host()
    referer = f"https://{re.escape(host)}{path}(/.*)?"
    headers = _nifi_proxy_headers(namespace)
    return {
        "apiVersion": "networking.istio.io/v1",
        "kind": "VirtualService",
        "metadata": {
            "name": "pm-nifi-dashboard",
            "namespace": namespace,
            "labels": {"app.kubernetes.io/managed-by": "prediction-manager"},
            "annotations": {"prediction-manager.io/owner-email": owner_email},
        },
        "spec": {
            "gateways": ["kubeflow/kubeflow-gateway"],
            "hosts": ["*"],
            "http": [
                {
                    "match": [
                        {"uri": {"exact": f"{path}/nifi-api"}},
                        {"uri": {"prefix": f"{path}/nifi-api/"}},
                        {
                            "uri": {"exact": "/nifi/nifi-api"},
                            "headers": {"referer": {"regex": referer}},
                        },
                        {
                            "uri": {"prefix": "/nifi/nifi-api/"},
                            "headers": {"referer": {"regex": referer}},
                        },
                    ],
                    "rewrite": {"uri": "/nifi-api/"},
                    "headers": headers,
                    "route": [
                        {
                            "destination": {
                                "host": f"nifi.{namespace}.svc.cluster.local",
                                "port": {"number": 8080},
                            }
                        }
                    ],
                },
                {
                    "match": [
                        {"uri": {"exact": f"{path}/nifi-docs"}},
                        {"uri": {"prefix": f"{path}/nifi-docs/"}},
                        {
                            "uri": {"exact": "/nifi/nifi-docs"},
                            "headers": {"referer": {"regex": referer}},
                        },
                        {
                            "uri": {"prefix": "/nifi/nifi-docs/"},
                            "headers": {"referer": {"regex": referer}},
                        },
                    ],
                    "rewrite": {"uri": "/nifi-docs/"},
                    "headers": headers,
                    "route": [
                        {
                            "destination": {
                                "host": f"nifi.{namespace}.svc.cluster.local",
                                "port": {"number": 8080},
                            }
                        }
                    ],
                },
                {
                    "match": [
                        {"uri": {"exact": path}},
                        {"uri": {"prefix": f"{path}/"}},
                    ],
                    "rewrite": {"uri": "/nifi/"},
                    "headers": headers,
                    "route": [
                        {
                            "destination": {
                                "host": f"nifi.{namespace}.svc.cluster.local",
                                "port": {"number": 8080},
                            }
                        }
                    ],
                }
            ],
        },
    }


def _authorization_policy(namespace: str, owner_email: str) -> dict:
    path = _nifi_path(namespace)
    host = _external_host()
    allowed = _owner_values(owner_email)
    return {
        "apiVersion": "security.istio.io/v1",
        "kind": "AuthorizationPolicy",
        "metadata": {
            "name": _safe_policy_name(namespace),
            "namespace": "istio-system",
            "labels": {
                "app.kubernetes.io/managed-by": "prediction-manager",
                "prediction-manager.io/owner-namespace": namespace,
            },
            "annotations": {"prediction-manager.io/owner-email": owner_email},
        },
        "spec": {
            "selector": {
                "matchLabels": {"app": "istio-ingressgateway", "istio": "ingressgateway"}
            },
            "action": "DENY",
            "rules": [
                {
                    "to": [
                        {
                            "operation": {
                                "paths": [path, f"{path}/*"],
                            }
                        }
                    ],
                    "when": [
                        {
                            "key": "request.headers[kubeflow-userid]",
                            "notValues": allowed,
                        },
                        {
                            "key": "request.headers[x-auth-request-email]",
                            "notValues": allowed,
                        },
                    ],
                },
                {
                    "to": [
                        {
                            "operation": {
                                "paths": [
                                    "/nifi/nifi-api",
                                    "/nifi/nifi-api/*",
                                    "/nifi/nifi-docs",
                                    "/nifi/nifi-docs/*",
                                ],
                            }
                        }
                    ],
                    "when": [
                        {
                            "key": "request.headers[referer]",
                            "values": [f"https://{host}{path}", f"https://{host}{path}/*"],
                        },
                        {
                            "key": "request.headers[kubeflow-userid]",
                            "notValues": allowed,
                        },
                        {
                            "key": "request.headers[x-auth-request-email]",
                            "notValues": allowed,
                        },
                    ],
                },
            ],
        },
    }


def _apply_custom_object(group: str, version: str, namespace: str, plural: str, body: dict):
    name = body["metadata"]["name"]
    try:
        custom_api.create_namespaced_custom_object(group, version, namespace, plural, body)
    except ApiException as e:
        if e.status == 409:
            custom_api.patch_namespaced_custom_object(
                group, version, namespace, plural, name, body
            )
        else:
            raise


def _ensure_service(namespace: str, owner_email: str):
    body = _service(namespace, owner_email)
    try:
        core_v1.create_namespaced_service(namespace, body)
    except ApiException as e:
        if e.status == 409:
            core_v1.patch_namespaced_service("nifi", namespace, body)
        else:
            raise


def _ensure_statefulset(namespace: str, owner_email: str):
    body = _statefulset(namespace, owner_email)
    try:
        apps_v1.create_namespaced_stateful_set(namespace, body)
    except ApiException as e:
        if e.status == 409:
            apps_v1.patch_namespaced_stateful_set("nifi", namespace, body)
        else:
            raise


def _is_ready(namespace: str) -> bool:
    try:
        sts = apps_v1.read_namespaced_stateful_set("nifi", namespace)
    except ApiException:
        return False
    return bool(sts.status.ready_replicas and sts.status.ready_replicas >= 1)


def ensure_user_nifi(namespace: str, owner_email: str) -> NifiInstance:
    core_v1.read_namespace(namespace)
    _ensure_service(namespace, owner_email)
    _ensure_statefulset(namespace, owner_email)
    _apply_custom_object(
        "networking.istio.io",
        "v1",
        namespace,
        "virtualservices",
        _virtual_service(namespace, owner_email),
    )
    _apply_custom_object(
        "security.istio.io",
        "v1",
        "istio-system",
        "authorizationpolicies",
        _authorization_policy(namespace, owner_email),
    )
    return NifiInstance(
        namespace=namespace,
        owner_email=owner_email,
        path=f"{_nifi_path(namespace)}/",
        ready=_is_ready(namespace),
    )
