import asyncio
import math
import time
from fastapi import APIRouter, Request, Query
from app.auth import get_user_namespace, get_owner_namespace, is_admin, get_user_email
from app.services import monitoring_service, alarm_service

router = APIRouter()


# ── Ray mock (테스트 완료 후 이 블록 전체 삭제) ──────────────────────────────
_MOCK_RAY = True

# ── 알람 테스트 토글 — 배포 전 삭제 ──────────────────────────────────────────
_MOCK_ALARM_FIRE = True   # True=알람 발생값, False=정상값

def _ray_mock():
    now_ms = int(time.time() * 1000)
    ts = [now_ms - (59 - i) * 60_000 for i in range(60)]
    def wave(base, amp, period, noise, i):
        return round(max(0, base + amp * math.sin(2 * math.pi * i / period)
                               + noise * math.sin(2 * math.pi * i / 7 + 1.3)), 2)
    def workers(i):
        if i < 20: return 5
        if i < 35: return 15
        if i < 50: return 25
        return 16
    return {
        "ray_cluster_util": {
            "status": "ok",
            "cpu":  [[ts[i], wave(12, 8, 20, 3, i)] for i in range(60)],
            "mem":  [[ts[i], wave(38, 6, 30, 2, i)] for i in range(60)],
            "disk": [[ts[i], wave(14, 2, 45, 1, i)] for i in range(60)],
        },
        "ray_node_count": {
            "status": "ok",
            "types": [
                {"name": "worker-node-type-0", "data": [[ts[i], workers(i)] for i in range(60)]},
                {"name": "head-node-type",     "data": [[ts[i], 1]          for i in range(60)]},
            ],
            "finished_jobs": 137,
        },
    }
# ────────────────────────────────────────────────────────────────────────────


@router.get("/gpu-trend")
async def gpu_trend(window_minutes: int = 60, step: str = "1m"):
    return await monitoring_service.get_gpu_trend(window_minutes=window_minutes, step=step)


