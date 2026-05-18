from __future__ import annotations

import os
import time
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

MLFLOW_IMAGE = os.environ.get("PM_TENANT_MLFLOW_IMAGE", "ghcr.io/mlflow/mlflow:v3.11.1")
RAY_IMAGE = os.environ.get("PM_TENANT_RAY_IMAGE", "localhost:5000/ray-mlflow:2.54.1")
NIFI_IMAGE = os.environ.get("PM_TENANT_NIFI_IMAGE", "apache/nifi:1.28.1")
TENANT_PROVISION_TIMEOUT = int(os.environ.get("PM_TENANT_PROVISION_TIMEOUT", "180"))
RAY_CPU_WORKER_ENABLED = os.environ.get("PM_TENANT_RAY_CPU_WORKER_ENABLED", "true").lower() in (
    "1",
    "true",
    "yes",
    "on",
)
RAY_CPU_WORKER_MAX_REPLICAS = int(os.environ.get("PM_TENANT_RAY_CPU_WORKER_MAX_REPLICAS", "1"))
RAY_GPU_WORKER_ENABLED = os.environ.get("PM_TENANT_RAY_GPU_WORKER_ENABLED", "true").lower() in (
    "1",
    "true",
    "yes",
    "on",
)
RAY_GPU_WORKER_MAX_REPLICAS = int(os.environ.get("PM_TENANT_RAY_GPU_WORKER_MAX_REPLICAS", "1"))


@dataclass
class TenantProvisionResult:
    namespace: str
    owner_email: str
    resources: list[str]


def _external_host() -> str:
    parsed = urlparse(settings.kubeflow_url)
    return parsed.netloc or settings.kubeflow_url.replace("https://", "").replace("http://", "")


def _labels(app: str | None = None) -> dict:
    labels = {"app.kubernetes.io/managed-by": "prediction-manager"}
    if app:
        labels["app"] = app
    return labels


def _owner_annotation(owner_email: str) -> dict:
    return {"prediction-manager.io/owner-email": owner_email}


def _policy_name(namespace: str) -> str:
    name = f"pm-private-dashboards-{namespace}"
    return name[:63].rstrip("-")


def _wait_for_namespace(namespace: str) -> None:
    deadline = time.time() + TENANT_PROVISION_TIMEOUT
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            ns = core_v1.read_namespace(namespace)
            if not ns.metadata.deletion_timestamp:
                return
            last_error = RuntimeError(f"namespace 삭제 진행 중: {namespace}")
        except ApiException as exc:
            last_error = exc
            if exc.status != 404:
                raise
        time.sleep(2)
    raise RuntimeError(f"namespace 생성 대기 시간 초과: {namespace} ({last_error})")


def _apply_service(namespace: str, body: client.V1Service) -> str:
    name = body.metadata.name
    try:
        core_v1.read_namespaced_service(name, namespace)
        core_v1.patch_namespaced_service(name, namespace, body)
        return f"service/{name}:patched"
    except ApiException as exc:
        if exc.status != 404:
            raise
    try:
        core_v1.create_namespaced_service(namespace, body)
        return f"service/{name}:created"
    except ApiException as exc:
        if exc.status != 409:
            raise
        core_v1.patch_namespaced_service(name, namespace, body)
        return f"service/{name}:patched"


def _apply_pvc(namespace: str, body: client.V1PersistentVolumeClaim) -> str:
    name = body.metadata.name
    try:
        core_v1.read_namespaced_persistent_volume_claim(name, namespace)
        return f"pvc/{name}:exists"
    except ApiException as exc:
        if exc.status != 404:
            raise
    try:
        core_v1.create_namespaced_persistent_volume_claim(namespace, body)
        return f"pvc/{name}:created"
    except ApiException as exc:
        if exc.status != 409:
            raise
        return f"pvc/{name}:exists"


