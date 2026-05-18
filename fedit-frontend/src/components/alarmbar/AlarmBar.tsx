import { ReactComponent as BellIcon } from 'assets/images/home/bell_icon_steelblue.svg';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AlarmBar.scss';

interface Alarm {
  level: 'critical' | 'warning';
  msg: string;
  targetPath: string;
  sectionId: string;
}

interface Toast extends Alarm {
  id: string;
}

function evalAlarms(data: any): Alarm[] {
  const alarms: Alarm[] = [];

  // 모니터링 수집 오류
  if (data.gpu?.status === 'error' || data.system?.status === 'error') {
    alarms.push({
      level: 'critical',
      msg: '모니터링 데이터 수집 실패',
      targetPath: '/monitoring',
      sectionId: 'section-gpu',
    });
  }

  // GPU
  if (data.gpu?.status === 'ok') {
    if (data.gpu.util_pct > 85) {
      alarms.push({
        level: 'critical',
        msg: `GPU 사용률이 너무 높습니다 (${data.gpu.util_pct}%)`,
        targetPath: '/monitoring',
        sectionId: 'section-gpu',
      });
    } else if (data.gpu.util_pct > 70) {
      alarms.push({
        level: 'warning',
        msg: `GPU 사용률이 높습니다 (${data.gpu.util_pct}%)`,
        targetPath: '/monitoring',
        sectionId: 'section-gpu',
      });
    }
    if (data.gpu.mem_pct > 90) {
      alarms.push({
        level: 'critical',
        msg: `GPU 메모리가 부족합니다 (${data.gpu.mem_pct}%)`,
        targetPath: '/monitoring',
        sectionId: 'section-gpu',
      });
    } else if (data.gpu.mem_pct > 80) {
      alarms.push({
        level: 'warning',
        msg: `GPU 메모리 사용량이 높습니다 (${data.gpu.mem_pct}%)`,
        targetPath: '/monitoring',
        sectionId: 'section-gpu',
      });
    }
    if (data.gpu.temp_c > 80) {
      alarms.push({
        level: 'critical',
        msg: `GPU 온도 과열 (${data.gpu.temp_c}°C)`,
        targetPath: '/monitoring',
        sectionId: 'section-gpu',
      });
    }
  }

  // 시스템 CPU·메모리
  if (data.system?.status === 'ok') {
    if (data.system.cpu_pct > 80) {
      alarms.push({
        level: 'warning',
        msg: `CPU 사용률이 높습니다 (${data.system.cpu_pct}%)`,
        targetPath: '/monitoring',
        sectionId: 'section-gpu',
      });
    }
    if (data.system.mem_pct > 85) {
      alarms.push({
        level: 'warning',
        msg: `시스템 메모리 부족 (${data.system.mem_pct}%)`,
        targetPath: '/monitoring',
        sectionId: 'section-gpu',
      });
    }
  }

  // KServe 엔드포인트 비정상
  if (!data.kserve?.error) {
    (data.kserve?.endpoints ?? []).forEach((ep: any) => {
      if (!ep.ready) {
        alarms.push({
          level: 'warning',
          msg: `엔드포인트 비정상: ${ep.name}`,
          targetPath: '/monitoring',
          sectionId: 'section-kserve',
        });
      }
    });
  }

  // KServe 에러율
  if (data.kserve_error_rate?.status === 'ok') {
    (data.kserve_error_rate.models ?? []).forEach((m: any) => {
      if (m.error_rate > 5) {
        alarms.push({
          level: 'critical',
          msg: `KServe 에러율 높음: ${m.name} (${m.error_rate.toFixed(1)}%)`,
          targetPath: '/monitoring',
          sectionId: 'section-kserve',
        });
      }
    });
  }

  // KServe latency
  if (data.kserve_top5_latency?.status === 'ok') {
    (data.kserve_top5_latency.models ?? []).forEach((m: any) => {
      if (m.latency_ms > 1000) {
        alarms.push({
          level: 'warning',
          msg: `응답 지연 감지: ${m.name} (${Math.round(m.latency_ms)}ms)`,
          targetPath: '/monitoring',
          sectionId: 'section-kserve',
        });
      }
    });
  }

  // AutoML 실패
  if (!data.automl?.error) {
    (data.automl?.jobs ?? []).forEach((job: any) => {
      if (job.status === 'FAILED') {
        alarms.push({
          level: 'warning',
          msg: `AutoML 작업 실패: ${job.name}`,
          targetPath: '/monitoring',
          sectionId: 'section-automl',
        });
      }
    });
  }

  // PVC Lost
  if (data.pvc?.status === 'ok') {
    (data.pvc.groups ?? []).forEach((g: any) => {
      if ((g.phase_counts?.Lost ?? 0) > 0) {
        alarms.push({
          level: 'critical',
          msg: `PVC 볼륨 손상 감지: ${g.ns}`,
          targetPath: '/monitoring',
          sectionId: 'section-pvc',
        });
      }
    });
  }

  return alarms;
}

