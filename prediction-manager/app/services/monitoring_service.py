import asyncio
import httpx
from app.config import settings


async def _query(promql: str) -> float | None:
    """Prometheus instant query. 결과 없거나 실패 시 None 반환."""
    if not settings.prometheus_url:
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.prometheus_url}/api/v1/query",
                params={"query": promql},
            )
            resp.raise_for_status()
            data = resp.json()
            results = data.get("data", {}).get("result", [])
            if not results:
                return None
            return float(results[0]["value"][1])
    except Exception:
        return None


async def get_gpu_metrics() -> dict:
    util, mem_used, mem_free, temp, power = await asyncio.gather(
        _query("avg(DCGM_FI_DEV_GPU_UTIL)"),
        _query("sum(DCGM_FI_DEV_FB_USED)"),
        _query("sum(DCGM_FI_DEV_FB_FREE)"),
        _query("avg(DCGM_FI_DEV_GPU_TEMP)"),
        _query("sum(DCGM_FI_DEV_POWER_USAGE)"),
    )

    mem_total = (mem_used + mem_free) if (mem_used is not None and mem_free is not None) else None
    mem_used_gb = round(mem_used / 1024, 1) if mem_used is not None else None
    mem_total_gb = round(mem_total / 1024, 1) if mem_total is not None else None
    mem_pct = (
        round(mem_used / mem_total * 100)
        if mem_used is not None and mem_total and mem_total > 0
        else None
    )

    return {
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

    cpu_total_cores = round(cpu_total) if cpu_total is not None else None
    cpu_pct = round(cpu_used / cpu_total * 100) if cpu_used is not None and cpu_total else None
    mem_used_gb = round(mem_used / 1024 ** 3, 1) if mem_used is not None else None
    mem_total_gb = round(mem_total / 1024 ** 3, 1) if mem_total is not None else None
    mem_pct = round(mem_used / mem_total * 100) if mem_used is not None and mem_total else None

    return {
        "cpu_cores": round(cpu_used, 2) if cpu_used is not None else None,
        "cpu_total_cores": cpu_total_cores,
        "cpu_pct": cpu_pct,
        "mem_used_gb": mem_used_gb,
        "mem_total_gb": mem_total_gb,
        "mem_pct": mem_pct,
    }