@router.get("/summary")
async def summary(request: Request, ns: str | None = None):
    
    # ================================================================
    # 테스트용 MOCK — 배포 전 반드시 다시 주석 처리
    # ns 없음 → 어드민 전체 뷰 / ?ns=kubeflow-researcher1 → 일반 사용자 뷰
    # ================================================================
    import time as _time
    _now = int(_time.time() * 1000)
    _min = 60_000
    _pts = lambda base, amp, n=30: [[_now - (n-1-i)*_min, round(base + (i % 7) * amp, 2)] for i in range(n)]

    import os as _os
    _ADMIN_EMAILS  = {"admin@example.com"}
    _email         = _os.environ.get("DEV_USER_EMAIL") or get_user_email(request)
    _admin         = _email in _ADMIN_EMAILS
    _namespace     = ns or ("kubeflow-admin" if _admin else get_user_namespace(request))
    _is_admin_view = _admin and (ns is None or ns == "kubeflow-admin")

    _all_automl_jobs = [
        {"name": "rf-baseline",   "status": "FAILED",    "submitted_by": "researcher1@example.com", "submitted_at": "2026-05-18T10:00:00"},
        {"name": "xgb-tuning",    "status": "RUNNING",   "submitted_by": "researcher2@example.com", "submitted_at": "2026-05-19T08:30:00"},
        {"name": "lgbm-v2",       "status": "SUCCEEDED", "submitted_by": "admin@example.com",        "submitted_at": "2026-05-17T14:20:00"},
        {"name": "nn-experiment", "status": "QUEUED",    "submitted_by": "researcher1@example.com", "submitted_at": "2026-05-19T09:00:00"},
    ]
    _all_kserve_eps = [
        {"name": "sentiment-model",   "namespace": "kubeflow-researcher1", "ready": False},
        {"name": "image-classifier",  "namespace": "kubeflow-researcher2", "ready": True},
        {"name": "tabular-regressor", "namespace": "kubeflow-researcher1", "ready": True},
    ]
    _all_kserve_err = [
        {"name": "sentiment-model (kubeflow-researcher1)",   "error_rate": 6.2},
        {"name": "image-classifier (kubeflow-researcher2)",  "error_rate": 0.3},
        {"name": "tabular-regressor (kubeflow-researcher1)", "error_rate": 1.1},
    ]
    _all_kserve_top5 = [
        {"name": "sentiment-model (kubeflow-researcher1)",   "latency_ms": 1840},
        {"name": "tabular-regressor (kubeflow-researcher1)", "latency_ms": 430},
        {"name": "image-classifier (kubeflow-researcher2)",  "latency_ms": 210},
    ]
    _all_rps = [
        {"name": "sentiment-model (kubeflow-researcher1)",   "data": _pts(12.5, 1.8)},
        {"name": "image-classifier (kubeflow-researcher2)",  "data": _pts(5.2,  0.9)},
        {"name": "tabular-regressor (kubeflow-researcher1)", "data": _pts(3.1,  0.5)},
    ]
    _all_latency = [
        {"name": "sentiment-model (kubeflow-researcher1)",   "data": _pts(1.72, 0.08)},
        {"name": "image-classifier (kubeflow-researcher2)",  "data": _pts(0.21, 0.03)},
        {"name": "tabular-regressor (kubeflow-researcher1)", "data": _pts(0.43, 0.05)},
    ]
    _all_nb_rows = [
        {"time": "2026-05-19T09:55:00", "ns": "kubeflow-researcher1", "pod": "jupyter-researcher1-0", "cpu": 2.4, "mem": 8.2},
        {"time": "2026-05-19T09:55:00", "ns": "kubeflow-researcher2", "pod": "jupyter-researcher2-0", "cpu": 0.8, "mem": 3.1},
        {"time": "2026-05-19T09:55:00", "ns": "kubeflow-admin",       "pod": "jupyter-admin-gpu",     "cpu": 4.0, "mem": 16.0},
    ]
    _all_running_nbs = [
        {"namespace": "kubeflow-researcher1", "owner_name": "researcher1", "pod": "jupyter-researcher1-0"},
        {"namespace": "kubeflow-researcher2", "owner_name": "researcher2", "pod": "jupyter-researcher2-0"},
        {"namespace": "kubeflow-admin",       "owner_name": "admin",       "pod": "jupyter-admin-gpu"},
    ]
    _all_pvc_groups = [
        {"ns": "kubeflow-researcher1", "pvcs": [
            {"name": "dataset-pvc", "allocated_gb": 50.0, "phase": "Bound"},
            {"name": "model-pvc",   "allocated_gb": 20.0, "phase": "Lost"},
        ], "total_gb": 70.0, "phase_counts": {"Bound": 1, "Pending": 0, "Lost": 1}},
        {"ns": "kubeflow-researcher2", "pvcs": [
            {"name": "workspace",   "allocated_gb": 30.0, "phase": "Bound"},
        ], "total_gb": 30.0, "phase_counts": {"Bound": 1, "Pending": 0, "Lost": 0}},
        {"ns": "kubeflow-admin", "pvcs": [
            {"name": "gpu-dataset", "allocated_gb": 100.0, "phase": "Bound"},
            {"name": "checkpoints", "allocated_gb": 40.0,  "phase": "Pending"},
        ], "total_gb": 140.0, "phase_counts": {"Bound": 1, "Pending": 1, "Lost": 0}},
    ]

    def _ns_filter(items, key):
        return items if _is_admin_view else [x for x in items if x.get(key) == _namespace]
    def _name_filter(items):
        return items if _is_admin_view else [x for x in items if f"({_namespace})" in x["name"]]

    result = {
        "namespace":     _namespace,
        "user_email":    _email,
        "is_admin":      _is_admin_view,
        "is_admin_view": _is_admin_view,
        # ── GPU (알람: 사용률 critical, 메모리 critical, 온도 critical)
        "gpu": {"status": "ok",
                "util_pct": 91  if _MOCK_ALARM_FIRE else 32,
                "mem_pct":  92  if _MOCK_ALARM_FIRE else 41,
                "mem_used_gb": 22.1 if _MOCK_ALARM_FIRE else 9.8,
                "mem_total_gb": 24.0, "temp_c": 87 if _MOCK_ALARM_FIRE else 62, "power_w": 285.0},
        "gpu_trend": {"status": "ok", "data": _pts(75 if _MOCK_ALARM_FIRE else 32, 3.5)},
        # ── 시스템 (알람: CPU warning, 메모리 warning)
        "system": {"status": "ok",
                   "cpu_pct": 83 if _MOCK_ALARM_FIRE else 28,
                   "cpu_cores": 13.3, "cpu_total_cores": 16,
                   "mem_pct": 87 if _MOCK_ALARM_FIRE else 48,
                   "mem_used_gb": 55.7 if _MOCK_ALARM_FIRE else 30.7, "mem_total_gb": 64.0},
        # ── Ray
        "ray": {"status": "ok", "nodes": 4, "finished_total": 128},
        "ray_trend": {"status": "ok", "data": _pts(3.2, 0.4)},
        "ray_cluster_util": {
            "status": "ok",
            "cpu":  _pts(12, 8, n=60),
            "mem":  _pts(38, 6, n=60),
            "disk": _pts(14, 2, n=60),
        },
        "ray_node_count": {
            "status": "ok",
            "types": [
                {"name": "worker-node-type-0", "data": [[_now - (59-i)*_min, 5 if i < 20 else 15 if i < 35 else 25 if i < 50 else 16] for i in range(60)]},
                {"name": "head-node-type",     "data": [[_now - (59-i)*_min, 1] for i in range(60)]},
            ],
            "finished_jobs": 137,
        },
        # ── AutoML (알람: FAILED warning)
        "automl": {
            "error": False,
            "jobs": (
                (_all_automl_jobs if _is_admin_view else [j for j in _all_automl_jobs if j["submitted_by"] == _email])
                if _MOCK_ALARM_FIRE else
                [j for j in (_all_automl_jobs if _is_admin_view else [j for j in _all_automl_jobs if j["submitted_by"] == _email])
                 if j["status"] != "FAILED"]
            ),
        },
        # ── KServe 엔드포인트 (알람: Not Ready warning)
        "kserve": {
            "error": False,
            "endpoints": (
                _ns_filter(_all_kserve_eps, "namespace") if _MOCK_ALARM_FIRE
                else [dict(ep, ready=True) for ep in _ns_filter(_all_kserve_eps, "namespace")]
            ),
        },
        # ── KServe 에러율 (알람: critical)
        "kserve_error_rate": {
            "status": "ok",
            "models": (
                _name_filter(_all_kserve_err) if _MOCK_ALARM_FIRE
                else [dict(m, error_rate=0.1) for m in _name_filter(_all_kserve_err)]
            ),
        },
        # ── KServe Top5 latency (알람: warning)
        "kserve_top5_latency": {
            "status": "ok",
            "models": (
                _name_filter(_all_kserve_top5) if _MOCK_ALARM_FIRE
                else [dict(m, latency_ms=180) for m in _name_filter(_all_kserve_top5)]
            ),
        },
        # ── KServe 시계열
        "kserve_rps":          {"status": "ok", "series": _name_filter(_all_rps)},
        "kserve_latency_p95":  {"status": "ok", "series": _name_filter(_all_latency)},
        # ── MLflow
        "mlflow": {"status": "ok", "experiments": 12, "models": 7, "runs": 348},
        "mlflow_models": {"status": "ok", "models": [
            {"name": "sentiment-classifier", "versions": 5, "stage": "Production"},
            {"name": "tabular-regressor",    "versions": 3, "stage": "Staging"},
            {"name": "image-clf-v2",         "versions": 2, "stage": "None"},
            {"name": "rf-baseline",          "versions": 8, "stage": "Production"},
        ]},
        "mlflow_experiment_runs": {"status": "ok", "experiments": [
            {"name": "sentiment-exp",  "runs": 87},
            {"name": "tabular-exp",    "runs": 134},
            {"name": "image-exp",      "runs": 62},
            {"name": "automl-rf",      "runs": 45},
            {"name": "baseline-study", "runs": 20},
        ]},
        # ── 노트북 자원 사용량 / 실행 중인 노트북 (ns 필터)
        "notebook_resources": {"status": "ok", "rows":      _ns_filter(_all_nb_rows,     "ns")},
        "running_notebooks":  {"status": "ok", "notebooks": _ns_filter(_all_running_nbs, "namespace")},
        # ── PVC (알람: Lost critical)
        "pvc": {
            "status": "ok",
            "groups": (
                (_all_pvc_groups if _is_admin_view else [g for g in _all_pvc_groups if g["ns"] == _namespace])
                if _MOCK_ALARM_FIRE else
                [dict(g, phase_counts={**g["phase_counts"], "Lost": 0},
                      pvcs=[dict(p, phase="Bound" if p["phase"] == "Lost" else p["phase"]) for p in g["pvcs"]])
                 for g in (_all_pvc_groups if _is_admin_view else [g for g in _all_pvc_groups if g["ns"] == _namespace])]
            ),
        },
    }
    await alarm_service.update_alarms_async(result)
    result["alarms"] = await alarm_service.get_active_async()
    return result
    # ================================================================

    namespace = ns or get_user_namespace(request)
    admin = is_admin(request)
    # admin이 자기 namespace(또는 ns 파라미터 없음)를 보는 경우 → 전체 뷰
    is_admin_view = admin and (ns is None or namespace == get_owner_namespace(request))
    # 필터링할 namespace: 전체 뷰면 None(전체), 아니면 선택된 namespace
    filter_ns = None if is_admin_view else namespace

    gpu, system, ray, mlflow, mlflow_models, mlflow_experiment_runs, notebook_resources, running_notebooks, pvc, gpu_trend, ray_trend, ray_cluster_util, ray_node_count, kserve_rps, kserve_latency_p95, kserve_error_rate, kserve_top5_latency = await asyncio.gather(
        monitoring_service.get_gpu_metrics(),
        monitoring_service.get_system_metrics(namespace),
        monitoring_service.get_ray_status(namespace),
        monitoring_service.get_mlflow_stats(namespace=filter_ns),
        monitoring_service.get_mlflow_model_versions(namespace=filter_ns),
        monitoring_service.get_mlflow_experiment_runs(namespace=filter_ns),
        monitoring_service.get_notebook_resources(namespace=filter_ns),
        monitoring_service.get_running_notebooks(namespace=filter_ns),
        monitoring_service.get_pvc_storage(namespace=filter_ns),
        monitoring_service.get_gpu_trend(window_minutes=60, step="1m"),
        monitoring_service.get_ray_trend(window_minutes=60, step="1m"),
        monitoring_service.get_ray_cluster_util_trend(window_minutes=60, step="1m"),
        monitoring_service.get_ray_node_count_trend(window_minutes=60, step="1m"),
        monitoring_service.get_kserve_rps(namespace=filter_ns, window_minutes=30, step="1m"),
        monitoring_service.get_kserve_latency_p95(namespace=filter_ns, window_minutes=30, step="1m"),
        monitoring_service.get_kserve_error_rate(namespace=filter_ns),
        monitoring_service.get_kserve_top5_latency(namespace=filter_ns),
    )

    # ── mock 적용 (테스트 완료 후 아래 세 줄 삭제) ──
    if _MOCK_RAY:
        _m = _ray_mock()
        ray_cluster_util, ray_node_count = _m["ray_cluster_util"], _m["ray_node_count"]
    # ────────────────────────────────────────────────

    result = {
        "namespace": namespace,
        "user_email": get_user_email(request),
        "is_admin": admin,
        "is_admin_view": is_admin_view,
        "gpu": gpu,
        "gpu_trend": gpu_trend,
        "kserve_rps": kserve_rps,
        "kserve_latency_p95": kserve_latency_p95,
        "kserve_error_rate": kserve_error_rate,
        "kserve_top5_latency": kserve_top5_latency,
        "system": system,
        "ray": ray,
        "ray_trend": ray_trend,
        "ray_cluster_util": ray_cluster_util,
        "ray_node_count": ray_node_count,
        "automl": monitoring_service.get_automl_jobs(
            namespace=None if is_admin_view else namespace,
            is_admin=admin,
        ),
        "kserve": monitoring_service.get_kserve_endpoints(namespace=filter_ns),
        "mlflow": mlflow,
        "mlflow_models": mlflow_models,
        "mlflow_experiment_runs": mlflow_experiment_runs,
        "notebook_resources": notebook_resources,
        "running_notebooks": running_notebooks,
        "pvc": pvc,
    }
    await alarm_service.update_alarms_async(result)
    result["alarms"] = await alarm_service.get_active_async()
    return result