def _apply_deployment(namespace: str, body: client.V1Deployment) -> str:
    name = body.metadata.name
    try:
        apps_v1.read_namespaced_deployment(name, namespace)
        apps_v1.patch_namespaced_deployment(name, namespace, body)
        return f"deployment/{name}:patched"
    except ApiException as exc:
        if exc.status != 404:
            raise
    try:
        apps_v1.create_namespaced_deployment(namespace, body)
        return f"deployment/{name}:created"
    except ApiException as exc:
        if exc.status != 409:
            raise
        apps_v1.patch_namespaced_deployment(name, namespace, body)
        return f"deployment/{name}:patched"


def _apply_statefulset(namespace: str, body: client.V1StatefulSet) -> str:
    name = body.metadata.name
    try:
        apps_v1.read_namespaced_stateful_set(name, namespace)
        apps_v1.patch_namespaced_stateful_set(name, namespace, body)
        return f"statefulset/{name}:patched"
    except ApiException as exc:
        if exc.status != 404:
            raise
    try:
        apps_v1.create_namespaced_stateful_set(namespace, body)
        return f"statefulset/{name}:created"
    except ApiException as exc:
        if exc.status != 409:
            raise
        apps_v1.patch_namespaced_stateful_set(name, namespace, body)
        return f"statefulset/{name}:patched"


def _apply_custom_object(group: str, version: str, namespace: str, plural: str, body: dict) -> str:
    name = body["metadata"]["name"]
    try:
        custom_api.create_namespaced_custom_object(group, version, namespace, plural, body)
        return f"{plural}/{name}:created"
    except ApiException as exc:
        if exc.status != 409:
            raise
        custom_api.patch_namespaced_custom_object(group, version, namespace, plural, name, body)
        return f"{plural}/{name}:patched"


def _delete_custom_object(group: str, version: str, namespace: str, plural: str, name: str) -> str:
    try:
        custom_api.delete_namespaced_custom_object(group, version, namespace, plural, name)
        return f"{plural}/{name}:deleted"
    except ApiException as exc:
        if exc.status == 404:
            return f"{plural}/{name}:missing"
        raise


def _delete_namespaced(kind: str, namespace: str, name: str) -> str:
    try:
        if kind == "deployment":
            apps_v1.delete_namespaced_deployment(name, namespace)
        elif kind == "statefulset":
            apps_v1.delete_namespaced_stateful_set(name, namespace)
        elif kind == "service":
            core_v1.delete_namespaced_service(name, namespace)
        elif kind == "pvc":
            core_v1.delete_namespaced_persistent_volume_claim(name, namespace)
        else:
            raise ValueError(f"unsupported kind: {kind}")
        return f"{kind}/{name}:deleted"
    except ApiException as exc:
        if exc.status == 404:
            return f"{kind}/{name}:missing"
        raise


def _mlflow_pvc(namespace: str, owner_email: str) -> client.V1PersistentVolumeClaim:
    return client.V1PersistentVolumeClaim(
        metadata=client.V1ObjectMeta(
            name="pm-mlflow-data",
            namespace=namespace,
            labels=_labels("pm-mlflow"),
            annotations=_owner_annotation(owner_email),
        ),
        spec=client.V1PersistentVolumeClaimSpec(
            access_modes=["ReadWriteOnce"],
            storage_class_name="local-path",
            resources=client.V1ResourceRequirements(requests={"storage": "20Gi"}),
        ),
    )


