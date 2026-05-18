// K8s resource 문자열을 숫자(원하는 단위)로 파싱
function _parseCpu(v) {
    const s = String(v || '0').trim();
    if (s.endsWith('m')) return parseFloat(s) / 1000 || 0;
    return parseFloat(s) || 0;
}
function _parseMemBytes(v) {
    const s = String(v || '0').trim();
    const units = { Ki: 1024, Mi: 1024**2, Gi: 1024**3, Ti: 1024**4,
                    K: 1000, M: 1000**2, G: 1000**3, T: 1000**4 };
    for (const [suf, mul] of Object.entries(units)) {
        if (s.endsWith(suf)) return (parseFloat(s.slice(0, -suf.length)) || 0) * mul;
    }
    return parseFloat(s) || 0;
}
function _fmtCpu(cores) { return cores < 1 ? cores.toFixed(2) : cores.toFixed(1); }
function _fmtMem(bytes) {
    if (bytes >= 1024**3) return (bytes / 1024**3).toFixed(1) + ' Gi';
    if (bytes >= 1024**2) return (bytes / 1024**2).toFixed(0) + ' Mi';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' Ki';
    return bytes + ' B';
}

function _renderMyResource(m) {
    const cpuUsed = _parseCpu(m.used.cpu);
    const cpuQuota = _parseCpu(m.quota.cpu);
    const memUsed = _parseMemBytes(m.used.memory);
    const memQuota = _parseMemBytes(m.quota.memory);
    const stUsed = _parseMemBytes(m.used.storage || '0');
    const stQuota = _parseMemBytes(m.quota.storage || '0');
    const pvcUsed = parseInt(m.used.pvc) || 0;
    const pvcQuota = parseInt(m.quota.pvc) || 0;

    const card = (label, usedNum, quotaNum, usedStr, quotaStr, accent) => {
        const pct = quotaNum > 0 ? Math.min(100, Math.round(usedNum / quotaNum * 100)) : 0;
        const overBg = pct >= 90 ? '#fee2e2' : pct >= 75 ? '#fef3c7' : '#f3f4f6';
        const barColor = pct >= 90 ? '#dc3545' : pct >= 75 ? '#f59e0b' : accent;
        return `
        <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:14px 16px;">
          <div style="font-size:11px; font-weight:600; color:${accent}; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:8px;">${esc(label)}</div>
          <div style="display:flex; align-items:baseline; gap:4px; margin-bottom:10px;">
            <span style="font-size:22px; font-weight:700; font-family:var(--font-mono); color:#111827;">${esc(usedStr)}</span>
            <span style="font-size:12px; color:var(--text-muted); font-family:var(--font-mono);">/ ${esc(quotaStr)}</span>
          </div>
          <div style="position:relative; background:${overBg}; height:8px; border-radius:4px; overflow:hidden;">
            <div style="position:absolute; left:0; top:0; height:100%; width:${pct}%; background:${barColor};"></div>
          </div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">사용률 ${pct}%</div>
        </div>`;
    };
    return `
    <div style="margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px;">
        <div>
          <div style="font-size:13px; font-weight:600; color:#111827;">내 리소스</div>
          <div style="font-size:11px; color:var(--text-muted);">${esc(m.namespace)} · 현재 사용 / 할당량</div>
        </div>
        <div style="font-size:11px; color:var(--text-muted);">노트북 ${esc(m.notebook_count)}개</div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px;">
        ${card('CPU', cpuUsed, cpuQuota, _fmtCpu(cpuUsed), _fmtCpu(cpuQuota) + ' core', '#3b82f6')}
        ${card('메모리', memUsed, memQuota, _fmtMem(memUsed), _fmtMem(memQuota), '#8b5cf6')}
        ${card('PVC 개수', pvcUsed, pvcQuota, String(pvcUsed), String(pvcQuota), '#10b981')}
        ${card('스토리지', stUsed, stQuota, _fmtMem(stUsed), _fmtMem(stQuota), '#06b6d4')}
      </div>
    </div>`;
}

