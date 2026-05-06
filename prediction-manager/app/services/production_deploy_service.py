"""Production 모델을 KServe InferenceService로 배포/교체.

모델 이름별로 전용 ISVC 유지 (`prod-{model_name}`).
새 버전 승격 시 동일 PVC에 모델 파일을 덮어쓰고 ISVC rollout.
"""
import asyncio
import datetime
import re
import os
from typing import Any

from kubernetes import client, config as kconfig
from kubernetes.stream import stream

from app.services import registry_model_service as registry
from app.services import tenant_resources


def _k8s_clients() -> tuple[Any, Any]:
    try:
        kconfig.load_incluster_config()
    except Exception:
        kconfig.load_kube_config()
    return client.CoreV1Api(), client.CustomObjectsApi()


def _safe_name(name: str) -> str:
    """모델 이름을 K8s 리소스 이름으로 안전하게."""
    s = re.sub(r"[^a-z0-9-]", "-", name.lower())
    s = re.sub(r"-+", "-", s).strip("-")
    return f"prod-{s}"[:50]


def _mlflow_uri(namespace: str | None = None) -> str:
    return tenant_resources.mlflow_tracking_uri(namespace)


def _parse_artifact_rel(run_id: str, core_v1, mlflow_namespace: str | None = None) -> str:
    """mlflow artifact_uri에서 쿠버네티스 접근 가능한 상대 경로 추출."""
    # run api 직접 호출
    import httpx
    MLFLOW_URI = _mlflow_uri(mlflow_namespace)
    r = httpx.get(f"{MLFLOW_URI}/api/2.0/mlflow/runs/get", params={"run_id": run_id}, timeout=10)
    r.raise_for_status()
    uri = r.json().get("run", {}).get("info", {}).get("artifact_uri", "")
    # 보통 mlflow-artifacts:/<exp>/<run>/artifacts
    if uri.startswith("mlflow-artifacts:/"):
        return uri.replace("mlflow-artifacts:/", "")
    return uri


def _ensure_pvc(core_v1, name: str, namespace: str) -> None:
    try:
        core_v1.read_namespaced_persistent_volume_claim(name, namespace)
        return
    except client.ApiException as e:
        if e.status != 404:
            raise
    body = client.V1PersistentVolumeClaim(
        metadata=client.V1ObjectMeta(name=name, namespace=namespace),
        spec=client.V1PersistentVolumeClaimSpec(
            access_modes=["ReadWriteOnce"],
            resources=client.V1ResourceRequirements(requests={"storage": "1Gi"}),
        ),
    )
    core_v1.create_namespaced_persistent_volume_claim(namespace, body)


def _detect_model_format(run_id: str, mlflow_namespace: str | None = None) -> str:
    """MLflow run의 artifact 파일 목록을 보고 ONNX vs MLflow(pickle) 결정."""
    import httpx
    import os as _os
    MLFLOW = _mlflow_uri(mlflow_namespace)
    try:
        r = httpx.get(
            f"{MLFLOW}/api/2.0/mlflow/artifacts/list",
            params={"run_id": run_id, "path": "model"},
            timeout=10,
        )
        r.raise_for_status()
        files = r.json().get("files", [])
        names = [f.get("path", "").split("/")[-1] for f in files]
        if any(n == "model.onnx" for n in names):
            return "onnx"
    except Exception as e:
        print(f"[deploy] format detect failed: {e}", flush=True)
    return "mlflow"


