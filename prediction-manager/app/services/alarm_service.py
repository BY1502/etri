import asyncio
import os
import re
import sqlite3
import threading
import random
import string
from datetime import datetime, timezone
from typing import Literal

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
        try:
            conn.execute("ALTER TABLE alarms ADD COLUMN namespace TEXT")
        except sqlite3.OperationalError as e:
            if "duplicate column" not in str(e).lower():
                raise
        conn.execute("""
            CREATE TABLE IF NOT EXISTS alarm_user_state (
                user_email   TEXT NOT NULL,
                alarm_id     TEXT NOT NULL,
                dismissed_at TEXT,
                seen_at      TEXT,
                visited_at   TEXT,
                toasted_at   TEXT,
                PRIMARY KEY (user_email, alarm_id)
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

    def _add(key, level, msg, namespace=None):
        _, section_id = _KEY_META[key]
        alarms.append({
            "key": key,
            "level": level,
            "msg": msg,
            "section_id": section_id,
            "namespace": namespace,
        })

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
        if cpu > ZONES["chart-cpu"]["danger"]:
            _add("system", "critical", f"CPU 사용률이 너무 높습니다 ({cpu}%)")
        elif cpu > ZONES["chart-cpu"]["warn"]:
            _add("system", "warning", f"CPU 사용률이 높습니다 ({cpu}%)")

        mem = system.get("mem_pct", 0)
        if mem > ZONES["chart-mem"]["danger"]:
            _add("system", "critical", f"시스템 메모리가 부족합니다 ({mem}%)")
        elif mem > ZONES["chart-mem"]["warn"]:
            _add("system", "warning", f"시스템 메모리 사용량이 높습니다 ({mem}%)")

    # KServe 엔드포인트
    kserve = data.get("kserve", {})
    if not kserve.get("error"):
        for ep in kserve.get("endpoints", []):
            if not ep.get("ready"):
                _add("kserve", "warning", f"엔드포인트 비정상: {ep['name']}",
                     namespace=ep.get("namespace"))

    # KServe 에러율
    kserve_err = data.get("kserve_error_rate", {})
    if kserve_err.get("status") == "ok":
        for m in kserve_err.get("models", []):
            if m.get("error_rate", 0) > 5:
                _add("kserve-error", "critical",
                     f"KServe 에러율 높음: {m['name']} ({m['error_rate']:.1f}%)",
                     namespace=m.get("namespace"))

    # KServe latency
    kserve_lat = data.get("kserve_top5_latency", {})
    if kserve_lat.get("status") == "ok":
        for m in kserve_lat.get("models", []):
            if m.get("latency_ms", 0) > 1000:
                _add("kserve-latency", "warning",
                     f"응답 지연 감지: {m['name']} ({round(m['latency_ms'])}ms)",
                     namespace=m.get("namespace"))

    # AutoML 실패
    automl = data.get("automl", {})
    if not automl.get("error"):
        for job in automl.get("jobs", []):
            if job.get("status") == "FAILED":
                _add("automl", "warning", f"AutoML 작업 실패: {job['name']}",
                     namespace=job.get("namespace"))

    # PVC Lost
    pvc = data.get("pvc", {})
    if pvc.get("status") == "ok":
        for g in pvc.get("groups", []):
            if g.get("phase_counts", {}).get("Lost", 0) > 0:
                _add("pvc", "critical", f"PVC 볼륨 손상 감지: {g['ns']}",
                     namespace=g.get("ns"))

    return alarms


def update_alarms(data: dict, filter_ns: str | None = None):
    """summary 데이터로 DB 이력 갱신 (신규 발생 INSERT, 해소된 건 UPDATE).

    filter_ns: 이번 호출의 data가 다루는 namespace 범위.
    None이면 admin 전체뷰(모든 namespace 포함) 호출.
    """
    current = eval_alarms(data)
    # (key, namespace, 핑거프린트) 기준으로 동일 알람 식별 → 값이 86%→88%로 바뀌어도 같은 알람 취급,
    # 서로 다른 namespace의 동일 메시지는 별개 알람으로 구분
    current_fps = {(a["key"], a["namespace"], _msg_fingerprint(a["msg"])): a for a in current}
    now_ms = _now_ms()
    now_str = _fmt_now()

    with _lock:
        conn = sqlite3.connect(_DB_PATH)
        try:
            # 현재 active 이력 조회
            rows = conn.execute(
                "SELECT id, key, namespace, msg FROM alarms WHERE resolved_at IS NULL"
            ).fetchall()

            active_fps: dict[tuple, str] = {}  # (key, namespace, fp) → row_id
            for row_id, key, row_ns, msg in rows:
                fp = _msg_fingerprint(msg)
                active_fps[(key, row_ns, fp)] = row_id

            # 해소 처리: 핑거프린트가 현재 알람에 없으면 resolved
            # 단, 이번 호출의 data가 다루지 않는 namespace의 행은 건드리지 않음
            # (다른 테넌트의 활성 알람을 잘못 해소시키는 churn 방지)
            for (key, row_ns, fp), row_id in active_fps.items():
                if key == "automl":
                    # 실패한 AutoML job은 "해소"되는 개념이 없음(영원히 실패 상태) —
                    # resolved_at을 설정하지 않고 MAX_PER_KEY eviction으로만 정리
                    continue
                if key == "kserve-latency":
                    # get_kserve_top5_latency는 admin 전체뷰에서 전 테넌트 합산 top5만
                    # 반환(per-tenant superset이 아님) — admin 폴링이 다른 테넌트의
                    # 알람을 top5 밖으로 밀려났다는 이유만으로 잘못 해소시키지 않도록
                    # 같은 테넌트의 폴링에서만 해소 판정
                    in_scope = row_ns == filter_ns
                else:
                    in_scope = (row_ns is None) or (filter_ns is None) or (row_ns == filter_ns)
                if not in_scope:
                    continue
                if (key, row_ns, fp) not in current_fps:
                    conn.execute(
                        "UPDATE alarms SET resolved_at=?, resolved_ts=? WHERE id=?",
                        (now_str, now_ms, row_id),
                    )

            # 신규/갱신 처리
            for (key, row_ns, fp), a in current_fps.items():
                if (key, row_ns, fp) in active_fps:
                    # 이미 active인 알람 — 메시지(값)만 갱신
                    row_id = active_fps[(key, row_ns, fp)]
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
                            resolved_at, resolved_ts, namespace)
                           VALUES (?,?,?,?,?,?,?,NULL,NULL,?)""",
                        (new_id, a["key"], a["level"], a["msg"], a["section_id"],
                         now_str, now_ms, a["namespace"]),
                    )

            # (key, namespace)당 MAX_PER_KEY 초과분 삭제 (활성 여부와 관계없이 전체 대상)
            # namespace 단위로 스코프해야 한 테넌트의 알람 churn이 다른 테넌트의
            # 오래된 행(과 그에 연결된 alarm_user_state)을 밀어내지 않음
            all_groups = conn.execute("SELECT DISTINCT key, namespace FROM alarms").fetchall()
            for key, ns in all_groups:
                if ns is None:
                    cond, params = "key=? AND namespace IS NULL", (key,)
                else:
                    cond, params = "key=? AND namespace=?", (key, ns)
                excess = conn.execute(
                    f"""SELECT id FROM alarms WHERE {cond}
                       ORDER BY triggered_ts DESC LIMIT -1 OFFSET ?""",
                    params + (MAX_PER_KEY,),
                ).fetchall()
                for (eid,) in excess:
                    conn.execute("DELETE FROM alarms WHERE id=?", (eid,))
                    conn.execute("DELETE FROM alarm_user_state WHERE alarm_id=?", (eid,))

            conn.commit()
        finally:
            conn.close()


