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

    // 이미지 테이블 (소유자 포함)
    const imageRows = (data.recent_images || []).map(img => `
        <tr>
            <td style="font-weight:500; font-size:12px;">${esc(img.name)}</td>
            <td style="font-family:var(--font-mono); font-size:11px;">${esc((img.tags || []).join(', '))}</td>
            <td style="font-size:11px; color:var(--text-muted);">${esc(img.owner || '-')}</td>
        </tr>
    `).join('') || '<tr><td colspan="3" style="color:var(--text-muted); text-align:center; padding:20px;">등록된 이미지 없음</td></tr>';

    // 노트북 테이블
    const nbRows = (data.recent_notebooks || []).map(nb => {
        const badge = nb.status === 'Running' ? 'success' : nb.status === 'Stopped' ? 'danger' : 'warning';
        return `<tr>
            <td style="font-weight:500; font-size:12px;">${esc(nb.name)}</td>
            <td><span class="pm-badge pm-badge-${badge}">${esc(nb.status)}</span></td>
            <td class="pm-table-mono" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;">${esc(nb.image.split('/').pop())}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="3" style="color:var(--text-muted); text-align:center; padding:20px;">실행 중인 컨테이너 없음</td></tr>';

    // AutoML 최근 jobs
    const jobRows = (data.automl_jobs || []).map(j => {
        const st = {QUEUED:'#f5e6ff',PENDING:'#e9ecef',RUNNING:'#e8f4ff',SUCCEEDED:'#d4edda',FAILED:'#f8d7da',STOPPED:'#fff3cd',CANCELED:'#e9ecef'}[j.status] || '#e9ecef';
        const best = j.best_run?.best;
        return `<tr>
            <td style="font-size:12px;">
                <div style="font-weight:500;">${esc(j.experiment_name?.replace('automl-','').slice(0,30) || j.job_id)}</div>
                <div style="font-size:10px; color:var(--text-muted);">${esc(j.submitted_by || '-')}</div>
            </td>
            <td><span style="padding:2px 6px; border-radius:4px; font-size:10px; font-weight:600; background:${st};">${esc(j.status)}</span></td>
            <td style="font-family:var(--font-mono); font-size:11px;">${best ? `${esc(best.model_id)} ${esc(j.best_run.metric)}=${(+best.best_metric).toFixed(2)}` : '-'}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="3" style="color:var(--text-muted); text-align:center; padding:20px;">AutoML 작업 없음</td></tr>';

    return `
    <div class="pm-page-header">
        <div class="pm-page-title">Dashboard</div>
        <div class="pm-page-desc">예측매니저 시스템 현황</div>
    </div>

    ${hw.model ? `
    <div style="background:#fff8e1; border:1px solid #ffe082; padding:10px 14px; border-radius:8px; font-size:12px; margin-bottom:16px;">
        <b>GPU 하드웨어</b>: ${esc(hw.model)} · ${esc(hw.vram_gb)}GB VRAM
        <div style="color:var(--text-muted); margin-top:4px; font-size:11px;">
            ⓘ GPU 수만큼 동시 작업 가능하지만, ${hw.vram_gb}GB 메모리는 공유되므로 큰 모델을 동시에 올리면 OOM 가능
        </div>
    </div>` : ''}

    <div class="pm-grid-3" style="margin-bottom:20px">
        <div class="pm-stat accent">
            <div class="pm-stat-label">IMAGES</div>
            <div class="pm-stat-value">${data.image_count}</div>
        </div>
        <div class="pm-stat success">
            <div class="pm-stat-label">CONTAINERS</div>
            <div class="pm-stat-value">${data.notebook_count}</div>
        </div>
        <div class="pm-stat warning">
            <div class="pm-stat-label">${gpuLabel}</div>
            <div class="pm-stat-value">${data.gpu_used} / ${data.gpu_total}</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${vramInfo}</div>
            <div class="pm-gpu-bar">
                <div class="pm-gpu-bar-fill" style="width:${gpuPct}%; background:${gpuColor}"></div>
            </div>
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

    <div class="pm-grid-2" style="margin-bottom:20px;">
        <div>
            <div class="pm-section-title">이미지 목록</div>
            <table class="pm-table">
                <thead><tr><th>이름</th><th>태그</th><th>소유자</th></tr></thead>
                <tbody>${imageRows}</tbody>
            </table>
        </div>
        <div>
            <div class="pm-section-title">실행 중인 컨테이너</div>
            <table class="pm-table">
                <thead><tr><th>이름</th><th>상태</th><th>이미지</th></tr></thead>
                <tbody>${nbRows}</tbody>
            </table>
        </div>
    </div>

    <div>
        <div class="pm-section-title">최근 AutoML 작업</div>
        <table class="pm-table">
            <thead><tr><th>실험 / 사용자</th><th>상태</th><th>결과</th></tr></thead>
            <tbody>${jobRows}</tbody>
        </table>
    </div>
    `;
}