def _mlflow_deployment(namespace: str, owner_email: str) -> client.V1Deployment:
    labels = _labels("pm-mlflow")
    return client.V1Deployment(
        metadata=client.V1ObjectMeta(
            name="pm-mlflow",
            namespace=namespace,
            labels=labels,
            annotations=_owner_annotation(owner_email),
        ),
        spec=client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(match_labels={"app": "pm-mlflow"}),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(
                    labels={"app": "pm-mlflow"},
                    annotations={"sidecar.istio.io/inject": "false"},
                ),
                spec=client.V1PodSpec(
                    containers=[
                        client.V1Container(
                            name="mlflow",
                            image=MLFLOW_IMAGE,
                            command=["sh", "-c"],
                            args=[
                                "mlflow server "
                                "--host 0.0.0.0 "
                                "--backend-store-uri sqlite:////mlflow/mlflow.db "
                                "--artifacts-destination file:///mlflow/mlartifacts "
                                "--serve-artifacts "
                                "--allowed-hosts '*' "
                                "--cors-allowed-origins '*'"
                            ],
                            ports=[client.V1ContainerPort(container_port=5000, name="http")],
                            resources=client.V1ResourceRequirements(
                                requests={"cpu": "500m", "memory": "1Gi"},
                                limits={"cpu": "2", "memory": "4Gi"},
                            ),
                            volume_mounts=[
                                client.V1VolumeMount(name="data", mount_path="/mlflow")
                            ],
                        )
                    ],
                    volumes=[
                        client.V1Volume(
                            name="data",
                            persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(
                                claim_name="pm-mlflow-data"
                            ),
                        )
                    ],
                ),
            ),
        ),
    )


def _service(namespace: str, name: str, app: str, port: int, target_port: int) -> client.V1Service:
    return client.V1Service(
        metadata=client.V1ObjectMeta(name=name, namespace=namespace, labels=_labels(app)),
        spec=client.V1ServiceSpec(
            selector={"app": app},
            ports=[client.V1ServicePort(name="http", port=port, target_port=target_port)],
        ),
    )


def _simple_virtual_service(
    namespace: str,
    name: str,
    path: str,
    destination_host: str,
    destination_port: int,
) -> dict:
    return {
        "apiVersion": "networking.istio.io/v1",
        "kind": "VirtualService",
        "metadata": {"name": name, "namespace": namespace, "labels": _labels()},
        "spec": {
            "gateways": ["kubeflow/kubeflow-gateway"],
            "hosts": ["*"],
            "http": [
                {
                    "match": [
                        {"uri": {"exact": path}},
                        {"uri": {"prefix": f"{path}/"}},
                    ],
                    "rewrite": {"uri": "/"},
                    "route": [
                        {
                            "destination": {
                                "host": destination_host,
                                "port": {"number": destination_port},
                            }
                        }
                    ],
                }
            ],
        },
    }