async def _run_helper_pod(core_v1, pod_name: str, namespace: str, pvc_name: str, run_id: str, model_format: str, mlflow_uri: str) -> None:
    """MLflow artifact를 PVC로 복사하는 helper Pod 실행 후 완료 대기.

    MLflow 3.x LoggedModels 호환: Python client 의 download_artifacts 가
    legacy({run}/artifacts/model/) 와 신경로({exp}/models/m-*/artifacts/) 양쪽 자동 해석.
    """
    onnx_extra = ""
    if model_format == "onnx":
        # ONNX flavor 가 없는 경우 대비해 MLmodel 강제 작성
        onnx_extra = """
import os
mlmodel = '/target/model/MLmodel'
if not os.path.exists(mlmodel) or 'onnx' not in open(mlmodel).read():
    with open(mlmodel, 'w') as f:
        f.write('''flavors:
  onnx:
    data: model.onnx
    onnx_version: "1.16"
    providers:
      - CPUExecutionProvider
  python_function:
    loader_module: mlflow.onnx
    data: model.onnx
''')
"""

    script = f"""
set -e
mkdir -p /target/model
chmod 777 /target /target/model
# 기존 파일 제거
find /target/model -type f -delete 2>/dev/null || true

python3 <<'PYEOF'
import os, shutil, mlflow
mlflow.set_tracking_uri('{mlflow_uri}')
local = mlflow.artifacts.download_artifacts(artifact_uri='runs:/{run_id}/model')
print('downloaded to', local)
for f in os.listdir(local):
    src = os.path.join(local, f)
    dst = os.path.join('/target/model', f)
    if os.path.isfile(src):
        shutil.copy2(src, dst)
# legacy: model.pkl 보장
if not os.path.exists('/target/model/model.pkl') and os.path.exists('/target/model/model.joblib'):
    shutil.copy2('/target/model/model.joblib', '/target/model/model.pkl')
{onnx_extra}
print('files in /target/model:')
for f in sorted(os.listdir('/target/model')):
    print(' -', f)
PYEOF
ls -la /target/model/
"""
    pod_body = client.V1Pod(
        metadata=client.V1ObjectMeta(
            name=pod_name,
            namespace=namespace,
            annotations={"sidecar.istio.io/inject": "false"},
        ),
        spec=client.V1PodSpec(
            restart_policy="Never",
            security_context=client.V1PodSecurityContext(run_as_user=0, fs_group=0),
            containers=[client.V1Container(
                name="copier",
                image="ghcr.io/mlflow/mlflow:v3.0.0",
                command=["sh", "-c", script],
                security_context=client.V1SecurityContext(run_as_user=0),
                resources=client.V1ResourceRequirements(
                    requests={"cpu": "100m", "memory": "512Mi"},
                    limits={"cpu": "1", "memory": "2Gi"},
                ),
                volume_mounts=[client.V1VolumeMount(name="model-pvc", mount_path="/target")],
            )],
            volumes=[client.V1Volume(
                name="model-pvc",
                persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(claim_name=pvc_name),
            )],
        ),
    )
    try:
        core_v1.delete_namespaced_pod(pod_name, namespace)
    except client.ApiException:
        pass
    # 이전 Pod 완전 삭제 대기
    for _ in range(20):
        try:
            core_v1.read_namespaced_pod(pod_name, namespace)
            await asyncio.sleep(1)
        except client.ApiException as e:
            if e.status == 404:
                break
    core_v1.create_namespaced_pod(namespace, pod_body)
    # 완료 대기 (최대 90초). 최종 phase 반환.
    import time as _t
    deadline = _t.time() + 90
    while _t.time() < deadline:
        try:
            p = core_v1.read_namespaced_pod(pod_name, namespace)
            if p.status.phase in ("Succeeded", "Failed"):
                return p.status.phase
        except Exception:
            pass
        await asyncio.sleep(2)
    raise RuntimeError("model copy helper pod timeout")


def _apply_isvc(
    custom: Any,
    name: str,
    namespace: str,
    pvc_name: str,
    model_name: str,
    version: str,
    model_format: str = "mlflow",
    scale_to_zero: bool = False,
) -> None:
    annotations = {
        "sidecar.istio.io/inject": "false",
        "serving.kserve.io/deploymentMode": "Serverless",
        "prod.model_name": model_name,
        "prod.model_version": version,
        "prod.model_format": model_format,
        "prod.deployed_at": datetime.datetime.utcnow().isoformat() + "Z",
        "prod.scale_to_zero": "true" if scale_to_zero else "false",
    }
    if scale_to_zero:
        # Knative autoscaler 가 idle pod 회수
        annotations["autoscaling.knative.dev/min-scale"] = "0"
        annotations["autoscaling.knative.dev/scale-to-zero-pod-retention-period"] = "30s"

    predictor = {
        "serviceAccountName": "default-editor",
        "model": {
            "modelFormat": {"name": model_format},
            "protocolVersion": "v2",
            "storageUri": f"pvc://{pvc_name}/model",
        },
    }
    if scale_to_zero:
        predictor["minReplicas"] = 0
        predictor["maxReplicas"] = 1

    isvc = {
        "apiVersion": "serving.kserve.io/v1beta1",
        "kind": "InferenceService",
        "metadata": {
            "name": name,
            "namespace": namespace,
            "annotations": annotations,
        },
        "spec": {"predictor": predictor},
    }
    try:
        custom.create_namespaced_custom_object(
            "serving.kserve.io", "v1beta1", namespace, "inferenceservices", isvc
        )
        return
    except client.ApiException as e:
        if e.status != 409:
            raise
    # replace - annotation 갱신으로 rollout 유도
    existing = custom.get_namespaced_custom_object(
        "serving.kserve.io", "v1beta1", namespace, "inferenceservices", name
    )
    isvc["metadata"]["resourceVersion"] = existing["metadata"]["resourceVersion"]
    custom.replace_namespaced_custom_object(
        "serving.kserve.io", "v1beta1", namespace, "inferenceservices", name, isvc
    )


