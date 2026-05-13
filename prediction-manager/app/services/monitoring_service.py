import asyncio
import time
import httpx
from app.config import settings

# Prometheus 쿼리 결과 상태 sentinel (내부용)
_ERR = object()    # 요청 자체 실패 (URL 미설정, 네트워크 오류 등)
_EMPTY = object()  # 요청 성공이나 결과 없음


def _prom_status(*vals) -> str:
    """sentinel 값 모음에서 전체 상태 문자열 반환."""
    if any(v is _ERR for v in vals):
        return "error"
    if all(v is _EMPTY for v in vals):
        return "empty"
    return "ok"


def _pv(v):
    """sentinel → None 변환, 실제 값은 그대로."""
    return None if (v is _ERR or v is _EMPTY) else v


async def _query(promql: str) -> float | object:
    """Prometheus instant query. float | _EMPTY | _ERR 반환."""
    if not settings.prometheus_url:
        return _ERR
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.prometheus_url}/api/v1/query",
                params={"query": promql},
            )
            resp.raise_for_status()
            results = resp.json().get("data", {}).get("result", [])
            if not results:
                return _EMPTY
            return float(results[0]["value"][1])
    except Exception:
        return _ERR


async def _query_multi(promql: str) -> tuple[list[dict], str]:
    """Prometheus instant query (다중 결과). (rows, status) 반환."""
    if not settings.prometheus_url:
        return [], "error"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.prometheus_url}/api/v1/query",
                params={"query": promql},
            )
            resp.raise_for_status()
            results = resp.json().get("data", {}).get("result", [])
            if not results:
                return [], "empty"
            return [{"labels": r["metric"], "value": float(r["value"][1])} for r in results], "ok"
    except Exception:
        return [], "error"


async def _query_range(promql: str, start: float, end: float, step: str) -> tuple[list, str]:
    """Prometheus range query. (points, status) 반환."""
    if not settings.prometheus_url:
        return [], "error"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{settings.prometheus_url}/api/v1/query_range",
                params={"query": promql, "start": start, "end": end, "step": step},
            )
            resp.raise_for_status()
            results = resp.json().get("data", {}).get("result", [])
            if not results:
                return [], "empty"
            return [[int(float(ts) * 1000), round(float(v))] for ts, v in results[0]["values"]], "ok"
    except Exception:
        return [], "error"


async def get_notebook_resources() -> dict:
    (cpu_results, cpu_st), (mem_results, mem_st) = await asyncio.gather(
        _query_multi(
            'sum by (namespace, pod) ('
            'rate(container_cpu_usage_seconds_total'
            '{namespace=~"kubeflow-.*", container!="", container!="POD"}[5m]))'
            ' * on(namespace, pod) group_left'
            ' kube_pod_owner{owner_kind="StatefulSet"}'
        ),
        _query_multi(
            'sum by (namespace, pod) ('
            'container_memory_working_set_bytes'
            '{namespace=~"kubeflow-.*", container!="", container!="POD"})'
            ' / 1024 / 1024 / 1024'
            ' * on(namespace, pod) group_left'
            ' kube_pod_owner{owner_kind="StatefulSet"}'
        ),
    )

    if "error" in (cpu_st, mem_st):
        return {"status": "error", "rows": []}
    if cpu_st == "empty":
        return {"status": "empty", "rows": []}

    mem_map = {
        (r["labels"].get("namespace", ""), r["labels"].get("pod", "")): r["value"]
        for r in mem_results
    }

    now = time.strftime("%Y-%m-%d %H:%M", time.localtime())
    rows = []
    for r in cpu_results:
        ns = r["labels"].get("namespace", "")
        pod = r["labels"].get("pod", "")
        rows.append({
            "time": now,
            "ns": ns,
            "pod": pod,
            "cpu": round(r["value"], 5),
            "mem": round(mem_map.get((ns, pod), 0), 5),
        })

    rows.sort(key=lambda x: (x["ns"], x["pod"]))
    return {"status": "ok", "rows": rows}


async def get_gpu_trend(window_minutes: int = 60, step: str = "1m") -> dict:
    now = time.time()
    data, status = await _query_range(
        "avg(DCGM_FI_DEV_GPU_UTIL)",
        start=now - window_minutes * 60,
        end=now,
        step=step,
    )
    return {"status": status, "data": data}


