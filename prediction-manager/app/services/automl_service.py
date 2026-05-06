"""AutoML job service — submits Ray Jobs to the cluster and tracks them in-memory."""
import asyncio
import json
import logging
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
from ray.job_submission import JobSubmissionClient

from app.models.automl_models import AutoMLJobRequest
from app.services import tenant_resources

logger = logging.getLogger(__name__)


DB_PATH = os.environ.get("AUTOML_DB_PATH", "/data/automl.db")
_db_lock = threading.Lock()


def _db_init() -> None:
    parent = Path(DB_PATH).parent
    try:
        parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    with _db_lock:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                submitted_at TEXT NOT NULL
            )
        """)
        conn.commit()
        conn.close()


def _db_load_all() -> dict:
    try:
        with _db_lock:
            conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            rows = conn.execute("SELECT data FROM jobs").fetchall()
            conn.close()
        out = {}
        for (blob,) in rows:
            info = json.loads(blob)
            out[info["job_id"]] = info
        return out
    except Exception as e:
        print(f"[automl] DB load failed: {e}", flush=True)
        return {}


def _db_save(info: dict) -> None:
    try:
        with _db_lock:
            conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            conn.execute(
                "INSERT OR REPLACE INTO jobs (job_id, data, submitted_at) VALUES (?, ?, ?)",
                (info["job_id"], json.dumps(info), info.get("submitted_at", _now_static())),
            )
            conn.commit()
            conn.close()
    except Exception as e:
        print(f"[automl] DB save failed: {e}", flush=True)


def _now_static() -> str:
    return datetime.now(timezone.utc).isoformat()


RAY_DASHBOARD_URL = os.environ.get(
    "RAY_DASHBOARD_URL", "http://ray-optuna-mlflow-cluster-head-svc.ray-system:8265"
)
MLFLOW_URI = os.environ.get("MLFLOW_URI", "http://mlflow-service.ray-system:5000")
MAX_CONCURRENT_PER_NS = int(os.environ.get("AUTOML_MAX_CONCURRENT_PER_NS", "2"))
SCHEDULER_INTERVAL = float(os.environ.get("AUTOML_SCHEDULER_INTERVAL", "5"))

RUNNER_DIR = Path(__file__).resolve().parent.parent / "automl_runner"

_db_init()
_jobs: dict[str, dict] = _db_load_all()
_ray_clients: dict[str, JobSubmissionClient] = {}
_scheduler_task: asyncio.Task | None = None
_next_priority: int = max([j.get("priority", 0) for j in _jobs.values()], default=0)


def _persist(info: dict) -> None:
    """In-memory 저장 + SQLite 저장"""
    _jobs[info["job_id"]] = info
    _db_save(info)


def _mlflow_uri_for_job(info: dict) -> str:
    return info.get("mlflow_uri") or tenant_resources.mlflow_tracking_uri(info.get("namespace")) or MLFLOW_URI


def _ray_url_for_job(info: dict) -> str:
    return info.get("ray_dashboard_url") or tenant_resources.ray_dashboard_url(info.get("namespace")) or RAY_DASHBOARD_URL


def _client(ray_dashboard_url: str) -> JobSubmissionClient:
    if ray_dashboard_url not in _ray_clients:
        _ray_clients[ray_dashboard_url] = JobSubmissionClient(ray_dashboard_url)
    return _ray_clients[ray_dashboard_url]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _submit_ray_job_sync(ray_dashboard_url: str, runtime_env: dict, entrypoint: str) -> str:
    return _client(ray_dashboard_url).submit_job(entrypoint=entrypoint, runtime_env=runtime_env)


def _get_ray_job_status_sync(ray_dashboard_url: str, submission_id: str) -> dict:
    info = _client(ray_dashboard_url).get_job_info(submission_id)
    return {"status": str(info.status), "message": info.message}


def _get_ray_job_logs_sync(ray_dashboard_url: str, submission_id: str) -> str:
    return _client(ray_dashboard_url).get_job_logs(submission_id)


async def _submit_ray_job(ray_dashboard_url: str, runtime_env: dict, entrypoint: str) -> str:
    return await asyncio.to_thread(_submit_ray_job_sync, ray_dashboard_url, runtime_env, entrypoint)


async def _get_ray_job_status(ray_dashboard_url: str, submission_id: str) -> dict:
    return await asyncio.to_thread(_get_ray_job_status_sync, ray_dashboard_url, submission_id)


async def _get_ray_job_logs(ray_dashboard_url: str, submission_id: str) -> str:
    return await asyncio.to_thread(_get_ray_job_logs_sync, ray_dashboard_url, submission_id)


async def submit(req: AutoMLJobRequest, user_email: str, namespace: str) -> dict:
    global _next_priority
    job_id = uuid.uuid4().hex[:10]
    experiment_name = f"automl-{namespace}-{req.name}"
    mlflow_uri = tenant_resources.mlflow_tracking_uri(namespace)
    ray_dashboard_url = tenant_resources.ray_dashboard_url(namespace)

    _next_priority += 1
    info = {
        "job_id": job_id,
        "ray_job_id": None,
        "submitted_by": user_email,
        "namespace": namespace,
        "status": "QUEUED",
        "experiment_name": experiment_name,
        "task": req.task,
        "dataset_path": req.dataset_path,
        "target_column": req.target_column,
        "models": req.models,
        "num_trials": req.num_trials,
        "timeout_minutes": req.timeout_minutes,
        "metric": req.metric,
        "test_size": req.test_size,
        "random_state": req.random_state,
        "cpu_per_trial": req.cpu_per_trial,
        "gpu_per_trial": req.gpu_per_trial,
        "memory_per_trial_gb": req.memory_per_trial_gb,
        "top_n": req.top_n,
        "priority": _next_priority,
        "submitted_at": _now(),
        "mlflow_uri": mlflow_uri,
        "ray_dashboard_url": ray_dashboard_url,
        "started_at": None,
        "finished_at": None,
        "best_run": None,
        "message": None,
    }
    _persist(info)
    return info


async def _submit_to_ray(info: dict) -> None:
    mlflow_uri = _mlflow_uri_for_job(info)
    ray_dashboard_url = _ray_url_for_job(info)
    cfg = {
        "job_id": info["job_id"],
        "experiment_name": info["experiment_name"],
        "task": info["task"],
        "dataset_path": info["dataset_path"],
        "target_column": info["target_column"],
        "models": info["models"],
        "num_trials": info["num_trials"],
        "test_size": info.get("test_size", 0.2),
        "random_state": info.get("random_state", 42),
        "metric": info.get("metric", "auto"),
        "timeout_minutes": info.get("timeout_minutes", 60),
        "cpu_per_trial": info.get("cpu_per_trial", 1.0),
        "gpu_per_trial": info.get("gpu_per_trial", 0.0),
        "memory_per_trial_gb": info.get("memory_per_trial_gb", 2.0),
        "top_n": info.get("top_n", 3),
        "submitted_by": info.get("submitted_by", ""),
        "namespace": info.get("namespace", ""),
        "mlflow_uri": mlflow_uri,
    }
    needs_torch = any(m in ("mlp", "tabnet") for m in info.get("models", []))
    # 서빙 런타임(MLServer 1.7.1, sklearn 1.7.0)과 minor 일치 유지
    # 1.8 은 MLServer 업그레이드 전까지 금지
    pip_list = [
        "mlflow>=3.0", "optuna",
        "scikit-learn>=1.7,<1.8",
        "xgboost", "lightgbm", "pandas", "pyarrow",
    ]
    if needs_torch:
        pip_list += ["torch", "pytorch-tabnet"]
    runtime_env = {
        "working_dir": str(RUNNER_DIR),
        "pip": pip_list,
        "env_vars": {"MLFLOW_TRACKING_URI": mlflow_uri},
    }
    entrypoint = f"python job.py --config '{json.dumps(cfg)}'"
    try:
        submission_id = await _submit_ray_job(ray_dashboard_url, runtime_env, entrypoint)
        info["ray_job_id"] = submission_id
        info["status"] = "PENDING"
        info["started_at"] = _now()
    except Exception as e:
        info["status"] = "FAILED"
        info["finished_at"] = _now()
        info["message"] = f"Ray submit 실패: {e}"
    _persist(info)


def _ns_running_count(namespace: str) -> int:
    return sum(
        1 for j in _jobs.values()
        if j["namespace"] == namespace and j["status"] in ("PENDING", "RUNNING")
    )


def _queued_ordered() -> list[dict]:
    return sorted(
        [j for j in _jobs.values() if j["status"] == "QUEUED"],
        key=lambda j: (j["priority"], j["submitted_at"]),
    )


_MAX_SUBMIT_RETRY = int(os.environ.get("AUTOML_MAX_SUBMIT_RETRY", "5"))


async def _scheduler_loop() -> None:
    while True:
        try:
            # 1) PENDING/RUNNING 인 job 들의 Ray status 동기화 — 안 하면 _ns_running_count 가
            #    낡은 카운트로 새 job 못 picking up
            for j in list(_jobs.values()):
                if j.get("ray_job_id") and j["status"] in ("PENDING", "RUNNING"):
                    try:
                        await refresh_status(j["job_id"])
                    except Exception as e:
                        logger.debug(f"[automl scheduler] refresh {j['job_id']} failed: {e}")

            # 2) QUEUED job 들 Ray 에 제출
            for job in _queued_ordered():
                if _ns_running_count(job["namespace"]) >= MAX_CONCURRENT_PER_NS:
                    continue
                try:
                    await _submit_to_ray(job)
                except Exception as e:
                    # job 단위 실패는 루프 전체를 멈추지 않음
                    retry = int(job.get("submit_retry_count", 0)) + 1
                    job["submit_retry_count"] = retry
                    logger.error(
                        f"[automl scheduler] submit job_id={job['job_id']} "
                        f"ns={job.get('namespace')} retry={retry}/{_MAX_SUBMIT_RETRY}: "
                        f"{type(e).__name__}: {e}",
                        exc_info=True,
                    )
                    if retry >= _MAX_SUBMIT_RETRY:
                        job["status"] = "FAILED"
                        job["finished_at"] = _now()
                        job["message"] = (
                            f"Ray 제출 {retry}회 연속 실패. 마지막 에러: "
                            f"{type(e).__name__}: {e}"
                        )
                        logger.error(
                            f"[automl scheduler] job_id={job['job_id']} "
                            f"FAILED after {retry} retries"
                        )
                    _persist(job)
        except Exception as e:
            # 루프 자체 예외 (deserialization 등) — 다음 tick에 재시도
            logger.exception(
                f"[automl scheduler] loop iteration error: {type(e).__name__}: {e}"
            )
        await asyncio.sleep(SCHEDULER_INTERVAL)


def start_scheduler() -> None:
    global _scheduler_task
    if _scheduler_task is None or _scheduler_task.done():
        _scheduler_task = asyncio.create_task(_scheduler_loop())


def queue_position(job_id: str) -> int | None:
    job = _jobs.get(job_id)
    if not job or job["status"] != "QUEUED":
        return None
    ordered = _queued_ordered()
    for idx, j in enumerate(ordered):
        if j["namespace"] == job["namespace"] and j["job_id"] == job_id:
            # position 기준: 같은 namespace 내에서만 의미
            same_ns_queue = [x for x in ordered if x["namespace"] == job["namespace"]]
            for i, s in enumerate(same_ns_queue):
                if s["job_id"] == job_id:
                    return i + 1 + _ns_running_count(job["namespace"])
    return None


def cancel(job_id: str, requester_email: str, is_admin_user: bool) -> bool:
    job = _jobs.get(job_id)
    if not job:
        return False
    if not is_admin_user and job["submitted_by"] != requester_email:
        return False
    if job["status"] != "QUEUED":
        return False
    job["status"] = "CANCELED"
    job["finished_at"] = _now()
    job["message"] = f"{requester_email}에 의해 취소됨"
    _persist(job)
    return True


def list_available_notebooks(namespaces: list[str]) -> list[dict]:
    """주어진 namespaces에서 실행 중인 Kubeflow Notebook 목록."""
    from kubernetes import client, config as kconfig
    try:
        kconfig.load_incluster_config()
    except Exception:
        kconfig.load_kube_config()
    core_v1 = client.CoreV1Api()

    out = []
    for ns in namespaces:
        try:
            items = core_v1.list_namespaced_pod(ns).items
        except Exception:
            continue
        for p in items:
            labels = p.metadata.labels or {}
            nb_name = labels.get("notebook-name")
            if not nb_name:
                continue
            if p.status.phase != "Running":
                continue
            all_ready = all(c.ready for c in (p.status.container_statuses or []))
            if not all_ready:
                continue
            out.append({
                "namespace": ns,
                "notebook_name": nb_name,
                "pod_name": p.metadata.name,
            })
    return out


def create_notebook_file(job_id: str, run_id: str, rank: int, model_id: str, namespace: str, target_namespace: str | None = None, target_notebook: str | None = None) -> dict:
    """사용자 namespace에서 실행 중인 첫 번째 Notebook의 PVC에 .ipynb 파일을 생성.
    - 가장 최근 Notebook Pod 찾기
    - exec으로 /home/jovyan/automl_<jobid>_<model>.ipynb 생성
    """
    from kubernetes import client, config as kconfig
    from kubernetes.stream import stream
    try:
        kconfig.load_incluster_config()
    except Exception:
        kconfig.load_kube_config()
    core_v1 = client.CoreV1Api()

    # 실행 중인 노트북 파드 검색 (notebook-name 라벨 기반)
    def _find_notebook_pods(ns: str) -> list:
        try:
            items = core_v1.list_namespaced_pod(ns).items
        except Exception:
            return []
        result = []
        for p in items:
            labels = p.metadata.labels or {}
            if "notebook-name" not in labels:
                continue
            if p.status.phase != "Running":
                continue
            all_ready = all(c.ready for c in (p.status.container_statuses or []))
            if all_ready:
                result.append(p)
        return result

    job_info = _jobs.get(job_id)
    mlflow_uri = _mlflow_uri_for_job(job_info or {"namespace": namespace})

    # 사용자가 target을 명시했으면 그걸 사용
    if target_namespace and target_notebook:
        candidates = _find_notebook_pods(target_namespace)
        matched = [p for p in candidates if (p.metadata.labels or {}).get("notebook-name") == target_notebook]
        if not matched:
            raise RuntimeError(f"선택한 노트북 '{target_namespace}/{target_notebook}'이 실행 중이 아닙니다.")
        target_pod = matched[0]
        namespace = target_namespace
    else:
        # 자동 검색: 요청자 namespace → Job namespace
        running = _find_notebook_pods(namespace)
        searched_ns = [namespace]
        if not running and job_info and job_info.get("namespace") and job_info["namespace"] != namespace:
            searched_ns.append(job_info["namespace"])
            running = _find_notebook_pods(job_info["namespace"])
            if running:
                namespace = job_info["namespace"]
        if not running:
            raise RuntimeError(f"실행 중인 노트북이 없습니다. Kubeflow Notebook을 먼저 시작해주세요. (검색한 namespace: {', '.join(searched_ns)})")
        target_pod = running[0]
    pod_name = target_pod.metadata.name
    nb_name = target_pod.metadata.labels.get("notebook-name", pod_name)
    container = nb_name  # notebook container 이름은 notebook name과 동일

    notebook_json = {
        "cells": [
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    f"# AutoML 결과 탐색\n",
                    f"- **Job ID**: `{job_id}`\n",
                    f"- **Model**: `{model_id}` (rank {rank})\n",
                    f"- **MLflow Run ID**: `{run_id}`\n",
                ]
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "import mlflow, os, joblib, json\n",
                    f"mlflow.set_tracking_uri('{mlflow_uri}')\n",
                    f"local_dir = mlflow.artifacts.download_artifacts(run_id='{run_id}', artifact_path='model')\n",
                    "model = joblib.load(os.path.join(local_dir, 'model.joblib'))\n",
                    "with open(os.path.join(local_dir, 'features.json')) as f:\n",
                    "    feats = json.load(f)\n",
                    "print('Features:', feats['columns'])\n",
                    "print('Target:', feats['target'])\n",
                    "model\n",
                ]
            },
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": ["## 예측 예시\n\n`your_data.csv`를 실제 데이터로 교체하세요."]
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "# import pandas as pd\n",
                    "# df = pd.read_csv('your_data.csv')\n",
                    "# preds = model.predict(df[feats['columns']].fillna(0))\n",
                    "# preds[:10]\n",
                ]
            },
        ],
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python", "version": "3.10"}
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }

    filename = f"automl_{job_id}_{model_id}_rank{rank}.ipynb"
    filepath = f"/home/jovyan/{filename}"
    content_b64 = json.dumps(notebook_json).encode("utf-8")
    import base64
    encoded = base64.b64encode(content_b64).decode()

    cmd = ["sh", "-c", f"echo {encoded} | base64 -d > {filepath} && chown 1000:100 {filepath} 2>/dev/null || true && echo OK"]
    try:
        resp = stream(
            core_v1.connect_get_namespaced_pod_exec,
            pod_name, namespace,
            container=container,
            command=cmd,
            stderr=True, stdin=False, stdout=True, tty=False,
        )
    except Exception as e:
        raise RuntimeError(f"노트북에 파일 생성 실패: {e}")

    return {
        "notebook_pod": pod_name,
        "notebook_name": nb_name,
        "file_path": filepath,
        "open_url": f"/notebook/{namespace}/{nb_name}/lab/tree/{filename}",
    }


async def deploy_to_kserve(
    job_id: str, run_id: str, rank: int, model_id: str, namespace: str,
    serving_name: str | None = None,
) -> dict:
    """Top-N 모델을 KServe InferenceService로 배포.
    - MLflow artifact를 PVC에 복사하는 helper Pod 생성
    - InferenceService 생성 (sklearn runtime, v2 protocol)
    - serving_name 이 주어지면 ISVC 이름으로 사용, 없으면 automl-{jobid}-{model}-r{rank} 자동 생성
    """
    from kubernetes import client, config as kconfig
    import re as _re
    try:
        kconfig.load_incluster_config()
    except Exception:
        kconfig.load_kube_config()
    core_v1 = client.CoreV1Api()
    custom = client.CustomObjectsApi()
    job_info = _jobs.get(job_id) or {"namespace": namespace}
    mlflow_uri = _mlflow_uri_for_job(job_info)

    short_id = job_id[:8].lower()
    if serving_name:
        # K8s DNS-1123 label: lowercase alphanumeric + hyphens, must start with letter, max 50
        sanitized = _re.sub(r"[^a-z0-9-]", "-", serving_name.lower())
        sanitized = _re.sub(r"-+", "-", sanitized).strip("-")
        if not sanitized or not sanitized[0].isalpha():
            sanitized = f"s-{sanitized}" if sanitized else f"automl-{short_id}"
        isvc_name = sanitized[:50].rstrip("-")
    else:
        isvc_name = f"automl-{short_id}-{model_id}-r{rank}".lower().replace("_", "-")[:50]
    pvc_name = f"{isvc_name}-pvc"[:60]

    # 1) PVC 생성
    pvc_body = client.V1PersistentVolumeClaim(
        metadata=client.V1ObjectMeta(name=pvc_name, namespace=namespace),
        spec=client.V1PersistentVolumeClaimSpec(
            access_modes=["ReadWriteOnce"],
            resources=client.V1ResourceRequirements(requests={"storage": "1Gi"}),
        ),
    )
    try:
        core_v1.create_namespaced_persistent_volume_claim(namespace, pvc_body)
    except client.ApiException as e:
        if e.status != 409:
            raise

    # 2) Helper Pod로 MLflow artifact를 PVC에 복사
    helper_name = f"{isvc_name}-copy"[:63]
    # MLflow 3.x LoggedModels 호환 — MLflow image 사용 (mlflow Python client 사전 설치됨)
    script = f"""