def _ray_cluster(namespace: str, owner_email: str) -> dict:
    spec = {
        "rayVersion": "2.54.1",
        "enableInTreeAutoscaling": True,
        "autoscalerOptions": {"upscalingMode": "Default", "idleTimeoutSeconds": 60},
        "headGroupSpec": {
            "rayStartParams": {"dashboard-host": "0.0.0.0", "num-cpus": "0"},
            "template": {
                "metadata": {"annotations": {"sidecar.istio.io/inject": "false"}},
                "spec": {
                    "containers": [
                        {
                            "name": "ray-head",
                            "image": RAY_IMAGE,
                            "imagePullPolicy": "Always",
                            "ports": [
                                {"containerPort": 6379, "name": "gcs-server"},
                                {"containerPort": 8265, "name": "dashboard"},
                                {"containerPort": 10001, "name": "client"},
                            ],
                            "env": [
                                {
                                    "name": "RAY_PROMETHEUS_HOST",
                                    "value": "http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090",
                                },
                                {"name": "RAY_PROMETHEUS_NAME", "value": "Prometheus"},
                                {"name": "NVIDIA_VISIBLE_DEVICES", "value": ""},
                            ],
                            "resources": {
                                "requests": {"cpu": "250m", "memory": "1Gi"},
                                "limits": {"cpu": "1", "memory": "2Gi"},
                            },
                        }
                    ]
                },
            },
        },
    }
    worker_group_specs = []
    if RAY_CPU_WORKER_ENABLED and RAY_CPU_WORKER_MAX_REPLICAS > 0:
        worker_group_specs.append(
            {
                "groupName": "cpu",
                "replicas": 0,
                "minReplicas": 0,
                "maxReplicas": RAY_CPU_WORKER_MAX_REPLICAS,
                "rayStartParams": {},
                "template": {
                    "metadata": {"annotations": {"sidecar.istio.io/inject": "false"}},
                    "spec": {
                        "containers": [
                            {
                                "name": "ray-worker",
                                "image": RAY_IMAGE,
                                "imagePullPolicy": "Always",
                                "env": [
                                    {
                                        "name": "RAY_PROMETHEUS_HOST",
                                        "value": "http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090",
                                    },
                                    {"name": "RAY_PROMETHEUS_NAME", "value": "Prometheus"},
                                    {"name": "NVIDIA_VISIBLE_DEVICES", "value": ""},
                                ],
                                "resources": {
                                    "requests": {"cpu": "2", "memory": "6Gi"},
                                    "limits": {"cpu": "4", "memory": "8Gi"},
                                },
                            }
                        ]
                    },
                },
            }
        )
    if RAY_GPU_WORKER_ENABLED and RAY_GPU_WORKER_MAX_REPLICAS > 0:
        worker_group_specs.append(
            {
                "groupName": "gpu",
                "replicas": 0,
                "minReplicas": 0,
                "maxReplicas": RAY_GPU_WORKER_MAX_REPLICAS,
                "rayStartParams": {},
                "template": {
                    "metadata": {"annotations": {"sidecar.istio.io/inject": "false"}},
                    "spec": {
                        "containers": [
                            {
                                "name": "ray-worker",
                                "image": RAY_IMAGE,
                                "imagePullPolicy": "Always",
                                "env": [
                                    {
                                        "name": "RAY_PROMETHEUS_HOST",
                                        "value": "http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090",
                                    },
                                    {"name": "RAY_PROMETHEUS_NAME", "value": "Prometheus"},
                                ],
                                "resources": {
                                    "requests": {
                                        "cpu": "1",
                                        "memory": "2Gi",
                                        "nvidia.com/gpu": "1",
                                    },
                                    "limits": {
                                        "cpu": "2",
                                        "memory": "4Gi",
                                        "nvidia.com/gpu": "1",
                                    },
                                },
                            }
                        ]
                    },
                },
            }
        )
    if worker_group_specs:
        spec["workerGroupSpecs"] = worker_group_specs
    return {
        "apiVersion": "ray.io/v1",
        "kind": "RayCluster",
        "metadata": {
            "name": "pm-ray",
            "namespace": namespace,
            "labels": _labels(),
            "annotations": _owner_annotation(owner_email),
        },
        "spec": spec,
    }


def _nifi_statefulset(namespace: str, owner_email: str) -> client.V1StatefulSet:
    host = _external_host()
    path = f"/nifi/{namespace}"
    labels = _labels("pm-user-nifi")
    labels.update(
        {
            "app.kubernetes.io/name": "nifi",
            "prediction-manager.io/owner-namespace": namespace,
        }
    )
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
        metadata=client.V1ObjectMeta(
            name="nifi",
            namespace=namespace,
            labels=labels,
            annotations=_owner_annotation(owner_email),
        ),
        spec=client.V1StatefulSetSpec(
            service_name="nifi",
            replicas=1,
            selector=client.V1LabelSelector(match_labels={"app": "pm-user-nifi"}),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(
                    labels=labels,
                    annotations={"sidecar.istio.io/inject": "false", **_owner_annotation(owner_email)},
                ),
                spec=client.V1PodSpec(
                    init_containers=[
                        client.V1Container(
                            name="init-conf",
                            image=NIFI_IMAGE,
                            command=["sh", "-c"],
                            args=[patch_conf],
                            resources=client.V1ResourceRequirements(
                                requests={"cpu": "50m", "memory": "256Mi"},
                                limits={"cpu": "250m", "memory": "512Mi"},
                            ),
                            volume_mounts=[client.V1VolumeMount(name="data", mount_path="/pvc")],
                        )
                    ],
                    containers=[
                        client.V1Container(
                            name="nifi",
                            image=NIFI_IMAGE,
                            ports=[client.V1ContainerPort(container_port=8080, name="http")],
                            env=[
                                client.V1EnvVar(name="NIFI_WEB_HTTP_PORT", value="8080"),
                                client.V1EnvVar(name="NIFI_WEB_PROXY_HOST", value=host),
                                client.V1EnvVar(name="NIFI_WEB_PROXY_CONTEXT_PATH", value=path),
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
                        storage_class_name="local-path",
                        resources=client.V1ResourceRequirements(requests={"storage": "5Gi"}),
                    ),
                )
            ],
        ),
    )