async def get_gpu_metrics() -> dict:
    util, mem_used, mem_free, temp, power = await asyncio.gather(
        _query("avg(DCGM_FI_DEV_GPU_UTIL)"),
        _query("sum(DCGM_FI_DEV_FB_USED)"),
        _query("sum(DCGM_FI_DEV_FB_FREE)"),
        _query("avg(DCGM_FI_DEV_GPU_TEMP)"),
        _query("sum(DCGM_FI_DEV_POWER_USAGE)"),
    )

    status = _prom_status(util, mem_used, mem_free, temp, power)
    util, mem_used, mem_free, temp, power = _pv(util), _pv(mem_used), _pv(mem_free), _pv(temp), _pv(power)

    mem_total = (mem_used + mem_free) if (mem_used is not None and mem_free is not None) else None
    mem_used_gb = round(mem_used / 1024, 1) if mem_used is not None else None
    mem_total_gb = round(mem_total / 1024, 1) if mem_total is not None else None
    mem_pct = (
        round(mem_used / mem_total * 100)
        if mem_used is not None and mem_total and mem_total > 0
        else None
    )

    return {
        "status": status,
        "util_pct": round(util) if util is not None else None,
        "mem_used_gb": mem_used_gb,
        "mem_total_gb": mem_total_gb,
        "mem_pct": mem_pct,
        "temp_c": round(temp) if temp is not None else None,
        "power_w": round(power, 1) if power is not None else None,
    }


async def get_system_metrics(namespace: str | None = None) -> dict:
    cpu_used, cpu_total, mem_used, mem_total = await asyncio.gather(
        _query('sum(rate(container_cpu_usage_seconds_total{container!=""}[5m]))'),
        _query('sum(machine_cpu_cores)'),
        _query('sum(container_memory_working_set_bytes{container!=""})'),
        _query('sum(node_memory_MemTotal_bytes)'),
    )

    status = _prom_status(cpu_used, cpu_total, mem_used, mem_total)
    cpu_used, cpu_total, mem_used, mem_total = _pv(cpu_used), _pv(cpu_total), _pv(mem_used), _pv(mem_total)

    cpu_total_cores = round(cpu_total) if cpu_total is not None else None
    cpu_pct = round(cpu_used / cpu_total * 100) if cpu_used is not None and cpu_total else None
    mem_used_gb = round(mem_used / 1024 ** 3, 1) if mem_used is not None else None
    mem_total_gb = round(mem_total / 1024 ** 3, 1) if mem_total is not None else None
    mem_pct = round(mem_used / mem_total * 100) if mem_used is not None and mem_total else None

    return {
        "status": status,
        "cpu_cores": round(cpu_used, 2) if cpu_used is not None else None,
        "cpu_total_cores": cpu_total_cores,
        "cpu_pct": cpu_pct,
        "mem_used_gb": mem_used_gb,
        "mem_total_gb": mem_total_gb,
        "mem_pct": mem_pct,
    }


def get_automl_jobs(namespace: str | None = None, is_admin: bool = False) -> dict:
    try:
        from app.services import automl_service
        jobs = automl_service.list_jobs(namespace=namespace, is_admin=is_admin)
        return {
            "error": False,
            "jobs": [
                {
                    "name": j.get("experiment_name", j.get("job_id", ""))
                            .replace("automl-", "")[:40],
                    "status": j.get("status", ""),
                    "submitted_by": j.get("submitted_by", "-"),
                    "submitted_at": j.get("submitted_at", ""),
                }
                for j in jobs[:20]
            ],
        }
    except Exception:
        return {"error": True, "jobs": []}


async def get_mlflow_stats() -> dict:
    experiments, models, runs = await asyncio.gather(
        _query("max(mlflow_experiments_total)"),
        _query("max(mlflow_registered_models_total)"),
        _query("sum(max by (experiment_id) (mlflow_runs_total))"),
    )
    status = _prom_status(experiments, models, runs)
    return {
        "status": status,
        "experiments": int(_pv(experiments)) if _pv(experiments) is not None else None,
        "models": int(_pv(models)) if _pv(models) is not None else None,
        "runs": int(_pv(runs)) if _pv(runs) is not None else None,
    }


