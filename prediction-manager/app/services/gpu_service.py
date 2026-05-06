import os
import subprocess
import time
from kubernetes import client, config
from kubernetes.stream import stream

try:
    config.load_incluster_config()
except config.ConfigException:
    config.load_kube_config()

core_v1 = client.CoreV1Api()


# GPU 하드웨어 정보 캐시 (변경 드묾)
_GPU_INFO_CACHE: dict = {"data": None, "ts": 0.0}
_GPU_INFO_TTL = 300  # 5분


def get_gpu_hardware_info() -> dict:
    """노드의 GPU 모델, VRAM, time-slicing 슬롯 수 조회.

    nvidia-smi로 직접 쿼리하거나, 실패 시 ConfigMap/환경변수 폴백.
    """
    now = time.time()
    if _GPU_INFO_CACHE["data"] and now - _GPU_INFO_CACHE["ts"] < _GPU_INFO_TTL:
        return _GPU_INFO_CACHE["data"]

    info = {
        "model": os.environ.get("GPU_MODEL", "RTX 3090"),
        "vram_gb": int(os.environ.get("GPU_VRAM_GB", "24")),
        "physical_count": 1,
        "time_slicing_slots": 0,
        "vram_shared_note": "Time-slicing: 모든 슬롯이 동일한 물리 GPU 메모리 공유",
    }

    # 노드 capacity로 time-slicing 슬롯 개수 추출
    try:
        nodes = core_v1.list_node()
        total_slots = 0
        for node in nodes.items:
            cap = node.status.capacity or {}
            total_slots += int(cap.get("nvidia.com/gpu", 0))
        if total_slots > 0:
            info["time_slicing_slots"] = total_slots
    except Exception:
        pass

    # nvidia-smi로 실제 GPU 모델/VRAM 조회 시도 (GPU 노드의 DaemonSet pod 등에서 실행)
    try:
        ds_pods = core_v1.list_pod_for_all_namespaces(
            label_selector="app.kubernetes.io/name=nvidia-device-plugin"
        )
        if ds_pods.items:
            pod = ds_pods.items[0]
            resp = stream(
                core_v1.connect_get_namespaced_pod_exec,
                pod.metadata.name, pod.metadata.namespace,
                command=["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
                stderr=True, stdin=False, stdout=True, tty=False,
            )
            lines = [l.strip() for l in resp.strip().split("\n") if l.strip()]
            if lines:
                parts = lines[0].split(",")
                if len(parts) >= 2:
                    info["model"] = parts[0].strip()
                    info["vram_gb"] = int(round(int(parts[1].strip()) / 1024))
                    info["physical_count"] = len(lines)
    except Exception:
        pass

    _GPU_INFO_CACHE["data"] = info
    _GPU_INFO_CACHE["ts"] = now
    return info


def get_gpu_status(namespace: str = None) -> dict:
    """전체 GPU 현황 (관리자용)"""
    nodes = core_v1.list_node()
    total_gpu = 0
    for node in nodes.items:
        cap = node.status.capacity or {}
        total_gpu += int(cap.get("nvidia.com/gpu", 0))

    pods = core_v1.list_pod_for_all_namespaces()
    used_gpu = 0
    for pod in pods.items:
        if pod.status.phase not in ("Running", "Pending"):
            continue
        for container in pod.spec.containers:
            res = container.resources
            if res and res.limits and "nvidia.com/gpu" in res.limits:
                used_gpu += int(res.limits["nvidia.com/gpu"])

    hw = get_gpu_hardware_info()
    return {
        "total": total_gpu,
        "used": used_gpu,
        "available": total_gpu - used_gpu,
        "hardware": hw,
    }


def get_user_gpu_status(namespace: str) -> dict:
    """사용자별 GPU 할당량 (ResourceQuota 기준)"""
    try:
        quotas = core_v1.list_namespaced_resource_quota(namespace)
        quota_gpu = 0
        used_gpu = 0
        for q in quotas.items:
            hard = q.status.hard or {}
            used = q.status.used or {}
            quota_gpu = int(hard.get("requests.nvidia.com/gpu", 0))
            used_gpu = int(used.get("requests.nvidia.com/gpu", 0))
    except Exception:
        quota_gpu = 0
        used_gpu = 0

    hw = get_gpu_hardware_info()
    return {
        "total": quota_gpu,
        "used": used_gpu,
        "available": quota_gpu - used_gpu,
        "hardware": hw,
    }