def _nifi_virtual_service(namespace: str) -> dict:
    path = f"/nifi/{namespace}"
    host = _external_host()
    referer = f"https://{host}{path}(/.*)?"
    headers = {
        "request": {
            "set": {
                "X-ProxyContextPath": path,
                "X-ProxyHost": host,
                "X-ProxyScheme": "https",
            },
            "remove": ["authorization", "x-forwarded-access-token"],
        }
    }
    return {
        "apiVersion": "networking.istio.io/v1",
        "kind": "VirtualService",
        "metadata": {"name": "pm-nifi-dashboard", "namespace": namespace, "labels": _labels()},
        "spec": {
            "gateways": ["kubeflow/kubeflow-gateway"],
            "hosts": ["*"],
            "http": [
                {
                    "match": [
                        {"uri": {"exact": f"{path}/nifi-api"}},
                        {"uri": {"prefix": f"{path}/nifi-api/"}},
                        {"uri": {"exact": "/nifi/nifi-api"}, "headers": {"referer": {"regex": referer}}},
                        {"uri": {"prefix": "/nifi/nifi-api/"}, "headers": {"referer": {"regex": referer}}},
                    ],
                    "rewrite": {"uri": "/nifi-api/"},
                    "headers": headers,
                    "route": [{"destination": {"host": f"nifi.{namespace}.svc.cluster.local", "port": {"number": 8080}}}],
                },
                {
                    "match": [
                        {"uri": {"exact": f"{path}/nifi-docs"}},
                        {"uri": {"prefix": f"{path}/nifi-docs/"}},
                        {"uri": {"exact": "/nifi/nifi-docs"}, "headers": {"referer": {"regex": referer}}},
                        {"uri": {"prefix": "/nifi/nifi-docs/"}, "headers": {"referer": {"regex": referer}}},
                    ],
                    "rewrite": {"uri": "/nifi-docs/"},
                    "headers": headers,
                    "route": [{"destination": {"host": f"nifi.{namespace}.svc.cluster.local", "port": {"number": 8080}}}],
                },
                {
                    "match": [
                        {"uri": {"exact": path}},
                        {"uri": {"prefix": f"{path}/"}},
                    ],
                    "rewrite": {"uri": "/nifi/"},
                    "headers": headers,
                    "route": [{"destination": {"host": f"nifi.{namespace}.svc.cluster.local", "port": {"number": 8080}}}],
                },
            ],
        },
    }


def _authorization_policy(namespace: str, owner_email: str) -> dict:
    host = _external_host()
    nifi_path = f"/nifi/{namespace}"
    allowed = sorted({owner_email, *ADMIN_EMAILS})
    return {
        "apiVersion": "security.istio.io/v1",
        "kind": "AuthorizationPolicy",
        "metadata": {
            "name": _policy_name(namespace),
            "namespace": "istio-system",
            "labels": {
                "app.kubernetes.io/managed-by": "prediction-manager",
                "prediction-manager.io/owner-namespace": namespace,
            },
            "annotations": _owner_annotation(owner_email),
        },
        "spec": {
            "selector": {"matchLabels": {"app": "istio-ingressgateway", "istio": "ingressgateway"}},
            "action": "DENY",
            "rules": [
                {
                    "to": [
                        {
                            "operation": {
                                "paths": [
                                    f"/mlflow/{namespace}",
                                    f"/mlflow/{namespace}/*",
                                    f"/ray/{namespace}",
                                    f"/ray/{namespace}/*",
                                    nifi_path,
                                    f"{nifi_path}/*",
                                ]
                            }
                        }
                    ],
                    "when": [
                        {"key": "request.headers[kubeflow-userid]", "notValues": allowed},
                        {"key": "request.headers[x-auth-request-email]", "notValues": allowed},
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
                                ]
                            }
                        }
                    ],
                    "when": [
                        {
                            "key": "request.headers[referer]",
                            "values": [f"https://{host}{nifi_path}", f"https://{host}{nifi_path}/*"],
                        },
                        {"key": "request.headers[kubeflow-userid]", "notValues": allowed},
                        {"key": "request.headers[x-auth-request-email]", "notValues": allowed},
                    ],
                },
            ],
        },
    }