async def deploy_production(
    model_name: str,
    version: str,
    target_namespace: str,
    scale_to_zero: bool = False,
    mlflow_namespace: str | None = None,
) -> dict:
    """
    1) MLflow Stage → Production (기존 Production은 Archived)
    2) PVC 확인/생성
    3) Helper Pod으로 모델 파일 교체
    4) InferenceService 생성/교체
    """
    version_info = registry.get_version_info(model_name, version, namespace=mlflow_namespace)
    run_id = version_info.get("run_id")
    if not run_id:
        raise ValueError(f"version {version}에 run_id가 없습니다")

    # 1) Stage 변경
    registry.set_stage(
        model_name, version, "Production", archive_existing=True, namespace=mlflow_namespace
    )

    core_v1, custom = _k8s_clients()
    isvc_name = _safe_name(model_name)
    pvc_name = f"{isvc_name}-pvc"[:60]
    helper_name = f"{isvc_name}-copy"[:63]

    # 2) 모델 포맷 감지 (ONNX vs MLflow pickle)
    model_format = _detect_model_format(run_id, mlflow_namespace=mlflow_namespace)

    # 3) PVC
    _ensure_pvc(core_v1, pvc_name, target_namespace)

    # 4) 모델 파일 복사 (기존 파일 덮어쓰기)
    helper_phase = await _run_helper_pod(
        core_v1,
        helper_name,
        target_namespace,
        pvc_name,
        run_id,
        model_format,
        _mlflow_uri(mlflow_namespace),
    )

    # 5) InferenceService (ONNX도 mlflow flavor로 감싸서 MLServer가 처리)
    _apply_isvc(
        custom, isvc_name, target_namespace, pvc_name, model_name, version,
        "mlflow", scale_to_zero=scale_to_zero,
    )

    # 6) Helper Pod 정리: Succeeded 만 삭제, Failed 는 디버깅용으로 보존
    if helper_phase == "Succeeded":
        try:
            core_v1.delete_namespaced_pod(helper_name, target_namespace, grace_period_seconds=0)
        except client.ApiException:
            pass

    return {
        "isvc_name": isvc_name,
        "isvc_url": f"http://{isvc_name}.{target_namespace}.svc.cluster.local",
        "namespace": target_namespace,
        "pvc_name": pvc_name,
        "model_name": model_name,
        "version": version,
        "model_format": model_format,
        "scale_to_zero": scale_to_zero,
    }


def undeploy_production(model_name: str, namespace: str) -> dict:
    """해당 모델의 Production ISVC 제거. 모델 파일 PVC도 함께 삭제."""
    core_v1, custom = _k8s_clients()
    isvc_name = _safe_name(model_name)
    pvc_name = f"{isvc_name}-pvc"[:60]  # deploy_production 의 pvc 이름 규칙과 일치
    deleted_isvc = False
    deleted_pvc = False
    try:
        custom.delete_namespaced_custom_object(
            "serving.kserve.io", "v1beta1", namespace, "inferenceservices", isvc_name
        )
        deleted_isvc = True
    except client.ApiException as e:
        if e.status != 404:
            raise
    try:
        core_v1.delete_namespaced_persistent_volume_claim(pvc_name, namespace)
        deleted_pvc = True
    except client.ApiException as e:
        if e.status != 404:
            raise
    return {
        "isvc_deleted": deleted_isvc,
        "pvc_deleted": deleted_pvc,
        "isvc_name": isvc_name,
        "pvc_name": pvc_name,
    }


def get_production_status(model_name: str, namespace: str) -> dict | None:
    """해당 모델의 Production ISVC 상태 조회."""
    core_v1, custom = _k8s_clients()
    isvc_name = _safe_name(model_name)
    try:
        obj = custom.get_namespaced_custom_object(
            "serving.kserve.io", "v1beta1", namespace, "inferenceservices", isvc_name
        )
    except client.ApiException as e:
        if e.status == 404:
            return None
        raise
    status = obj.get("status", {}) or {}
    conds = {c.get("type"): c for c in (status.get("conditions") or [])}
    ready = conds.get("Ready", {}).get("status") == "True"
    annos = (obj.get("metadata", {}).get("annotations") or {})
    return {
        "isvc_name": isvc_name,
        "namespace": namespace,
        "url": status.get("url") or f"http://{isvc_name}.{namespace}.svc.cluster.local",
        "ready": ready,
        "deployed_version": annos.get("prod.model_version"),
        "deployed_at": annos.get("prod.deployed_at"),
        "scale_to_zero": annos.get("prod.scale_to_zero") == "true",
    }