async function renderHome() {
    const data = await API.get('/api/dashboard/summary');
    const gpuPct = data.gpu_total > 0 ? Math.round((data.gpu_used / data.gpu_total) * 100) : 0;
    const gpuColor = gpuPct > 75 ? 'var(--danger)' : gpuPct > 50 ? 'var(--warning)' : 'var(--accent)';
    const hw = data.gpu_hardware || {};
    const gpuLabel = hw.model ? `GPU (${esc(hw.model)})` : 'GPU';
    const vramInfo = hw.vram_gb ? `${hw.vram_gb}GB VRAM (공유)` : '';
    const nbCounts = data.notebook_status_counts || {};
    const automlCounts = data.automl_status_counts || {};
    const nbRunning = nbCounts.Running || 0;
    const nbStopped = nbCounts.Stopped || 0;
    const nbProblem = Math.max(0, (data.notebook_count || 0) - nbRunning - nbStopped);
    const automlActive = (automlCounts.RUNNING || 0) + (automlCounts.PENDING || 0) + (automlCounts.QUEUED || 0);
    const automlFailed = (automlCounts.FAILED || 0) + (automlCounts.STOPPED || 0) + (automlCounts.CANCELED || 0);

    const pct = (used, quota) => quota > 0 ? Math.round((used / quota) * 100) : 0;
    const resourceAlerts = [];
    if (data.my_resource) {
        const r = data.my_resource;
        const cpuPct = pct(_parseCpu(r.used.cpu), _parseCpu(r.quota.cpu));
        const memPct = pct(_parseMemBytes(r.used.memory), _parseMemBytes(r.quota.memory));
        const stPct = pct(_parseMemBytes(r.used.storage || '0'), _parseMemBytes(r.quota.storage || '0'));
        const pvcPct = pct(parseInt(r.used.pvc) || 0, parseInt(r.quota.pvc) || 0);
        [
            ['CPU', cpuPct],
            ['메모리', memPct],
            ['스토리지', stPct],
            ['PVC', pvcPct],
        ].forEach(([label, value]) => {
            if (value >= 90) resourceAlerts.push(`${label} 사용률 ${value}%`);
        });
    }

    const alerts = [];
    if (data.gpu_total > 0 && data.gpu_available <= 0) {
        alerts.push({ level: 'danger', title: 'GPU 여유 없음', desc: `${data.gpu_used}/${data.gpu_total} 사용 중` });
    } else if (gpuPct >= 75) {
        alerts.push({ level: 'warning', title: 'GPU 사용률 높음', desc: `${data.gpu_used}/${data.gpu_total} 사용 중` });
    }
    if (nbProblem > 0) {
        alerts.push({ level: 'warning', title: '점검 필요한 컨테이너', desc: `${nbProblem}개가 Running/Stopped 외 상태` });
    }
    if (automlFailed > 0) {
        alerts.push({ level: 'danger', title: '실패 또는 중단된 AutoML', desc: `${automlFailed}개 작업 확인 필요` });
    }
    resourceAlerts.forEach((desc) => alerts.push({ level: 'warning', title: '리소스 한도 근접', desc }));
    if (alerts.length === 0) {
        alerts.push({ level: 'success', title: '특이사항 없음', desc: '현재 주요 리소스와 작업 상태가 안정적입니다.' });
    }

    const alertRows = alerts.map(a => `
        <div class="pm-alert-item ${a.level}">
            <div>
                <div class="pm-alert-title">${esc(a.title)}</div>
                <div class="pm-alert-desc">${esc(a.desc)}</div>
            </div>
        </div>
    `).join('');

    const statusPill = (label, value, kind) => `
        <div class="pm-status-pill ${kind}">
            <span>${esc(label)}</span>
            <strong>${esc(value)}</strong>
        </div>
    `;

    // 사용자별 리소스 테이블 (admin only)
    const userTable = (data.user_resources || []).map(u => `
        <tr>
            <td>
                <div style="font-weight:600; font-size:12px;">${esc(u.email || '-')}</div>
                <div style="font-size:10px; color:var(--text-muted);">${esc(u.namespace)}</div>
            </td>
            <td style="font-family:var(--font-mono); font-size:12px;">
                <span style="font-weight:600;">${esc(u.used.cpu)}</span>
                <span style="color:var(--text-muted);">/ ${esc(u.quota.cpu)}</span>
            </td>
            <td style="font-family:var(--font-mono); font-size:12px;">
                <span style="font-weight:600;">${esc(u.used.memory)}</span>
                <span style="color:var(--text-muted);">/ ${esc(u.quota.memory)}</span>
            </td>
            <td style="font-family:var(--font-mono); font-size:12px;">
                <span style="font-weight:600;">${esc(u.used.gpu)}</span>
                <span style="color:var(--text-muted);">/ ${esc(u.quota.gpu)}</span>
            </td>
            <td style="font-family:var(--font-mono); font-size:12px;">
                <span style="font-weight:600;">${esc(u.used.pvc)}</span>
                <span style="color:var(--text-muted);">/ ${esc(u.quota.pvc)}</span>
            </td>
            <td style="text-align:center; font-size:12px;">${esc(u.notebook_count)}</td>
        </tr>
    `).join('');

    return `
    <div class="pm-page-header">
        <div class="pm-page-title">Dashboard</div>
        <div class="pm-page-desc">주요 지표와 점검이 필요한 상태를 한눈에 봅니다.</div>
    </div>

    <div class="pm-grid-4" style="margin-bottom:20px">
        <div class="pm-stat accent">
            <div class="pm-stat-label">IMAGES</div>
            <div class="pm-stat-value">${data.image_count}</div>
            <div class="pm-stat-sub">등록 이미지</div>
        </div>
        <div class="pm-stat success">
            <div class="pm-stat-label">CONTAINERS</div>
            <div class="pm-stat-value">${nbRunning} / ${data.notebook_count}</div>
            <div class="pm-stat-sub">Running / 전체</div>
        </div>
        <div class="pm-stat warning">
            <div class="pm-stat-label">${gpuLabel}</div>
            <div class="pm-stat-value">${data.gpu_used} / ${data.gpu_total}</div>
            <div class="pm-stat-sub">${esc(vramInfo || '사용 / 전체')}</div>
            <div class="pm-gpu-bar">
                <div class="pm-gpu-bar-fill" style="width:${gpuPct}%; background:${gpuColor}"></div>
            </div>
        </div>
        <div class="pm-stat ${automlFailed > 0 ? 'warning' : 'accent'}">
            <div class="pm-stat-label">AUTOML</div>
            <div class="pm-stat-value">${automlActive}</div>
            <div class="pm-stat-sub">진행 중 · 실패/중단 ${automlFailed}</div>
        </div>
    </div>

    ${data.my_resource ? _renderMyResource(data.my_resource) : ''}

    ${data.is_admin && (data.user_resources || []).length > 0 ? `
    <div style="margin-bottom:20px;">
        <div class="pm-section-title">사용자별 리소스 현황</div>
        <table class="pm-table">
            <thead>
                <tr>
                    <th>사용자</th>
                    <th>CPU (사용/할당)</th>
                    <th>메모리 (사용/할당)</th>
                    <th>GPU (사용/할당)</th>
                    <th>PVC (사용/할당)</th>
                    <th>노트북</th>
                </tr>
            </thead>
            <tbody>${userTable}</tbody>
        </table>
    </div>
    ` : ''}

    <div class="pm-grid-2">
        <div class="pm-panel">
            <div class="pm-section-title">상태 요약</div>
            <div class="pm-status-grid">
                ${statusPill('Running 컨테이너', nbRunning, nbProblem > 0 ? 'warning' : 'success')}
                ${statusPill('Stopped 컨테이너', nbStopped, 'muted')}
                ${statusPill('AutoML 진행 중', automlActive, automlActive > 0 ? 'info' : 'muted')}
                ${statusPill('AutoML 실패/중단', automlFailed, automlFailed > 0 ? 'danger' : 'success')}
            </div>
        </div>
        <div class="pm-panel">
            <div class="pm-section-title">알림</div>
            <div class="pm-alert-list">${alertRows}</div>
        </div>
    </div>
    `;
}