@router.get("/alarms/history")
async def alarm_history(limit: int = Query(default=500, ge=1, le=1000)):
    return await alarm_service.get_history_async(limit=limit)


# ── 테스트용 토글 — 배포 전 삭제 ──────────────────────────────────────────────
@router.post("/alarms/test-fire")
async def alarm_test_fire():
    """mock 데이터를 알람 발생값으로 전환."""
    global _MOCK_ALARM_FIRE
    _MOCK_ALARM_FIRE = True
    return {"mode": "fire"}

@router.post("/alarms/test-resolve")
async def alarm_test_resolve():
    """mock 데이터를 정상값으로 전환 → 다음 summary 폴링에서 모든 알람 해소됨."""
    global _MOCK_ALARM_FIRE
    _MOCK_ALARM_FIRE = False
    return {"mode": "resolve"}

# ── 테스트용 — active 알람 1건을 해소 처리. 배포 전 삭제 ─────────────────────────
@router.post("/alarms/test-seed")
async def alarm_test_seed():
    import sqlite3
    from datetime import datetime, timezone, timedelta
    db_path = alarm_service._DB_PATH
    now = datetime.now(timezone.utc)
    res_ts  = int((now - timedelta(minutes=5)).timestamp() * 1000)
    res_str = (now - timedelta(minutes=5)).isoformat()
    conn = sqlite3.connect(db_path)
    row = conn.execute(
        "SELECT id FROM alarms WHERE resolved_at IS NULL ORDER BY triggered_ts ASC LIMIT 1"
    ).fetchone()
    if row:
        conn.execute(
            "UPDATE alarms SET resolved_at=?, resolved_ts=? WHERE id=?",
            (res_str, res_ts, row[0]),
        )
        conn.commit()
    conn.close()
    return {"resolved": row[0] if row else None}