async def get_mlflow_model_versions() -> dict:
    rows, status = await _query_multi(
        'sum by (name, current_stage) (mlflow_registered_model_versions_total)'
    )

    if status == "error":
        return {"status": "error", "models": []}
    if status == "empty":
        return {"status": "empty", "models": []}

    from collections import defaultdict
    model_map: dict[str, dict] = defaultdict(lambda: {"versions": 0, "stage": "None"})
    stage_priority = {"Production": 3, "Staging": 2, "Archived": 1, "None": 0}

    for r in rows:
        name = r["labels"].get("name", "")
        stage = r["labels"].get("current_stage", "None")
        count = int(r["value"])
        model_map[name]["versions"] += count
        cur_stage = model_map[name]["stage"]
        if stage_priority.get(stage, 0) > stage_priority.get(cur_stage, 0):
            model_map[name]["stage"] = stage

    models = sorted(
        [{"name": n, "versions": v["versions"], "stage": v["stage"]} for n, v in model_map.items()],
        key=lambda m: (-m["versions"], m["name"]),
    )
    return {"status": "ok", "models": models}


async def get_ray_status(namespace: str) -> dict:
    nodes, finished = await asyncio.gather(
        _query("count(ray_node_cpu_count)"),
        _query("sum(ray_finished_jobs_total)"),
    )
    status = _prom_status(nodes, finished)
    return {
        "status": status,
        "nodes": int(_pv(nodes)) if _pv(nodes) is not None else None,
        "finished_total": int(_pv(finished)) if _pv(finished) is not None else None,
    }


async def get_running_notebooks() -> dict:
    rows, status = await _query_multi(
        'kube_pod_status_phase{namespace=~"kubeflow-.*",phase="Running"}'
        ' * on(namespace,pod) group_left(owner_name)'
        ' kube_pod_owner{owner_kind="StatefulSet"} == 1'
    )

    if status == "error":
        return {"status": "error", "notebooks": []}
    if status == "empty":
        return {"status": "empty", "notebooks": []}

    notebooks = [
        {
            "namespace": r["labels"].get("namespace", ""),
            "owner_name": r["labels"].get("owner_name", ""),
            "pod": r["labels"].get("pod", ""),
        }
        for r in rows
    ]
    notebooks.sort(key=lambda x: (x["namespace"], x["pod"]))
    return {"status": "ok", "notebooks": notebooks}


async def get_pvc_storage() -> dict:
    rows, status = await _query_multi(
        'kube_persistentvolumeclaim_resource_requests_storage_bytes'
        '{namespace=~"kubeflow-.*"} / 1024 / 1024 / 1024'
    )

    if status == "error":
        return {"status": "error", "groups": []}
    if status == "empty":
        return {"status": "empty", "groups": []}

    from collections import defaultdict
    ns_map = defaultdict(list)
    for r in rows:
        ns = r["labels"].get("namespace", "")
        pvc = r["labels"].get("persistentvolumeclaim", "")
        ns_map[ns].append({"name": pvc, "allocated_gb": round(r["value"], 2)})

    groups = [
        {"ns": ns, "pvcs": sorted(pvcs, key=lambda p: p["name"])}
        for ns, pvcs in sorted(ns_map.items())
    ]
    return {"status": "ok", "groups": groups}


def get_kserve_endpoints() -> dict:
    try:
        from kubernetes import client as k8s_client
        custom = k8s_client.CustomObjectsApi()
        result = custom.list_cluster_custom_object(
            "serving.kserve.io", "v1beta1", "inferenceservices"
        )
        endpoints = []
        for item in result.get("items", []):
            conditions = item.get("status", {}).get("conditions", [])
            ready = any(
                c.get("type") == "Ready" and c.get("status") == "True"
                for c in conditions
            )
            endpoints.append({
                "name": item["metadata"]["name"],
                "namespace": item["metadata"]["namespace"],
                "ready": ready,
            })
        return {"error": False, "endpoints": endpoints}
    except Exception:
        return {"error": True, "endpoints": []}