def get_active(filter_ns: str | None = None, user_email: str | None = None) -> list[dict]:
    """현재 활성 알람 반환 (summary alarms 필드 / AlarmBar용).

    filter_ns: None이면 admin 전체뷰(모든 namespace), 아니면 해당 namespace +
    전역(namespace IS NULL) 알람만 반환.
    user_email: alarm_user_state 조인 기준 - 사용자별 dismissed/seen/visited/toasted 상태.
    """
    with _lock:
        conn = sqlite3.connect(_DB_PATH)
        try:
            query = """
                SELECT a.id, a.key, a.level, a.msg, a.section_id, a.namespace,
                       s.dismissed_at, s.seen_at, s.visited_at, s.toasted_at
                FROM alarms a
                LEFT JOIN alarm_user_state s
                    ON s.alarm_id = a.id AND s.user_email = ?
                WHERE a.resolved_at IS NULL
            """
            params: list = [user_email]
            if filter_ns is not None:
                query += " AND (a.namespace IS NULL OR a.namespace = ?)"
                params.append(filter_ns)
            rows = conn.execute(query, params).fetchall()
        finally:
            conn.close()

    result = []
    for row_id, key, level, msg, section_id, namespace, dismissed_at, seen_at, visited_at, toasted_at in rows:
        target_path, _ = _KEY_META.get(key, ("/monitoring", section_id))
        result.append({
            "id": row_id,
            "key": key,
            "level": level,
            "msg": msg,
            "targetPath": target_path,
            "sectionId": section_id,
            "dismissed": dismissed_at is not None,
            "seen": seen_at is not None,
            "visited": visited_at is not None,
            "toasted": toasted_at is not None,
        })
    return result


_STATE_COLUMNS = {
    "dismiss": "dismissed_at",
    "seen": "seen_at",
    "visit": "visited_at",
    "toast": "toasted_at",
}


def set_alarm_state(user_email: str, alarm_ids: list[str], action: Literal["dismiss", "seen", "visit", "toast"]):
    """사용자별 알람 UI 상태 갱신 (dismiss/seen/visit/toast)."""
    col = _STATE_COLUMNS[action]
    now_str = _fmt_now()
    with _lock:
        conn = sqlite3.connect(_DB_PATH)
        try:
            for alarm_id in alarm_ids:
                conn.execute(
                    f"""INSERT INTO alarm_user_state (user_email, alarm_id, {col})
                        VALUES (?, ?, ?)
                        ON CONFLICT(user_email, alarm_id) DO UPDATE SET {col}=excluded.{col}""",
                    (user_email, alarm_id, now_str),
                )
            conn.commit()
        finally:
            conn.close()


async def update_alarms_async(data: dict, filter_ns: str | None = None):
    return await asyncio.to_thread(update_alarms, data, filter_ns)


async def get_active_async(filter_ns: str | None = None, user_email: str | None = None) -> list[dict]:
    return await asyncio.to_thread(get_active, filter_ns, user_email)


async def set_alarm_state_async(user_email: str, alarm_ids: list[str], action: Literal["dismiss", "seen", "visit", "toast"]):
    return await asyncio.to_thread(set_alarm_state, user_email, alarm_ids, action)


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
