// ── 알람 전역 상태 ────────────────────────────────────────────────────────────
let _activeAlarms = []; // 현재 활성 알람 (updateAlarmIndicators가 채움)
let _cachedHistory = null; // 마지막으로 fetch한 이력 — 사이드바 즉시 렌더용
const _collapsedSections = new Set();

let _activeFilter = "all";
let _activeStatus = "all";

const PREVIEW_COUNT = 2;

const _ZONE = {
  "chart-gpu-util": { warn: 70, danger: 85 },
  "chart-gpu-mem": { warn: 80, danger: 90 },
  "chart-cpu": { warn: 70, danger: 80 },
  "chart-mem": { warn: 75, danger: 85 },
};
const _statusColor = (id, pct) => {
  const z = _ZONE[id] || { warn: 75, danger: 90 };
  return (pct ?? 0) > z.danger
    ? "#EF4444"
    : (pct ?? 0) > z.warn
      ? "#F59E0B"
      : "#1DB877";
};

function _fmtRelTime(isoStr) {
  if (!isoStr) return "";
  const diff = Date.now() - new Date(isoStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function _fmtDuration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return "1분 미만";
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60),
    m = min % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

// ── 알람 인디케이터 업데이트 ──────────────────────────────────────────────────
function updateAlarmIndicators(data) {
  _activeAlarms = data.alarms ?? [];

  // 모든 인디케이터 먼저 숨김
  _ALARM_SECTIONS.forEach(({ key }) => {
    const el = document.getElementById(`alarm-ind-${key}`);
    if (el) el.style.display = "none";
  });

  // 활성 알람으로 인디케이터 표시
  const byKey = {};
  _activeAlarms.forEach((a) => {
    if (!byKey[a.key]) byKey[a.key] = [];
    byKey[a.key].push(a.msg);
  });
  Object.entries(byKey).forEach(([key, msgs]) => {
    const el = document.getElementById(`alarm-ind-${key}`);
    if (el) {
      el.style.display = "inline-flex";
      el.querySelector("[data-tip]")?.setAttribute("data-tip", msgs.join("\n"));
    }
  });

  _updateAlarmBadge();
  _prefetchHistory();
}

function setupAlarmHistoryCards() {
  _updateAlarmBadge();
}

// ── 알람 사이드바 ─────────────────────────────────────────────────────────────
const _ALARM_SECTIONS = [
  { key: "gpu", label: "GPU" },
  { key: "system", label: "시스템" },
  { key: "gpu-temp", label: "GPU 온도" },
  { key: "pvc", label: "PVC" },
  { key: "automl", label: "AutoML 최근 Job" },
  { key: "kserve", label: "KServe Endpoint" },
  { key: "kserve-latency", label: "KServe 지연" },
  { key: "kserve-error", label: "KServe 에러율" },
];

function _renderAlarmSidebar(historyData) {
  const body = document.getElementById("pm-alarm-sidebar-body");
  if (!body) return;

  const activeKeys = new Set(_activeAlarms.map((a) => a.key));
  const visibleSections =
    _activeFilter === "all"
      ? _ALARM_SECTIONS
      : _ALARM_SECTIONS.filter((s) => s.key === _activeFilter);

  // ── 칩 필터 ──────────────────────────────────────────────────────────────
  const chipsHtml = `
        <div class="pm-alarm-chips-wrap">
            <div class="pm-alarm-chips-row">
                <span class="pm-alarm-chips-label">카테고리</span>
                <div class="pm-alarm-chips">
                    <button class="pm-alarm-chip${_activeFilter === "all" ? " active" : ""}"
                        onclick="window._setAlarmFilter('all')">전체</button>
                    ${_ALARM_SECTIONS
                      .map(
                        (s) => `
                        <button class="pm-alarm-chip${_activeFilter === s.key ? " active" : ""}${activeKeys.has(s.key) ? " has-active" : ""}"
                            onclick="window._setAlarmFilter('${s.key}')">${s.label}</button>
                    `,
                      )
                      .join("")}
                </div>
            </div>
            <div class="pm-alarm-chips-row">
                <span class="pm-alarm-chips-label">상태</span>
                <div class="pm-alarm-chips pm-alarm-chips--status">
                    <button class="pm-alarm-chip pm-alarm-chip--status${_activeStatus === "all" ? " active" : ""}"
                        onclick="window._setAlarmStatus('all')">전체</button>
                    <button class="pm-alarm-chip pm-alarm-chip--status${_activeStatus === "active" ? " active" : ""}"
                        onclick="window._setAlarmStatus('active')">진행중</button>
                    <button class="pm-alarm-chip pm-alarm-chip--status${_activeStatus === "resolved" ? " active" : ""}"
                        onclick="window._setAlarmStatus('resolved')">해소됨</button>
                </div>
            </div>
        </div>`;

  // ── 전체 정상 배너 (활성 알람 없고 해소됨 필터가 아닐 때) ──────────────────
  const okBanner =
    _activeAlarms.length === 0 && _activeStatus !== "resolved"
      ? `<div class="pm-alarm-ok-banner"><span>✓</span>현재 이상 없음</div>`
      : "";

  // ── 섹션 목록 ─────────────────────────────────────────────────────────────
  const sectionsHtml = visibleSections
    .map(({ key, label }) => {
      const history = historyData.filter((h) => {
        if (h.key !== key) return false;
        if (_activeStatus === "active") return !h.resolved_at;
        if (_activeStatus === "resolved") return !!h.resolved_at;
        return true;
      });
      if (_activeFilter === "all" && history.length === 0) return "";
      const active = history.filter((h) => !h.resolved_at).length;
      const isOpen = _activeFilter !== "all" || !_collapsedSections.has(key);
      const showAll = _activeFilter !== "all";
      const displayed = showAll ? history : history.slice(0, PREVIEW_COUNT);
      const remaining = history.length - PREVIEW_COUNT;

      const itemsHtml =
        history.length === 0
          ? `<div class="pm-alarm-empty">이력 없음</div>`
          : displayed
              .map((h) => {
                const duration = h.resolved_ts
                  ? _fmtDuration(h.resolved_ts - h.triggered_ts)
                  : null;
                const relTrig = _fmtRelTime(h.triggered_at);
                const relRes = h.resolved_at
                  ? _fmtRelTime(h.resolved_at)
                  : null;
                const timeline = h.resolved_at
                  ? `발생 ${relTrig} &nbsp;→&nbsp; 해소 ${relRes} (지속 ${duration})`
                  : `발생 ${relTrig}`;
                const fullTime = h.resolved_at
                  ? `${h.triggered_at} → ${h.resolved_at}`
                  : h.triggered_at;
                const safeMsg = h.msg
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;");
                return `
                <div class="pm-alarm-item clickable" onclick="window._navToSection('${h.section_id}')" title="${fullTime}">
                    <div class="pm-alarm-item-status ${h.resolved_at ? "resolved" : "active"}">
                        <span class="pm-alarm-status-dot"></span>
                        ${h.resolved_at ? "해소됨" : "진행중"}
                    </div>
                    <div class="pm-alarm-item-msg">${safeMsg}</div>
                    <div class="pm-alarm-item-time">${timeline}</div>
                    <div class="pm-alarm-item-nav-hint">클릭하여 해당 섹션으로 이동 →</div>
                </div>`;
              })
              .join("") +
            (!showAll && remaining > 0
              ? `<button class="pm-alarm-more-btn" onclick="window._setAlarmFilter('${key}')">${label} 전체 보기</button>`
              : "");

      return `
        <div class="pm-alarm-section">
            <div class="pm-alarm-section-header"${_activeFilter === "all" ? ` onclick="window._toggleSection('${key}')"` : ' style="cursor:default"'}>
                <div class="pm-alarm-section-title">${label}</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    ${active > 0 ? `<span class="pm-alarm-section-dot" style="background:#ef4444;"></span>` : ""}
                    ${_activeFilter === "all" ? `<img src="static/icons/${isOpen ? "chevron-up" : "chevron-down"}.svg" width="16" height="16" style="display:block; opacity:0.45;">` : ""}
                </div>
            </div>
            <div class="pm-alarm-section-items${isOpen ? " open" : ""}">${itemsHtml}</div>
        </div>`;
    })
    .join("");

  body.innerHTML = chipsHtml + okBanner + sectionsHtml;
}

function _updateAlarmBadge() {
  const badge = document.getElementById("pm-alarm-badge");
  const btn = document.getElementById("pm-alarm-btn");
  if (!badge) return;
  const total = _activeAlarms.length;
  badge.textContent = total > 99 ? "99+" : String(total);
  badge.style.display = total > 0 ? "flex" : "none";
  if (btn) btn.classList.toggle("active", total > 0);
}

// ── 이력 fetch & 렌더 ─────────────────────────────────────────────────────────
async function _fetchAndRenderHistory() {
  const body = document.getElementById("pm-alarm-sidebar-body");
  if (!body) return;

  // 캐시가 있으면 즉시 렌더, 없으면 로딩 표시
  if (_cachedHistory !== null) {
    _renderAlarmSidebar(_cachedHistory);
  } else {
    body.innerHTML = '<div class="pm-alarm-loading">불러오는 중...</div>';
  }

  // 백그라운드에서 최신 데이터로 갱신
  try {
    const data = await API.get("/api/monitoring/alarms/history");
    _cachedHistory = data;
    _renderAlarmSidebar(data);
  } catch {
    if (_cachedHistory === null) {
      body.innerHTML =
        '<div class="pm-alarm-empty">이력을 불러오지 못했습니다.</div>';
    }
  }
}

async function _prefetchHistory() {
  try {
    _cachedHistory = await API.get("/api/monitoring/alarms/history");
    if (
      document.getElementById("pm-alarm-sidebar")?.classList.contains("open")
    ) {
      _renderAlarmSidebar(_cachedHistory);
    }
  } catch {
    // 실패해도 기존 캐시 유지
  }
}

// ── 전역 인터랙션 핸들러 ──────────────────────────────────────────────────────
window._openAlarmSidebar = function () {
  document.getElementById("pm-alarm-sidebar")?.classList.add("open");
  document.getElementById("pm-alarm-overlay")?.classList.add("open");
  const btn = document.getElementById("pm-alarm-btn");
  if (btn) {
    btn.style.right = "380px";
    btn.style.borderRadius = "14px 0 0 14px";
    btn.style.boxShadow = "0 2px 8px rgba(59,130,246,0.08)";
  }
  _fetchAndRenderHistory();
};

window._closeAlarmSidebar = function () {
  document.getElementById("pm-alarm-sidebar")?.classList.remove("open");
  document.getElementById("pm-alarm-overlay")?.classList.remove("open");
  const btn = document.getElementById("pm-alarm-btn");
  if (btn) {
    btn.style.right = "28px";
    btn.style.borderRadius = "14px";
    btn.style.boxShadow = "0 4px 10px rgba(59,130,246,0.15)";
  }
};

window._setAlarmFilter = function (key) {
  _activeFilter = key;
  _fetchAndRenderHistory();
};

window._setAlarmStatus = function (status) {
  _activeStatus = status;
  _fetchAndRenderHistory();
};

window._toggleSection = function (key) {
  if (_collapsedSections.has(key)) _collapsedSections.delete(key);
  else _collapsedSections.add(key);
  _fetchAndRenderHistory();
};

window._navToSection = function (sectionId) {
  window._closeAlarmSidebar();
  requestAnimationFrame(() => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 20;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  });
};
