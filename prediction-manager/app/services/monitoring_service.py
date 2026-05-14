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
            return [[int(float(ts) * 1000), round(float(v), 2)] for ts, v in results[0]["values"]], "ok"
    except Exception:
        return [], "error"


async def _query_range_multi(promql: str, start: float, end: float, step: str) -> tuple[list, str]:
    """Prometheus range query (다중 시계열). (series_list, status) 반환."""
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
            series = [
                {
                    "labels": r["metric"],
                    "data": [[int(float(ts) * 1000), round(float(v), 4)] for ts, v in r["values"]],
                }
                for r in results
            ]
            return series, "ok"
    except Exception:
        return [], "error"


async def get_notebook_resources(namespace: str | None = None) -> dict:
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
    if namespace:
        rows = [r for r in rows if r["ns"] == namespace]
    return {"status": "ok", "rows": rows}


def _parse_step_seconds(step: str) -> int:
    if step.endswith("m"):
        return int(step[:-1]) * 60
    elif step.endswith("s"):
        return int(step[:-1])
    elif step.endswith("h"):
        return int(step[:-1]) * 3600
    return 60


async def get_gpu_trend(window_minutes: int = 60, step: str = "1m") -> dict:
    step_seconds = _parse_step_seconds(step)
    now = (int(time.time()) // step_seconds) * step_seconds
    data, status = await _query_range(
        "avg(DCGM_FI_DEV_GPU_UTIL)",
        start=now - window_minutes * 60,
        end=now,
        step=step,
    )
    return {"status": status, "data": data}


async def get_kserve_rps(window_minutes: int = 30, step: str = "1m") -> dict:
    now = time.time()
    series, status = await _query_range_multi(
        "sum by (configuration_name, namespace_name) (rate(revision_request_count[5m]))",
        start=now - window_minutes * 60,
        end=now,
        step=step,
    )
    if status != "ok":
        return {"status": status, "series": []}
    result = [
        {
            "name": f"{s['labels'].get('configuration_name', '?')} ({s['labels'].get('namespace_name', '?')})",
            "data": s["data"],
        }
        for s in series
    ]
    return {"status": "ok", "series": result}


async def get_kserve_top5_latency() -> dict:
    rows, status = await _query_multi(
        "topk(5, histogram_quantile(0.95, sum by (configuration_name, namespace_name, le)"
        " (rate(revision_app_request_latencies_bucket[5m]))))"
    )
    if status == "error":
        return {"status": "error", "models": []}
    if status == "empty":
        return {"status": "empty", "models": []}
    models = [
        {
            "name": f"{r['labels'].get('configuration_name', '?')} ({r['labels'].get('namespace_name', '?')})",
            "latency_ms": round(r["value"], 2),
        }
        for r in rows
        if r["value"] == r["value"]  # NaN 제외
    ]
    models.sort(key=lambda m: m["latency_ms"], reverse=True)
    return {"status": "ok", "models": models}


async def get_kserve_error_rate() -> dict:
    rows, status = await _query_multi(
        'sum by (configuration_name, namespace_name)'
        ' (rate(revision_request_count{response_code_class="5xx"}[5m]))'
        ' / sum by (configuration_name, namespace_name)'
        ' (rate(revision_request_count[5m])) * 100'
    )
    if status == "error":
        return {"status": "error", "models": []}
    if status == "empty":
        return {"status": "empty", "models": []}
    models = [
        {
            "name": f"{r['labels'].get('configuration_name', '?')} ({r['labels'].get('namespace_name', '?')})",
            "error_rate": round(r["value"], 4) if not (r["value"] != r["value"]) else 0.0,
        }
        for r in rows
    ]
    models.sort(key=lambda m: m["name"])
    return {"status": "ok", "models": models}


async def get_kserve_latency_p95(window_minutes: int = 30, step: str = "1m") -> dict:
    now = time.time()
    series, status = await _query_range_multi(
        "histogram_quantile(0.95, sum by (configuration_name, namespace_name, le)"
        " (rate(revision_app_request_latencies_bucket[5m])))/1000",
        start=now - window_minutes * 60,
        end=now,
        step=step,
    )
    if status != "ok":
        return {"status": status, "series": []}
    result = [
        {
            "name": f"{s['labels'].get('configuration_name', '?')} ({s['labels'].get('namespace_name', '?')})",
            "data": s["data"],
        }
        for s in series
    ]
    return {"status": "ok", "series": result}


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


async def get_mlflow_stats(namespace: str | None = None) -> dict:
    if namespace:
        from app.services.tenant_resources import mlflow_tracking_uri
        base = mlflow_tracking_uri(namespace)
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r_exp, r_model = await asyncio.gather(
                    client.get(f"{base}/api/2.0/mlflow/experiments/search", params={"max_results": 1000}),
                    client.get(f"{base}/api/2.0/mlflow/registered-models/search", params={"max_results": 1000}),
                )
            experiments = [e for e in r_exp.json().get("experiments", []) if e.get("lifecycle_stage") == "active"]
            models = r_model.json().get("registered_models", [])
            exp_ids = [e["experiment_id"] for e in experiments]
            runs = 0
            if exp_ids:
                async with httpx.AsyncClient(timeout=15) as client:
                    r_runs = await client.post(
                        f"{base}/api/2.0/mlflow/runs/search",
                        json={"experiment_ids": exp_ids, "max_results": 50000},
                    )
                runs = len(r_runs.json().get("runs", []))
            return {"status": "ok", "experiments": len(experiments), "models": len(models), "runs": runs}
        except Exception:
            return {"status": "error", "experiments": None, "models": None, "runs": None}

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


async def get_mlflow_experiment_runs(namespace: str | None = None) -> dict:
    if namespace:
        from app.services.tenant_resources import mlflow_tracking_uri
        base = mlflow_tracking_uri(namespace)
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{base}/api/2.0/mlflow/experiments/search", params={"max_results": 1000})
            exps = [e for e in r.json().get("experiments", []) if e.get("lifecycle_stage") == "active"]
            if not exps:
                return {"status": "empty", "experiments": []}
            exp_ids = [e["experiment_id"] for e in exps]
            exp_name_map = {e["experiment_id"]: e["name"] for e in exps}
            async with httpx.AsyncClient(timeout=15) as client:
                r_runs = await client.post(
                    f"{base}/api/2.0/mlflow/runs/search",
                    json={"experiment_ids": exp_ids, "max_results": 50000},
                )
            run_counts: dict[str, int] = {e["experiment_id"]: 0 for e in exps}
            for run in r_runs.json().get("runs", []):
                eid = run.get("info", {}).get("experiment_id")
                if eid in run_counts:
                    run_counts[eid] += 1
            experiments = sorted(
                [{"name": exp_name_map[eid], "runs": cnt} for eid, cnt in run_counts.items()],
                key=lambda e: -e["runs"],
            )
            return {"status": "ok", "experiments": experiments}
        except Exception:
            return {"status": "error", "experiments": []}

    rows, status = await _query_multi('max by (experiment_name) (mlflow_runs_total)')

    if status == "error":
        return {"status": "error", "experiments": []}
    if status == "empty":
        return {"status": "empty", "experiments": []}

    experiments = sorted(
        [{"name": r["labels"].get("experiment_name", ""), "runs": int(r["value"])} for r in rows],
        key=lambda e: -e["runs"],
    )
    return {"status": "ok", "experiments": experiments}


async def get_mlflow_model_versions(namespace: str | None = None) -> dict:
    if namespace:
        from app.services.tenant_resources import mlflow_tracking_uri
        base = mlflow_tracking_uri(namespace)
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{base}/api/2.0/mlflow/registered-models/search", params={"max_results": 1000})
            registered = r.json().get("registered_models", [])
            if not registered:
                return {"status": "empty", "models": []}
            from collections import defaultdict
            model_map: dict[str, dict] = defaultdict(lambda: {"versions": 0, "stage": "None"})
            stage_priority = {"Production": 3, "Staging": 2, "Archived": 1, "None": 0}
            for m in registered:
                name = m.get("name", "")
                versions = m.get("latest_versions", [])
                model_map[name]["versions"] = len(versions)
                for v in versions:
                    stage = v.get("current_stage", "None")
                    cur = model_map[name]["stage"]
                    if stage_priority.get(stage, 0) > stage_priority.get(cur, 0):
                        model_map[name]["stage"] = stage
            models = sorted(
                [{"name": n, "versions": v["versions"], "stage": v["stage"]} for n, v in model_map.items()],
                key=lambda m: (-m["versions"], m["name"]),
            )
            return {"status": "ok", "models": models}
        except Exception:
            return {"status": "error", "models": []}

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


async def get_running_notebooks(namespace: str | None = None) -> dict:
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
    if namespace:
        notebooks = [n for n in notebooks if n["namespace"] == namespace]
    return {"status": "ok", "notebooks": notebooks}


async def get_pvc_storage(namespace: str | None = None) -> dict:
    ns_filter = f'namespace="{namespace}"' if namespace else 'namespace=~"kubeflow-.*"'

    (cap_rows, cap_st), (phase_rows, _) = await asyncio.gather(
        _query_multi(
            f'kube_persistentvolumeclaim_resource_requests_storage_bytes'
            f'{{{ns_filter}}} / 1024 / 1024 / 1024'
        ),
        _query_multi(f'kube_persistentvolumeclaim_status_phase{{{ns_filter}}}'),
    )

    if cap_st == "error":
        return {"status": "error", "groups": []}
    if cap_st == "empty":
        return {"status": "empty", "groups": []}

    phase_map = {}
    for r in phase_rows:
        if round(r["value"]) == 1:
            ns = r["labels"].get("namespace", "")
            pvc = r["labels"].get("persistentvolumeclaim", "")
            phase_map[(ns, pvc)] = r["labels"].get("phase", "Unknown")

    from collections import defaultdict
    ns_map = defaultdict(list)
    for r in cap_rows:
        ns = r["labels"].get("namespace", "")
        pvc = r["labels"].get("persistentvolumeclaim", "")
        ns_map[ns].append({
            "name": pvc,
            "allocated_gb": round(r["value"], 2),
            "phase": phase_map.get((ns, pvc), "Unknown"),
        })

    groups = []
    for ns, pvcs in sorted(ns_map.items()):
        pvcs_sorted = sorted(pvcs, key=lambda p: p["name"])
        total_gb = round(sum(p["allocated_gb"] for p in pvcs_sorted), 2)
        phase_counts = {"Bound": 0, "Pending": 0, "Lost": 0}
        for p in pvcs_sorted:
            if p["phase"] in phase_counts:
                phase_counts[p["phase"]] += 1
        groups.append({
            "ns": ns,
            "pvcs": pvcs_sorted,
            "total_gb": total_gb,
            "phase_counts": phase_counts,
        })
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