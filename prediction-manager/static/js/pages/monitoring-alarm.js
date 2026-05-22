// ── 알람 전역 상태 ────────────────────────────────────────────────────────────
const _alarmHistory      = [];
const _collapsedSections = new Set();
const _allItemsSections  = new Set();
let   _activeFilter      = 'all';
let   _activeStatus      = 'all';

const MAX_HISTORY_PER_KEY = 10;
const PREVIEW_COUNT       = 2;

const _ZONE = {
    'chart-gpu-util': { warn: 70, danger: 85 },
    'chart-gpu-mem':  { warn: 80, danger: 90 },
    'chart-cpu':      { warn: 70, danger: 80 },
    'chart-mem':      { warn: 75, danger: 85 },
};
const _statusColor = (id, pct) => {
    const z = _ZONE[id] || { warn: 75, danger: 90 };
    return (pct ?? 0) > z.danger ? '#EF4444' : (pct ?? 0) > z.warn ? '#F59E0B' : '#1DB877';
};

function _fmtNow() {
    return new Date().toLocaleString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).replace(/\. /g, '-').replace('.', '');
}

function _fmtDuration(ms) {
    const min = Math.round(ms / 60000);
    if (min < 1)  return '1분 미만';
    if (min < 60) return `${min}분`;
    const h = Math.floor(min / 60), m = min % 60;
    return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

// ── 알람 감지 및 이력 관리 ───────────────────────────────────────────────────
function updateAlarmIndicators(data) {
    const CHECKS = [
        {
            key: 'gpu',
            check: (d) => {
                const msgs = [];
                if (d.gpu?.status === 'error' || d.system?.status === 'error') msgs.push('모니터링 데이터 수집 실패');
                if (d.gpu?.status === 'ok') {
                    if (d.gpu.util_pct > 85) msgs.push(`GPU 사용률이 너무 높습니다 (${d.gpu.util_pct}%)`);
                    else if (d.gpu.util_pct > 70) msgs.push(`GPU 사용률이 높습니다 (${d.gpu.util_pct}%)`);
                    if (d.gpu.mem_pct > 90) msgs.push(`GPU 메모리가 부족합니다 (${d.gpu.mem_pct}%)`);
                    else if (d.gpu.mem_pct > 80) msgs.push(`GPU 메모리 사용량이 높습니다 (${d.gpu.mem_pct}%)`);
                }
                return msgs;
            },
        },
        {
            key: 'system',
            check: (d) => {
                const msgs = [];
                if (d.system?.status === 'ok') {
                    if (d.system.cpu_pct > 80) msgs.push(`CPU 사용률이 높습니다 (${d.system.cpu_pct}%)`);
                    if (d.system.mem_pct > 85) msgs.push(`시스템 메모리 부족 (${d.system.mem_pct}%)`);
                }
                return msgs;
            },
        },
        {
            key: 'gpu-temp',
            check: (d) => {
                const msgs = [];
                if (d.gpu?.status === 'ok' && d.gpu.temp_c > 85) msgs.push(`GPU 온도 과열 (${d.gpu.temp_c}°C)`);
                return msgs;
            },
        },
        {
            key: 'kserve',
            check: (d) => {
                const msgs = [];
                if (!d.kserve?.error) {
                    (d.kserve?.endpoints ?? []).forEach(ep => {
                        if (!ep.ready) msgs.push(`엔드포인트 비정상: ${ep.name}`);
                    });
                }
                return msgs;
            },
        },
        {
            key: 'kserve-error',
            check: (d) => {
                const msgs = [];
                if (d.kserve_error_rate?.status === 'ok') {
                    (d.kserve_error_rate.models ?? []).forEach(m => {
                        if (m.error_rate > 5) msgs.push(`KServe 에러율 높음: ${m.name} (${m.error_rate.toFixed(1)}%)`);
                    });
                }
                return msgs;
            },
        },
        {
            key: 'kserve-latency',
            check: (d) => {
                const msgs = [];
                if (d.kserve_top5_latency?.status === 'ok') {
                    (d.kserve_top5_latency.models ?? []).forEach(m => {
                        if (m.latency_ms > 1000) msgs.push(`응답 지연: ${m.name} (${Math.round(m.latency_ms)}ms)`);
                    });
                }
                return msgs;
            },
        },
        {
            key: 'automl',
            check: (d) => {
                const msgs = [];
                if (!d.automl?.error) {
                    (d.automl?.jobs ?? []).forEach(j => {
                        if (j.status === 'FAILED') msgs.push(`AutoML 작업 실패: ${j.name}`);
                    });
                }
                return msgs;
            },
        },
        {
            key: 'pvc',
            check: (d) => {
                const msgs = [];
                if (d.pvc?.status === 'ok') {
                    (d.pvc.groups ?? []).forEach(g => {
                        if ((g.phase_counts?.Lost ?? 0) > 0) msgs.push(`PVC 볼륨 손상 감지: ${g.ns}`);
                    });
                }
                return msgs;
            },
        },
    ];

    CHECKS.forEach(({ key, check }) => {
        const indId        = `alarm-ind-${key}`;
        const activeAlarms = check(data);
        const indEl        = document.getElementById(indId);

        if (activeAlarms.length > 0) {
            activeAlarms.forEach(msg => {
                const existing = _alarmHistory.find(h => h.key === indId && h.msg === msg && !h.resolvedAt);
                if (!existing) {
                    _alarmHistory.push({
                        id:          `${indId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                        key:         indId,
                        msg,
                        triggeredAt: _fmtNow(),
                        triggeredTs: Date.now(),
                        resolvedAt:  null,
                        resolvedTs:  null,
                    });
                    const keyHistory = _alarmHistory.filter(h => h.key === indId);
                    if (keyHistory.length > MAX_HISTORY_PER_KEY) {
                        _alarmHistory.splice(_alarmHistory.indexOf(keyHistory[0]), 1);
                    }
                }
            });
            if (indEl) {
                indEl.style.display = 'inline-flex';
                indEl.querySelector('[data-tip]').setAttribute('data-tip', activeAlarms.join('\n'));
            }
        } else {
            _alarmHistory
                .filter(h => h.key === indId && !h.resolvedAt)
                .forEach(h => { h.resolvedAt = _fmtNow(); h.resolvedTs = Date.now(); });
            if (indEl) indEl.style.display = 'none';
        }
    });

    _updateAlarmBadge();
}

function setupAlarmHistoryCards() {
    _updateAlarmBadge();
}

// ── 알람 사이드바 ─────────────────────────────────────────────────────────────
const _ALARM_SECTIONS = [
    { key: 'gpu',            label: 'GPU' },
    { key: 'system',         label: '시스템' },
    { key: 'gpu-temp',       label: 'GPU 온도' },
    { key: 'pvc',            label: 'PVC' },
    { key: 'automl',         label: 'AutoML 최근 Job', breakBefore: true },
    { key: 'kserve',         label: 'KServe Endpoint' },
    { key: 'kserve-latency', label: 'KServe 지연',     breakBefore: true },
    { key: 'kserve-error',   label: 'KServe 에러율' },
];

function _renderAlarmSidebar() {
    const body = document.getElementById('pm-alarm-sidebar-body');
    if (!body) return;

    const visibleSections = _activeFilter === 'all'
        ? _ALARM_SECTIONS
        : _ALARM_SECTIONS.filter(s => s.key === _activeFilter);

    // ── 칩 필터 ──────────────────────────────────────────────────────────────
    const chipsHtml = `
        <div class="pm-alarm-chips-wrap">
            <div class="pm-alarm-chips-row">
                <span class="pm-alarm-chips-label">카테고리</span>
                <div class="pm-alarm-chips">
                    <button class="pm-alarm-chip${_activeFilter === 'all' ? ' active' : ''}"
                        onclick="window._setAlarmFilter('all')">전체</button>
                    ${_ALARM_SECTIONS.map(s => `
                        ${s.breakBefore ? '<div class="pm-alarm-chip-break"></div>' : ''}
                        <button class="pm-alarm-chip${_activeFilter === s.key ? ' active' : ''}"
                            onclick="window._setAlarmFilter('${s.key}')">${s.label}</button>
                    `).join('')}
                </div>
            </div>
            <div class="pm-alarm-chips-row">
                <span class="pm-alarm-chips-label">상태</span>
                <div class="pm-alarm-chips pm-alarm-chips--status">
                    <button class="pm-alarm-chip pm-alarm-chip--status${_activeStatus === 'all' ? ' active' : ''}"
                        onclick="window._setAlarmStatus('all')">전체</button>
                    <button class="pm-alarm-chip pm-alarm-chip--status${_activeStatus === 'active' ? ' active' : ''}"
                        onclick="window._setAlarmStatus('active')">진행중</button>
                    <button class="pm-alarm-chip pm-alarm-chip--status${_activeStatus === 'resolved' ? ' active' : ''}"
                        onclick="window._setAlarmStatus('resolved')">해소됨</button>
                </div>
            </div>
        </div>`;

    // ── 섹션 목록 ─────────────────────────────────────────────────────────────
    const sectionsHtml = visibleSections.map(({ key, label }) => {
        const indId      = `alarm-ind-${key}`;
        const history    = _alarmHistory.filter(h => {
            if (h.key !== indId) return false;
            if (_activeStatus === 'active')   return !h.resolvedAt;
            if (_activeStatus === 'resolved') return !!h.resolvedAt;
            return true;
        });
        const active     = history.filter(h => !h.resolvedAt).length;
        const hasAlarm   = active > 0;
        const isOpen     = !_collapsedSections.has(key);
        const showAll    = _allItemsSections.has(key);
        const displayed  = showAll ? history.slice().reverse() : history.slice().reverse().slice(0, PREVIEW_COUNT);
        const remaining  = history.length - PREVIEW_COUNT;
        const dotColor   = hasAlarm ? '#ef4444' : '#d1d5db';

        const itemsHtml = history.length === 0
            ? `<div class="pm-alarm-empty">이력 없음</div>`
            : displayed.map(h => {
                const duration = h.resolvedTs ? _fmtDuration(h.resolvedTs - h.triggeredTs) : null;
                const timeline = h.resolvedAt
                    ? `발생: ${h.triggeredAt} &nbsp;→&nbsp; 해소: ${h.resolvedAt} (지속 ${duration})`
                    : `발생: ${h.triggeredAt}`;
                const safeMsg = h.msg
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `
                <div class="pm-alarm-item">
                    <div class="pm-alarm-item-status ${h.resolvedAt ? 'resolved' : 'active'}">
                        <span class="pm-alarm-status-dot"></span>
                        ${h.resolvedAt ? '해소됨' : '진행중'}
                    </div>
                    <div class="pm-alarm-item-msg">${safeMsg}</div>
                    <div class="pm-alarm-item-time">${timeline}</div>
                </div>`;
            }).join('')
            + (!showAll && remaining > 0 ? `
                <button class="pm-alarm-more-btn"
                    onclick="window._expandSection('${key}')">더보기 (${remaining}건 더)</button>
            ` : '');

        return `
        <div class="pm-alarm-section">
            <div class="pm-alarm-section-header" onclick="window._toggleSection('${key}')">
                <div class="pm-alarm-section-title">${label}</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="pm-alarm-section-count${hasAlarm ? ' has-alarm' : ''}">${history.length}건</span>
                    <span class="pm-alarm-section-arrow${isOpen ? ' open' : ''}">▾</span>
                </div>
            </div>
            <div class="pm-alarm-section-items${isOpen ? ' open' : ''}">${itemsHtml}</div>
        </div>`;
    }).join('');

    body.innerHTML = chipsHtml + sectionsHtml;
}

function _updateAlarmBadge() {
    const badge = document.getElementById('pm-alarm-badge');
    const btn   = document.getElementById('pm-alarm-btn');
    if (!badge) return;
    const total = _alarmHistory.filter(h => !h.resolvedAt).length;
    badge.textContent   = total > 99 ? '99+' : total;
    badge.style.display = total > 0 ? 'flex' : 'none';
    if (btn) btn.classList.toggle('active', total > 0);
}

// ── 전역 인터랙션 핸들러 ──────────────────────────────────────────────────────
window._openAlarmSidebar = function () {
    _renderAlarmSidebar();
    document.getElementById('pm-alarm-sidebar')?.classList.add('open');
    document.getElementById('pm-alarm-overlay')?.classList.add('open');
};

window._closeAlarmSidebar = function () {
    document.getElementById('pm-alarm-sidebar')?.classList.remove('open');
    document.getElementById('pm-alarm-overlay')?.classList.remove('open');
};

window._setAlarmFilter = function (key) {
    _activeFilter = key;
    _renderAlarmSidebar();
};

window._setAlarmStatus = function (status) {
    _activeStatus = status;
    _renderAlarmSidebar();
};

window._toggleSection = function (key) {
    if (_collapsedSections.has(key)) _collapsedSections.delete(key);
    else _collapsedSections.add(key);
    _renderAlarmSidebar();
};

window._expandSection = function (key) {
    _allItemsSections.add(key);
    _renderAlarmSidebar();
};