const DEV_MOCK_SUMMARY = {
  gpu: { status: 'ok', util_pct: 91, mem_pct: 92, temp_c: 83, power_w: 280 },
  system: { status: 'ok', cpu_pct: 85, mem_pct: 87 },
  kserve: {
    error: false,
    endpoints: [{ name: 'sentiment-model', namespace: 'ns', ready: false }],
  },
  kserve_error_rate: {
    status: 'ok',
    models: [{ name: 'sentiment-model (ns)', error_rate: 6.2 }],
  },
  kserve_top5_latency: {
    status: 'ok',
    models: [{ name: 'sentiment-model (ns)', latency_ms: 1840 }],
  },
  automl: {
    error: false,
    jobs: [{ name: 'rf-baseline', status: 'FAILED' }],
  },
  pvc: {
    status: 'ok',
    groups: [
      {
        ns: 'kubeflow-researcher1',
        pvcs: [],
        total_gb: 31,
        phase_counts: { Bound: 3, Pending: 0, Lost: 1 },
      },
    ],
  },
};

// 컴포넌트 언마운트(페이지 이동)해도 유지되는 모듈 레벨 캐시
let _cachedAlarms: Alarm[] = [];
const _activeMsgs = new Set<string>();

export default function AlarmBar() {
  const [alarms, setAlarms] = useState<Alarm[]>(_cachedAlarms);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const prevMsgsRef = useRef<Set<string>>(_activeMsgs);
  const navigate = useNavigate();

  useEffect(() => {
    const poll = async () => {
      try {
        const resp = await fetch('/prediction-manager/api/monitoring/summary', {
          credentials: 'include',
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const next = evalAlarms(data);
        _cachedAlarms = next;
        setAlarms(next);

        const newToasts = next
          .filter((a) => !prevMsgsRef.current.has(a.msg))
          .map((a) => ({ ...a, id: `${Date.now()}-${a.msg}` }));

        if (newToasts.length > 0) {
          scheduleToasts(newToasts);
        }
        prevMsgsRef.current.clear();
        next.forEach((a) => prevMsgsRef.current.add(a.msg));
      } catch {
        // 네트워크 오류 시 기존 상태 유지
      }
    };
    poll();
    const timer = setInterval(poll, 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const scheduleToasts = (next: Toast[]) => {
    setToasts((prev) => [...prev, ...next]);
    next.forEach((t) => {
      setTimeout(() => dismissToast(t.id), 4000);
    });
  };

  const handleToastClick = (toast: Toast) => {
    dismissToast(toast.id);
    navigate(`/predictor-creator-tool${toast.targetPath}`, {
      state: { scrollTo: toast.sectionId },
    });
  };

  const fireTestAlarms = () => {
    const evaluated = evalAlarms(DEV_MOCK_SUMMARY);
    const ts = Date.now();
    const mockToasts = evaluated.map((a, i) => ({ ...a, id: `${ts}-${i}` }));
    _cachedAlarms = evaluated;
    setAlarms(evaluated);
    scheduleToasts(mockToasts);
    prevMsgsRef.current.clear();
    evaluated.forEach((a) => prevMsgsRef.current.add(a.msg));
  };

  const criticalCount = alarms.filter((a) => a.level === 'critical').length;

  return (
    <>
      <div className="alarmbar" ref={wrapperRef}>
        {process.env.NODE_ENV === 'development' && (
          <button className="alarmbar__dev-btn" onClick={fireTestAlarms}>
            🧪 테스트
          </button>
        )}
        <button
          className={`alarmbar__bell ${alarms.length > 0 ? 'alarmbar__bell--active' : ''}`}
          onClick={() => setOpen((o) => !o)}
          title="알람"
        >
          <BellIcon className="alarmbar__bell-icon" />
          {alarms.length > 0 && (
            <span
              className={`alarmbar__badge ${
                criticalCount > 0
                  ? 'alarmbar__badge--critical'
                  : 'alarmbar__badge--warning'
              }`}
            >
              {alarms.length}
            </span>
          )}
        </button>

        {open && (
          <div className="alarmbar__dropdown">
            <div className="alarmbar__dropdown-header">
              <span>알람 ({alarms.length})</span>
              <button
                className="alarmbar__clear-btn"
                onClick={() => setAlarms([])}
              >
                모두 닫기
              </button>
            </div>
            {alarms.length === 0 ? (
              <div className="alarmbar__empty">현재 알람이 없습니다.</div>
            ) : (
              <ul className="alarmbar__list">
                {alarms.map((alarm, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <li key={`${alarm.level}-${i}`}>
                    <button
                      type="button"
                      className={`alarmbar__item alarmbar__item--${alarm.level}`}
                      onClick={() =>
                        navigate(`/predictor-creator-tool${alarm.targetPath}`, {
                          state: { scrollTo: alarm.sectionId },
                        })
                      }
                    >
                      <span className="alarmbar__dot" />
                      <span className="alarmbar__msg">{alarm.msg}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 웹 푸시 알람 스택 */}
      <div className="alarmbar__toasts">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`alarmbar__toast alarmbar__toast--${toast.level}`}
            role="button"
            tabIndex={0}
            onClick={() => handleToastClick(toast)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleToastClick(toast);
            }}
          >
            <div className="alarmbar__toast-header">
              <span className="alarmbar__toast-title">
                {toast.level === 'critical' ? '🔴 긴급 알람' : '🟡 경고'}
              </span>
              <button
                className="alarmbar__toast-close"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissToast(toast.id);
                }}
              >
                ✕
              </button>
            </div>
            <p className="alarmbar__toast-msg">{toast.msg}</p>
            <span className="alarmbar__toast-hint">
              클릭하여 해당 섹션으로 이동 →
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