def ensure_tenant_resources(namespace: str, owner_email: str) -> TenantProvisionResult:
    _wait_for_namespace(namespace)
    resources = [
        _apply_pvc(namespace, _mlflow_pvc(namespace, owner_email)),
        _apply_deployment(namespace, _mlflow_deployment(namespace, owner_email)),
        _apply_service(namespace, _service(namespace, "pm-mlflow", "pm-mlflow", 5000, 5000)),
        _apply_custom_object(
            "networking.istio.io",
            "v1",
            namespace,
            "virtualservices",
            _simple_virtual_service(
                namespace,
                "pm-mlflow-dashboard",
                f"/mlflow/{namespace}",
                f"pm-mlflow.{namespace}.svc.cluster.local",
                5000,
            ),
        ),
        _apply_custom_object("ray.io", "v1", namespace, "rayclusters", _ray_cluster(namespace, owner_email)),
        _apply_custom_object(
            "networking.istio.io",
            "v1",
            namespace,
            "virtualservices",
            _simple_virtual_service(
                namespace,
                "pm-ray-dashboard",
                f"/ray/{namespace}",
                f"pm-ray-head-svc.{namespace}.svc.cluster.local",
                8265,
            ),
        ),
        _apply_service(namespace, _service(namespace, "nifi", "pm-user-nifi", 8080, 8080)),
        _apply_statefulset(namespace, _nifi_statefulset(namespace, owner_email)),
        _apply_custom_object(
            "networking.istio.io",
            "v1",
            namespace,
            "virtualservices",
            _nifi_virtual_service(namespace),
        ),
        _apply_custom_object(
            "security.istio.io",
            "v1",
            "istio-system",
            "authorizationpolicies",
            _authorization_policy(namespace, owner_email),
        ),
    ]
    return TenantProvisionResult(namespace=namespace, owner_email=owner_email, resources=resources)


def delete_tenant_resources(namespace: str) -> list[str]:
    results: list[str] = []
    for group, version, ns, plural, name in [
        ("security.istio.io", "v1", "istio-system", "authorizationpolicies", _policy_name(namespace)),
        ("security.istio.io", "v1", "istio-system", "authorizationpolicies", f"pm-private-dashboards-{namespace}"),
        ("security.istio.io", "v1", "istio-system", "authorizationpolicies", f"nifi-owner-{namespace}"[:63].rstrip("-")),
        ("networking.istio.io", "v1", namespace, "virtualservices", "pm-nifi-dashboard"),
        ("networking.istio.io", "v1", namespace, "virtualservices", "pm-ray-dashboard"),
        ("networking.istio.io", "v1", namespace, "virtualservices", "pm-mlflow-dashboard"),
        ("ray.io", "v1", namespace, "rayclusters", "pm-ray"),
    ]:
        result = _delete_custom_object(group, version, ns, plural, name)
        if result not in results:
            results.append(result)

    for kind, name in [
        ("statefulset", "nifi"),
        ("deployment", "pm-mlflow"),
        ("service", "nifi"),
        ("service", "pm-mlflow"),
        ("service", "pm-ray-head-svc"),
        ("pvc", "data-nifi-0"),
        ("pvc", "pm-mlflow-data"),
    ]:
        results.append(_delete_namespaced(kind, namespace, name))
    return results
