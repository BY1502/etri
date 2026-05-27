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

function alarmKey(a: Alarm) {
  return a.msg;
}

// 컴포넌트 언마운트(페이지 이동)해도 유지되는 모듈 레벨 캐시
let _cachedAlarms: Alarm[] = [];

const DISMISSED_KEY = 'alarmbar-dismissed';
const VISITED_KEY = 'alarmbar-visited';
const SEEN_MSGS_KEY = 'alarmbar-seen-msgs';
const SEEN_KEYS_KEY = 'alarmbar-seen-keys';

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {
    // localStorage 비활성화 환경에서 무시
  }
}

// 사용자가 닫은 알람 키 - 해당 이슈가 해소됐다가 재발하면 다시 표시됨
const _dismissedKeys = loadSet(DISMISSED_KEY);

// 종 아이콘 열어서 본 알람 키 - 배지 0 처리 전용 (새로고침에도 유지)
const _seenKeys = loadSet(SEEN_KEYS_KEY);

// 알람 클릭해서 섹션 이동한 알람 키 - fade 스타일 전용 (새로고침에도 유지)
const _visitedKeys = loadSet(VISITED_KEY);

// 이미 토스트를 띄운 알람 키 - 새로고침 후 재발화 방지
const _seenMsgs = loadSet(SEEN_MSGS_KEY);

export default function AlarmBar() {
  const [alarms, setAlarms] = useState<Alarm[]>(_cachedAlarms);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [open, setOpen] = useState(false);
  const [, setVersion] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const prevMsgsRef = useRef<Set<string>>(_seenMsgs);
  const navigate = useNavigate();

  useEffect(() => {
    const poll = async () => {
      try {
        const resp = await fetch('/prediction-manager/api/monitoring/summary', {
          credentials: 'include',
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const next = (data.alarms ?? []) as Alarm[];
        _cachedAlarms = next;

        // 해소된 알람은 dismissed·seen 목록에서 제거 (재발 시 다시 표시되도록)
        const activeKeys = new Set(next.map(alarmKey));
        Array.from(_dismissedKeys).forEach((k) => {
          if (!activeKeys.has(k)) _dismissedKeys.delete(k);
        });
        Array.from(_seenKeys).forEach((k) => {
          if (!activeKeys.has(k)) _seenKeys.delete(k);
        });
        saveSet(SEEN_KEYS_KEY, _seenKeys);
        Array.from(_visitedKeys).forEach((k) => {
          if (!activeKeys.has(k)) _visitedKeys.delete(k);
        });
        saveSet(DISMISSED_KEY, _dismissedKeys);
        saveSet(VISITED_KEY, _visitedKeys);

        setAlarms(next);

        const newToasts = next
          .filter((a) => !prevMsgsRef.current.has(`${a.sectionId}-${a.level}`))
          .map((a) => ({ ...a, id: `${Date.now()}-${a.msg}` }));

        if (newToasts.length > 0) {
          scheduleToasts(newToasts);
        }
        prevMsgsRef.current.clear();
        next.forEach((a) =>
          prevMsgsRef.current.add(`${a.sectionId}-${a.level}`),
        );
        saveSet(SEEN_MSGS_KEY, prevMsgsRef.current);
      } catch {
        // 네트워크 오류 시 기존 상태 유지
      }
    };
    poll();
    const timer = setInterval(poll, 10_000);
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

  const visibleAlarms = alarms.filter((a) => !_dismissedKeys.has(alarmKey(a)));
  const unreadAlarms = visibleAlarms.filter((a) => !_seenKeys.has(alarmKey(a)));
  const criticalUnread = unreadAlarms.filter(
    (a) => a.level === 'critical',
  ).length;

  const handleBellClick = () => {
    const willOpen = !open;
    if (willOpen) {
      // 드롭다운 열릴 때 현재 visibleAlarms 전부 확인됨 처리
      visibleAlarms.forEach((a) => _seenKeys.add(alarmKey(a)));
      saveSet(SEEN_KEYS_KEY, _seenKeys);
      setVersion((n) => n + 1);
    }
    setOpen(willOpen);
  };

  const dismissAlarm = (alarm: Alarm) => {
    _dismissedKeys.add(alarmKey(alarm));
    _seenKeys.delete(alarmKey(alarm));
    saveSet(DISMISSED_KEY, _dismissedKeys);
    setVersion((n) => n + 1);
  };

  const dismissAll = () => {
    visibleAlarms.forEach((a) => {
      _dismissedKeys.add(alarmKey(a));
      _seenKeys.delete(alarmKey(a));
    });
    saveSet(DISMISSED_KEY, _dismissedKeys);
    setVersion((n) => n + 1);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const scheduleToasts = (next: Toast[]) => {
    setToasts((prev) => [...prev, ...next]);
    next.forEach((t) => {
      setTimeout(() => dismissToast(t.id), 4300);
    });
  };

  const handleToastClick = (toast: Toast) => {
    dismissToast(toast.id);
    navigate(`/predictor-creator-tool${toast.targetPath}`, {
      state: {
        scrollTo: toast.sectionId,
        alarmFilter: toast.sectionId.replace(/^section-/, ''),
      },
    });
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
                  <li key={alarm.msg}>
                    <button
                      type="button"
                      className={[
                        'alarmbar__item',
                        `alarmbar__item--${alarm.level}`,
                        _visitedKeys.has(alarmKey(alarm))
                          ? 'alarmbar__item--confirmed'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        _visitedKeys.add(alarmKey(alarm));
                        saveSet(VISITED_KEY, _visitedKeys);
                        setVersion((n) => n + 1);
                        navigate(`/predictor-creator-tool${alarm.targetPath}`, {
                          state: {
                            scrollTo: alarm.sectionId,
                            alarmFilter: alarm.sectionId.replace(
                              /^section-/,
                              '',
                            ),
                          },
                        });
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
