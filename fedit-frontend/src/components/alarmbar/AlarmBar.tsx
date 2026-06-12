import { ReactComponent as BellIcon } from 'assets/images/home/bell_icon_steelblue.svg';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AlarmBar.scss';

interface Alarm {
  id: string;
  level: 'critical' | 'warning';
  msg: string;
  targetPath: string;
  sectionId: string;
  dismissed: boolean;
  seen: boolean;
  visited: boolean;
  toasted: boolean;
}

interface Toast {
  toastId: string;
  alarm: Alarm;
}

function alarmKey(a: Alarm) {
  return a.id;
}

// 컴포넌트 언마운트(페이지 이동)해도 유지되는 모듈 레벨 캐시
let _cachedAlarms: Alarm[] = [];

function postAlarmState(
  alarmIds: string[],
  action: 'dismiss' | 'seen' | 'visit' | 'toast',
) {
  if (alarmIds.length === 0) return;
  fetch('/prediction-manager/api/monitoring/alarms/state', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alarm_ids: alarmIds, action }),
  }).catch(() => {});
}

export default function AlarmBar() {
  const [alarms, setAlarms] = useState<Alarm[]>(_cachedAlarms);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const navigate = useNavigate();

  const dismissToast = useCallback((toastId: string) => {
    const timer = toastTimersRef.current.get(toastId);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(toastId);
    }
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
  }, []);

  const scheduleToasts = useCallback(
    (newAlarms: Alarm[]) => {
      const next: Toast[] = newAlarms.map((alarm) => ({
        toastId: `${Date.now()}-${alarm.id}`,
        alarm,
      }));
      setToasts((prev) => {
        const combined = [...next, ...prev];
        // 5개 초과로 밀려난 토스트의 타이머 즉시 취소
        combined.slice(5).forEach((t) => {
          const existingTimer = toastTimersRef.current.get(t.toastId);
          if (existingTimer) {
            clearTimeout(existingTimer);
            toastTimersRef.current.delete(t.toastId);
          }
        });
        return combined.slice(0, 5);
      });
      // next가 5개를 초과하더라도 실제 표시된 것만 타이머 등록
      next.slice(0, 5).forEach((t) => {
        const timer = setTimeout(() => dismissToast(t.toastId), 4300);
        toastTimersRef.current.set(t.toastId, timer);
      });
    },
    [dismissToast],
  );

  useEffect(() => {
    const poll = async () => {
      try {
        const resp = await fetch('/prediction-manager/api/monitoring/summary', {
          credentials: 'include',
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const next = (data.alarms ?? []) as Alarm[];

        // 아직 토스트를 띄우지 않은(서버에 toasted=false) 활성 알람 → 토스트 표시
        const newToasts = next.filter((a) => !a.toasted && !a.dismissed);
        if (newToasts.length > 0) {
          newToasts.forEach((a) => {
            a.toasted = true;
          });
          postAlarmState(
            newToasts.map((a) => a.id),
            'toast',
          );
          scheduleToasts(newToasts);
        }

        _cachedAlarms = next;
        setAlarms(next);
      } catch {
        // 네트워크 오류 시 기존 상태 유지
      }
    };
    poll();
    const timer = setInterval(poll, 10_000);
    return () => {
      clearInterval(timer);
      toastTimersRef.current.forEach(clearTimeout);
    };
  }, [scheduleToasts]);

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

  // alarms state와 모듈 캐시(_cachedAlarms)를 함께 갱신하는 낙관적 업데이트 헬퍼
  const updateAlarms = (updater: (prev: Alarm[]) => Alarm[]) => {
    setAlarms((prev) => {
      const next = updater(prev);
      _cachedAlarms = next;
      return next;
    });
  };

  const visibleAlarms = alarms.filter((a) => !a.dismissed);
  const hiddenCount = alarms.filter((a) => a.dismissed).length;
  const unreadAlarms = visibleAlarms.filter((a) => !a.seen);
  const criticalUnread = unreadAlarms.filter(
    (a) => a.level === 'critical',
  ).length;

  const handleBellClick = () => {
    const willOpen = !open;
    if (willOpen) {
      // 드롭다운 열릴 때 현재 unreadAlarms 전부 확인됨 처리
      const ids = unreadAlarms.map((a) => a.id);
      if (ids.length > 0) {
        updateAlarms((prev) =>
          prev.map((a) => (ids.includes(a.id) ? { ...a, seen: true } : a)),
        );
        postAlarmState(ids, 'seen');
      }
    }
    setOpen(willOpen);
  };

  const dismissAlarm = (alarm: Alarm) => {
    updateAlarms((prev) =>
      prev.map((a) => (a.id === alarm.id ? { ...a, dismissed: true } : a)),
    );
    postAlarmState([alarm.id], 'dismiss');
  };

  const dismissAll = () => {
    const ids = visibleAlarms.map((a) => a.id);
    updateAlarms((prev) =>
      prev.map((a) => (ids.includes(a.id) ? { ...a, dismissed: true } : a)),
    );
    postAlarmState(ids, 'dismiss');
  };

  const visitAlarm = (alarm: Alarm) => {
    updateAlarms((prev) =>
      prev.map((a) => (a.id === alarm.id ? { ...a, visited: true } : a)),
    );
    postAlarmState([alarm.id], 'visit');
    navigate(`/predictor-creator-tool${alarm.targetPath}`, {
      state: {
        scrollTo: alarm.sectionId,
        alarmFilter: alarm.sectionId.replace(/^section-/, ''),
      },
    });
  };

  const handleToastClick = (toast: Toast) => {
    dismissToast(toast.toastId);
    visitAlarm(toast.alarm);
  };

  return (
    <>
      <div className="alarmbar" ref={wrapperRef}>
        <button
          className={`alarmbar__bell ${unreadAlarms.length > 0 ? 'alarmbar__bell--active' : ''}`}
          onClick={handleBellClick}
          title="알람"
        >
          <BellIcon className="alarmbar__bell-icon" />
          {unreadAlarms.length > 0 && (
            <span
              className={`alarmbar__badge ${
                criticalUnread > 0
                  ? 'alarmbar__badge--critical'
                  : 'alarmbar__badge--warning'
              }`}
            >
              {unreadAlarms.length}
            </span>
          )}
        </button>

        {open && (
          <div className="alarmbar__dropdown">
            <div className="alarmbar__dropdown-header">
              <span>알람 ({visibleAlarms.length})</span>
              {visibleAlarms.length > 0 && (
                <button
                  type="button"
                  className="alarmbar__dismiss-all"
                  onClick={dismissAll}
                >
                  모두 닫기
                </button>
              )}
            </div>
            {visibleAlarms.length === 0 ? (
              <div className="alarmbar__empty">현재 알람이 없습니다.</div>
            ) : (
              <ul className="alarmbar__list">
                {visibleAlarms.map((alarm) => (
                  <li key={alarmKey(alarm)}>
                    <div
                      role="button"
                      tabIndex={0}
                      className={[
                        'alarmbar__item',
                        `alarmbar__item--${alarm.level}`,
                        alarm.visited ? 'alarmbar__item--confirmed' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => visitAlarm(alarm)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          visitAlarm(alarm);
                        }
                      }}
                    >
                      <span
                        className={`alarmbar__dot alarmbar__dot--${alarm.level}`}
                      />
                      <span className="alarmbar__msg">{alarm.msg}</span>
                      <button
                        type="button"
                        className="alarmbar__item-close"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissAlarm(alarm);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {hiddenCount > 0 && (
              <div className="alarmbar__hidden-hint">
                {hiddenCount}개 항목을 숨겼습니다
              </div>
            )}
          </div>
        )}
      </div>

      {/* 웹 푸시 알람 스택 */}
      <div className="alarmbar__toasts">
        {toasts.map((toast) => (
          <div
            key={toast.toastId}
            className={`alarmbar__toast alarmbar__toast--${toast.alarm.level}`}
            role="alert"
            onClick={() => handleToastClick(toast)}
          >
            <div className="alarmbar__toast-header">
              <span className="alarmbar__toast-title">
                {toast.alarm.level === 'critical' ? '🔴 긴급 알람' : '🟡 경고'}
              </span>
              <button
                className="alarmbar__toast-close"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissToast(toast.toastId);
                }}
              >
                ✕
              </button>
            </div>
            <p className="alarmbar__toast-msg">{toast.alarm.msg}</p>
            <span className="alarmbar__toast-hint">
              클릭하여 해당 섹션으로 이동 →
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
