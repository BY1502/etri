import asyncio
import os
import re
import sqlite3
import threading
import random
import string
from datetime import datetime, timezone

_DB_PATH = os.environ.get("ALARMS_DB_PATH", "/data/alarms.db")
_lock = threading.Lock()
MAX_PER_KEY = 20

# key → (targetPath, sectionId)
_KEY_META = {
    "gpu":            ("/monitoring", "section-gpu"),
    "gpu-temp":       ("/monitoring", "section-gpu-temp"),
    "system":         ("/monitoring", "section-system"),
    "kserve":         ("/monitoring", "section-kserve"),
    "kserve-error":   ("/monitoring", "section-kserve-error"),
    "kserve-latency": ("/monitoring", "section-kserve-latency"),
    "automl":         ("/monitoring", "section-automl"),
    "pvc":            ("/monitoring", "section-pvc"),
}


def init_db():
    with _lock:
        parent = os.path.dirname(_DB_PATH)
        if parent:
            os.makedirs(parent, exist_ok=True)
        conn = sqlite3.connect(_DB_PATH)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS alarms (
                id           TEXT PRIMARY KEY,
                key          TEXT NOT NULL,
                level        TEXT NOT NULL,
                msg          TEXT NOT NULL,
                section_id   TEXT NOT NULL,
                triggered_at TEXT NOT NULL,
                triggered_ts INTEGER NOT NULL,
                resolved_at  TEXT,
                resolved_ts  INTEGER
            )
        """)
        conn.commit()
        conn.close()


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _fmt_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rand6() -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=6))


def _msg_fingerprint(msg: str) -> str:
    """숫자 값 부분을 제거해 동일 종류의 알람인지 식별하는 키."""
    return re.sub(r"\s*\([\d.,]+[^)]*\)", "", msg).strip()


# 차트 배경 구역 + 알람 임계값의 단일 소스
# 프론트엔드 monitoring.js는 /summary 응답의 "zones" 필드에서 이 값을 읽음
ZONES = {
    "chart-gpu-util": {"warn": 70, "danger": 85},
    "chart-gpu-mem":  {"warn": 80, "danger": 90},
    "chart-cpu":      {"warn": 80, "danger": 95},
    "chart-mem":      {"warn": 85, "danger": 95},
}


def eval_alarms(data: dict) -> list[dict]:
    """summary 데이터에서 현재 활성 알람 목록 계산."""
    alarms = []

    def _add(key, level, msg):
        _, section_id = _KEY_META[key]
        alarms.append({"key": key, "level": level, "msg": msg, "section_id": section_id})

    # 수집 오류
    if data.get("gpu", {}).get("status") == "error" or data.get("system", {}).get("status") == "error":
        _add("gpu", "critical", "모니터링 데이터 수집 실패")

    # GPU
    gpu = data.get("gpu", {})
    if gpu.get("status") == "ok":
        util = gpu.get("util_pct", 0)
        if util > ZONES["chart-gpu-util"]["danger"]:
            _add("gpu", "critical", f"GPU 사용률이 너무 높습니다 ({util}%)")
        elif util > ZONES["chart-gpu-util"]["warn"]:
            _add("gpu", "warning", f"GPU 사용률이 높습니다 ({util}%)")

        mem = gpu.get("mem_pct", 0)
        if mem > ZONES["chart-gpu-mem"]["danger"]:
            _add("gpu", "critical", f"GPU 메모리가 부족합니다 ({mem}%)")
        elif mem > ZONES["chart-gpu-mem"]["warn"]:
            _add("gpu", "warning", f"GPU 메모리 사용량이 높습니다 ({mem}%)")

        temp = gpu.get("temp_c", 0)
        if temp > 85:
            _add("gpu-temp", "critical", f"GPU 온도 과열 ({temp}°C)")

    # 시스템
    system = data.get("system", {})
    if system.get("status") == "ok":
        cpu = system.get("cpu_pct", 0)
        if cpu > ZONES["chart-cpu"]["warn"]:
            _add("system", "warning", f"CPU 사용률이 높습니다 ({cpu}%)")

        mem = system.get("mem_pct", 0)
        if mem > ZONES["chart-mem"]["warn"]:
            _add("system", "warning", f"시스템 메모리 부족 ({mem}%)")

    # KServe 엔드포인트
    kserve = data.get("kserve", {})
    if not kserve.get("error"):
        for ep in kserve.get("endpoints", []):
            if not ep.get("ready"):
                _add("kserve", "warning", f"엔드포인트 비정상: {ep['name']}")

    # KServe 에러율
    kserve_err = data.get("kserve_error_rate", {})
    if kserve_err.get("status") == "ok":
        for m in kserve_err.get("models", []):
            if m.get("error_rate", 0) > 5:
                _add("kserve-error", "critical",
                     f"KServe 에러율 높음: {m['name']} ({m['error_rate']:.1f}%)")

    # KServe latency
    kserve_lat = data.get("kserve_top5_latency", {})
    if kserve_lat.get("status") == "ok":
        for m in kserve_lat.get("models", []):
            if m.get("latency_ms", 0) > 1000:
                _add("kserve-latency", "warning",
                     f"응답 지연 감지: {m['name']} ({round(m['latency_ms'])}ms)")

    # AutoML 실패
    automl = data.get("automl", {})
    if not automl.get("error"):
        for job in automl.get("jobs", []):
            if job.get("status") == "FAILED":
                _add("automl", "warning", f"AutoML 작업 실패: {job['name']}")

    # PVC Lost
    pvc = data.get("pvc", {})
    if pvc.get("status") == "ok":
        for g in pvc.get("groups", []):
            if g.get("phase_counts", {}).get("Lost", 0) > 0:
                _add("pvc", "critical", f"PVC 볼륨 손상 감지: {g['ns']}")

    return alarms


def update_alarms(data: dict):
    """summary 데이터로 DB 이력 갱신 (신규 발생 INSERT, 해소된 건 UPDATE)."""
    current = eval_alarms(data)
    # 핑거프린트(숫자 제거) 기준으로 동일 알람 식별 → 값이 86%→88%로 바뀌어도 같은 알람 취급
    current_fps = {(a["key"], _msg_fingerprint(a["msg"])): a for a in current}
    now_ms = _now_ms()
    now_str = _fmt_now()

    with _lock:
        conn = sqlite3.connect(_DB_PATH)
        try:
            # 현재 active 이력 조회
            rows = conn.execute(
                "SELECT id, key, msg FROM alarms WHERE resolved_at IS NULL"
            ).fetchall()

            active_fps: dict[tuple, str] = {}  # (key, fp) → row_id
            for row_id, key, msg in rows:
                fp = _msg_fingerprint(msg)
                active_fps[(key, fp)] = row_id

            # 해소 처리: 핑거프린트가 현재 알람에 없으면 resolved
            for (key, fp), row_id in active_fps.items():
                if (key, fp) not in current_fps:
                    conn.execute(
                        "UPDATE alarms SET resolved_at=?, resolved_ts=? WHERE id=?",
                        (now_str, now_ms, row_id),
                    )

            # 신규/갱신 처리
            for (key, fp), a in current_fps.items():
                if (key, fp) in active_fps:
                    # 이미 active인 알람 — 메시지(값)만 갱신
                    row_id = active_fps[(key, fp)]
                    conn.execute(
                        "UPDATE alarms SET msg=?, level=? WHERE id=?",
                        (a["msg"], a["level"], row_id),
                    )
                else:
                    # 진짜 신규 알람
                    new_id = f"{a['key']}-{now_ms}-{_rand6()}"
                    conn.execute(
                        """INSERT INTO alarms
                           (id, key, level, msg, section_id, triggered_at, triggered_ts,
                            resolved_at, resolved_ts)
                           VALUES (?,?,?,?,?,?,?,NULL,NULL)""",
                        (new_id, a["key"], a["level"], a["msg"], a["section_id"],
                         now_str, now_ms),
                    )

            # key당 MAX_PER_KEY 초과분 삭제 (활성 여부와 관계없이 전체 key 대상)
            all_keys = conn.execute("SELECT DISTINCT key FROM alarms").fetchall()
            for (key,) in all_keys:
                excess = conn.execute(
                    """SELECT id FROM alarms WHERE key=?
                       ORDER BY triggered_ts DESC LIMIT -1 OFFSET ?""",
                    (key, MAX_PER_KEY),
                ).fetchall()
                for (eid,) in excess:
                    conn.execute("DELETE FROM alarms WHERE id=?", (eid,))

            conn.commit()
        finally:
            conn.close()


def get_active() -> list[dict]:
    """현재 활성 알람 반환 (summary alarms 필드 / AlarmBar용)."""
    with _lock:
        conn = sqlite3.connect(_DB_PATH)
        try:
            rows = conn.execute(
                "SELECT key, level, msg, section_id FROM alarms WHERE resolved_at IS NULL"
            ).fetchall()
        finally:
            conn.close()

    result = []
    for key, level, msg, section_id in rows:
        target_path, _ = _KEY_META.get(key, ("/monitoring", section_id))
        result.append({
            "key": key,
            "level": level,
            "msg": msg,
            "targetPath": target_path,
            "sectionId": section_id,
        })
    return result


async def update_alarms_async(data: dict):
    return await asyncio.to_thread(update_alarms, data)


async def get_active_async() -> list[dict]:
    return await asyncio.to_thread(get_active)


async def get_history_async(limit: int = 500) -> list[dict]:
    return await asyncio.to_thread(get_history, limit)


def get_history(limit: int = 500) -> list[dict]:
    """알람 이력 반환 (monitoring-alarm.js 사이드바용)."""
    with _lock:
        conn = sqlite3.connect(_DB_PATH)
        try:
            rows = conn.execute(
                """SELECT id, key, level, msg, section_id,
                          triggered_at, triggered_ts, resolved_at, resolved_ts
                   FROM alarms ORDER BY triggered_ts DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        finally:
            conn.close()

    return [
        {
            "id":           r[0],
            "key":          r[1],
            "level":        r[2],
            "msg":          r[3],
            "section_id":   r[4],
            "triggered_at": r[5],
            "triggered_ts": r[6],
            "resolved_at":  r[7],
            "resolved_ts":  r[8],
        }
        for r in rows
    ]