set -e
mkdir -p /target/model
python3 <<'PYEOF'
import os, shutil, mlflow
mlflow.set_tracking_uri('{mlflow_uri}')
# runs:/{run_id}/model 표기는 legacy + LoggedModels 양쪽 자동 해석
local = mlflow.artifacts.download_artifacts(artifact_uri='runs:/{run_id}/model')
print('downloaded to', local)
# /target/model 로 옮기기 (있는 파일 덮어쓰기)
for f in os.listdir(local):
    src = os.path.join(local, f)
    dst = os.path.join('/target/model', f)
    if os.path.isfile(src):
        shutil.copy2(src, dst)
print('files in /target/model:')
for f in sorted(os.listdir('/target/model')):
    print(' -', f)

# legacy: model.pkl 없고 model.joblib 있으면 링크
if not os.path.exists('/target/model/model.pkl') and os.path.exists('/target/model/model.joblib'):
    shutil.copy2('/target/model/model.joblib', '/target/model/model.pkl')
PYEOF
ls -la /target/model
sleep 5
"""
    pod_body = client.V1Pod(
        metadata=client.V1ObjectMeta(
            name=helper_name,
            namespace=namespace,
            annotations={"sidecar.istio.io/inject": "false"},
        ),
        spec=client.V1PodSpec(
            restart_policy="Never",
            security_context=client.V1PodSecurityContext(run_as_user=0, fs_group=0),
            containers=[client.V1Container(
                name="copier",
                image="ghcr.io/mlflow/mlflow:v3.0.0",
                command=["sh", "-c"],
                args=[f"chmod 777 /target; " + script],
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
        core_v1.delete_namespaced_pod(helper_name, namespace)
    except client.ApiException:
        pass
    core_v1.create_namespaced_pod(namespace, pod_body)

    # 3) copy 완료 대기 (최대 60초). 최종 phase 추적.
    import time as _t
    helper_phase = None
    deadline = _t.time() + 60
    while _t.time() < deadline:
        try:
            p = core_v1.read_namespaced_pod(helper_name, namespace)
            if p.status.phase in ("Succeeded", "Failed"):
                helper_phase = p.status.phase
                break
        except Exception:
            pass
        await asyncio.sleep(2)

    # 4) InferenceService 생성 (실험용 — scale-to-zero 강제)
    isvc = {
        "apiVersion": "serving.kserve.io/v1beta1",
        "kind": "InferenceService",
        "metadata": {
            "name": isvc_name,
            "namespace": namespace,
            "annotations": {
                "sidecar.istio.io/inject": "false",
                "serving.kserve.io/deploymentMode": "Serverless",
                "automl.job_id": job_id,
                "automl.model_id": model_id,
                "automl.rank": str(rank),
                "autoscaling.knative.dev/min-scale": "0",
                "autoscaling.knative.dev/scale-to-zero-pod-retention-period": "30s",
            },
        },
        "spec": {
            "predictor": {
                "serviceAccountName": "default-editor",
                "minReplicas": 0,
                "maxReplicas": 1,
                "model": {
                    "modelFormat": {"name": "mlflow"},
                    "protocolVersion": "v2",
                    "storageUri": f"pvc://{pvc_name}/model",
                },
            }
        },
    }
    try:
        custom.create_namespaced_custom_object(
            group="serving.kserve.io",
            version="v1beta1",
            namespace=namespace,
            plural="inferenceservices",
            body=isvc,
        )
    except client.ApiException as e:
        if e.status == 409:
            # 이미 있으면 replace
            existing = custom.get_namespaced_custom_object(
                "serving.kserve.io", "v1beta1", namespace, "inferenceservices", isvc_name
            )
            isvc["metadata"]["resourceVersion"] = existing["metadata"]["resourceVersion"]
            custom.replace_namespaced_custom_object(
                "serving.kserve.io", "v1beta1", namespace, "inferenceservices", isvc_name, isvc
            )
        else:
            raise

    # 5) Helper Pod 정리: Succeeded 만 삭제, Failed/타임아웃은 디버깅용 보존
    if helper_phase == "Succeeded":
        try:
            core_v1.delete_namespaced_pod(helper_name, namespace, grace_period_seconds=0)
        except client.ApiException:
            pass

    return {
        "isvc_name": isvc_name,
        "isvc_url": f"http://{isvc_name}.{namespace}.svc.cluster.local",
        "namespace": namespace,
        "pvc_name": pvc_name,
    }


def delete(job_id: str, requester_email: str, is_admin_user: bool, delete_mlflow: bool = True) -> dict:
    """Job 완전 삭제. 종료된 Job만 삭제 가능.

    제거 범위:
      1. 이 Job의 "서빙" 으로 만든 KServe ISVC + PVC (automl.job_id annotation 매칭)
      2. 관련 helper pod (Succeeded/Failed)
      3. MLflow Experiment + 모든 Run (hard delete)
      4. Artifact 파일 (/mlflow/mlartifacts/ 디스크)
      5. SQLite jobs 레코드 + 메모리
    """
    job = _jobs.get(job_id)
    if not job:
        return {"deleted": False, "reason": "job_not_found"}
    if not is_admin_user and job["submitted_by"] != requester_email:
        return {"deleted": False, "reason": "forbidden"}
    if job["status"] in ("QUEUED", "PENDING", "RUNNING"):
        raise ValueError("실행 중인 Job은 먼저 중지/취소해야 합니다")

    namespace = job.get("namespace") or ""
    mlflow_uri = _mlflow_uri_for_job(job)
    result = {
        "deleted": True,
        "job_id": job_id,
        "isvc_deleted": [],
        "pvc_deleted": [],
        "helper_pods_deleted": [],
        "runs_deleted": 0,
        "artifacts_purged": 0,
        "experiment_deleted": False,
    }

    # ---- K8s 리소스 정리 (ISVC, PVC, helper pod) ----
    if namespace:
        try:
            from kubernetes import client, config as kconfig
            from kubernetes.stream import stream
            try:
                kconfig.load_incluster_config()
            except Exception:
                kconfig.load_kube_config()
            core_v1 = client.CoreV1Api()
            custom_api = client.CustomObjectsApi()

            # ISVC: annotation 이 이 job_id 인 것만 정리
            try:
                isvcs = custom_api.list_namespaced_custom_object(
                    "serving.kserve.io", "v1beta1", namespace, "inferenceservices"
                )
                for isvc in isvcs.get("items", []):
                    annos = isvc.get("metadata", {}).get("annotations", {}) or {}
                    if annos.get("automl.job_id") != job_id:
                        continue
                    isvc_name = isvc["metadata"]["name"]
                    try:
                        custom_api.delete_namespaced_custom_object(
                            "serving.kserve.io", "v1beta1", namespace, "inferenceservices", isvc_name
                        )
                        result["isvc_deleted"].append(f"{namespace}/{isvc_name}")
                    except Exception:
                        pass
                    pvc_candidate = f"{isvc_name}-pvc"[:60]
                    try:
                        core_v1.delete_namespaced_persistent_volume_claim(pvc_candidate, namespace)
                        result["pvc_deleted"].append(f"{namespace}/{pvc_candidate}")
                    except Exception:
                        pass
            except Exception as e:
                print(f"[automl-delete] isvc cleanup failed: {e}", flush=True)

            # Helper pod: 이 job 의 ISVC copy pod 들 (Succeeded/Failed 다)
            try:
                pods = core_v1.list_namespaced_pod(namespace)
                for p in pods.items:
                    n = p.metadata.name
                    # automl-<job_id_short>-<model>-r<rank>-copy
                    if n.startswith(f"automl-{job_id[:8].lower()}-") and n.endswith("-copy"):
                        try:
                            core_v1.delete_namespaced_pod(n, namespace, grace_period_seconds=0)
                            result["helper_pods_deleted"].append(f"{namespace}/{n}")
                        except Exception:
                            pass
            except Exception as e:
                print(f"[automl-delete] helper pod cleanup failed: {e}", flush=True)
        except Exception as e:
            print(f"[automl-delete] k8s cleanup init failed: {e}", flush=True)

    # ---- MLflow Experiment + Run hard delete ----
    exp_id = None
    run_ids_to_purge: list[str] = []
    artifact_paths: list[str] = []
    if delete_mlflow and job.get("experiment_name"):
        try:
            import httpx
            r = httpx.get(
                f"{mlflow_uri}/api/2.0/mlflow/experiments/get-by-name",
                params={"experiment_name": job["experiment_name"]},
                timeout=10,
            )
            if r.status_code == 200:
                exp_id = (r.json().get("experiment") or {}).get("experiment_id")
        except Exception as e:
            print(f"[automl-delete] experiment lookup failed: {e}", flush=True)

    if exp_id:
        # 이 experiment 의 모든 active run 조회
        try:
            import httpx
            sr = httpx.post(
                f"{mlflow_uri}/api/2.0/mlflow/runs/search",
                json={"experiment_ids": [exp_id], "max_results": 1000, "run_view_type": "ALL"},
                timeout=15,
            )
            if sr.status_code == 200:
                for run in sr.json().get("runs", []):
                    info = run.get("info") or {}
                    rid = info.get("run_id")
                    uri = info.get("artifact_uri") or ""
                    if rid:
                        run_ids_to_purge.append(rid)
                    if uri.startswith("mlflow-artifacts:/"):
                        artifact_paths.append(uri.replace("mlflow-artifacts:/", ""))
        except Exception as e:
            print(f"[automl-delete] run search failed: {e}", flush=True)

        # Experiment 삭제 (Experiment 삭제하면 run 도 cascade soft delete)
        try:
            import httpx
            httpx.post(
                f"{mlflow_uri}/api/2.0/mlflow/experiments/delete",
                json={"experiment_id": exp_id},
                timeout=10,
            )
            result["experiment_deleted"] = True
        except Exception as e:
            print(f"[automl-delete] experiment delete failed: {e}", flush=True)

    # ---- Artifact 파일 실제 제거 + mlflow gc ----
    if run_ids_to_purge or artifact_paths or exp_id:
        try:
            from kubernetes import client, config as kconfig
            from kubernetes.stream import stream
            try:
                kconfig.load_incluster_config()
            except Exception:
                kconfig.load_kube_config()
            core_v1 = client.CoreV1Api()
            mlflow_ref = tenant_resources.find_mlflow_pod(core_v1, namespace)
            if mlflow_ref:
                mlflow_ns, mlflow_pod = mlflow_ref
                # artifact 파일 제거 (경로 traversal 방지)
                for rel in artifact_paths:
                    if ".." in rel or rel.startswith("/"):
                        continue
                    try:
                        stream(
                            core_v1.connect_get_namespaced_pod_exec,
                            mlflow_pod, mlflow_ns,
                            command=["sh", "-c", f"rm -rf /mlflow/mlartifacts/{rel}"],
                            stderr=True, stdin=False, stdout=True, tty=False,
                        )
                        result["artifacts_purged"] += 1
                    except Exception:
                        pass
                # Experiment 디렉토리 통째로 제거 (experiment_id 기준)
                if exp_id:
                    try:
                        stream(
                            core_v1.connect_get_namespaced_pod_exec,
                            mlflow_pod, mlflow_ns,
                            command=["sh", "-c", f"rm -rf /mlflow/mlartifacts/{exp_id}"],
                            stderr=True, stdin=False, stdout=True, tty=False,
                        )
                    except Exception:
                        pass
                # mlflow gc — DB tombstone 영구 제거
                try:
                    run_args = " ".join(run_ids_to_purge) if run_ids_to_purge else ""
                    cmd = (
                        "mlflow gc "
                        "--backend-store-uri sqlite:////mlflow/mlflow.db "
                        "--artifacts-destination file:///mlflow/mlartifacts "
                        "--older-than 0d0h0m0s"
                    )
                    if run_args:
                        cmd += f" --run-ids {run_args}"
                    cmd += " || true"
                    stream(
                        core_v1.connect_get_namespaced_pod_exec,
                        mlflow_pod, mlflow_ns,
                        command=["sh", "-c", cmd],
                        stderr=True, stdin=False, stdout=True, tty=False,
                    )
                    result["runs_deleted"] = len(run_ids_to_purge)
                except Exception as e:
                    print(f"[automl-delete] mlflow gc failed: {e}", flush=True)
        except Exception as e:
            print(f"[automl-delete] artifact purge init failed: {e}", flush=True)

    # ---- SQLite + in-memory 제거 ----
    try:
        with _db_lock:
            conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            conn.execute("DELETE FROM jobs WHERE job_id=?", (job_id,))
            conn.commit()
            conn.close()
    except Exception as e:
        print(f"[automl-delete] DB delete failed: {e}", flush=True)

    _jobs.pop(job_id, None)
    return result


def promote(job_id: str, requester_email: str, is_admin_user: bool) -> bool:
    if not is_admin_user:
        return False
    job = _jobs.get(job_id)
    if not job or job["status"] != "QUEUED":
        return False
    current_min = min((j["priority"] for j in _jobs.values() if j["status"] == "QUEUED"), default=0)
    job["priority"] = current_min - 1
    job["message"] = f"관리자 {requester_email}가 우선순위 상향"
    _persist(job)
    return True


def list_jobs(namespace: str | None = None, is_admin: bool = False) -> list[dict]:
    if is_admin:
        return sorted(_jobs.values(), key=lambda j: j["submitted_at"], reverse=True)
    return sorted(
        [j for j in _jobs.values() if j["namespace"] == namespace],
        key=lambda j: j["submitted_at"],
        reverse=True,
    )


def get(job_id: str) -> dict | None:
    return _jobs.get(job_id)


async def refresh_status(job_id: str) -> dict | None:
    info = _jobs.get(job_id)
    if not info or not info.get("ray_job_id"):
        return info
    if info["status"] in ("SUCCEEDED", "FAILED", "STOPPED"):
        return info
    try:
        ray_dashboard_url = _ray_url_for_job(info)
        status = await _get_ray_job_status(ray_dashboard_url, info["ray_job_id"])
        info["status"] = status.get("status", info["status"])
        if status.get("status") in ("SUCCEEDED", "FAILED", "STOPPED"):
            info["finished_at"] = _now()
            info["message"] = status.get("message")
            # parse RESULT_JSON from logs
            try:
                logs = await _get_ray_job_logs(ray_dashboard_url, info["ray_job_id"])
                for line in logs.splitlines():
                    if RESULT_MARKER in line:
                        info["best_run"] = json.loads(line.split(RESULT_MARKER, 1)[1])
            except Exception:
                pass
            _persist(info)
    except Exception as e:
        info["message"] = f"status refresh 실패: {e}"
        _persist(info)
    return info


PROGRESS_MARKER = "[AutoML] PROGRESS="
RESULT_MARKER = "[AutoML] RESULT_JSON="


async def stream_logs(job_id: str):
    """SSE event generator — log / progress / status 분리"""
    info = _jobs.get(job_id)
    if not info:
        yield f"data: {json.dumps({'error': 'job not found'})}\n\n"
        return

    # QUEUED 상태면 Ray submit 될 때까지 대기
    while info["status"] == "QUEUED":
        pos = queue_position(job_id)
        yield f"data: {json.dumps({'queued': True, 'queue_position': pos})}\n\n"
        await asyncio.sleep(2)
        if info["status"] in ("CANCELED", "FAILED"):
            yield f"data: {json.dumps({'status': info['status'], 'message': info.get('message')})}\n\n"
            return

    if not info.get("ray_job_id"):
        yield f"data: {json.dumps({'error': 'ray job not available'})}\n\n"
        return

    submission_id = info["ray_job_id"]
    ray_dashboard_url = _ray_url_for_job(info)
    last_len = 0
    while True:
        try:
            logs = await _get_ray_job_logs(ray_dashboard_url, submission_id)
            if len(logs) > last_len:
                chunk = logs[last_len:]
                last_len = len(logs)
                # PROGRESS / RESULT 마커는 별도 이벤트, 일반 로그는 한번에 묶어 1개 이벤트로 전송
                # (라인별 SSE 이벤트는 수천 라인에서 브라우저 DOM 업데이트 폭주로 렉 발생)
                plain_lines: list[str] = []
                for line in chunk.splitlines():
                    if PROGRESS_MARKER in line:
                        try:
                            payload = json.loads(line.split(PROGRESS_MARKER, 1)[1])
                            yield f"data: {json.dumps({'progress': payload})}\n\n"
                        except Exception:
                            pass
                        continue
                    if RESULT_MARKER in line:
                        try:
                            info["best_run"] = json.loads(line.split(RESULT_MARKER, 1)[1])
                        except Exception:
                            pass
                        continue
                    plain_lines.append(line)
                if plain_lines:
                    yield f"data: {json.dumps({'log': '\\n'.join(plain_lines)})}\n\n"

            status_info = await _get_ray_job_status(ray_dashboard_url, submission_id)
            status = status_info.get("status")
            info["status"] = status
            if status in ("SUCCEEDED", "FAILED", "STOPPED"):
                info["finished_at"] = _now()
                info["message"] = status_info.get("message")
                _persist(info)
                yield f"data: {json.dumps({'status': status, 'message': info.get('message'), 'best': info.get('best_run')})}\n\n"
                return
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return
        await asyncio.sleep(2)


async def stop(job_id: str) -> bool:
    info = _jobs.get(job_id)
    if not info or not info.get("ray_job_id"):
        return False
    if info["status"] in ("SUCCEEDED", "FAILED", "STOPPED"):
        return False
    ray_dashboard_url = _ray_url_for_job(info)
    async with httpx.AsyncClient(timeout=15) as c:
        resp = await c.post(f"{ray_dashboard_url}/api/jobs/{info['ray_job_id']}/stop")
        ok = resp.status_code in (200, 204)
    if ok:
        info["status"] = "STOPPED"
        info["finished_at"] = _now()
        _persist(info)
    return ok
