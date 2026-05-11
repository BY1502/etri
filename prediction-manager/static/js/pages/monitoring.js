async function renderMonitoring() {
    let data;
    try {
        data = await API.get('/api/monitoring/summary');
    } catch (e) {
        return `
        <div class="pm-page-header">
            <h1>MLOps 모니터링</h1>
        </div>
        <div style="background:#fee2e2; border:1px solid #fca5a5; padding:16px 20px; border-radius:8px; color:#b91c1c; font-size:13px;">
            지표를 불러올 수 없습니다. Prometheus 연결을 확인해주세요.
        </div>`;
    }

    const gpu = data.gpu || {};
    const sys = data.system || {};
    const allNull = [gpu.util_pct, gpu.mem_used_gb, sys.cpu_cores, sys.mem_used_gb].every(v => v === null || v === undefined);

    const prometheusWarning = allNull ? `
    <div style="background:#fff3cd; border:1px solid #fde68a; padding:10px 14px; border-radius:8px; font-size:12px; margin-bottom:16px; color:#92400e;">
        지표를 불러올 수 없습니다. Prometheus 연결을 확인해주세요.
    </div>` : '';

    const donutChart = (id, label, valueStr, subStr, pct, accent) => `
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
            <div style="position:relative; width:160px; height:82px; overflow:hidden;">
                <canvas id="${id}" width="160" height="160" data-pct="${pct ?? 0}" data-accent="${accent}" style="position:absolute; top:0; left:0;"></canvas>
            </div>
            <div style="display:flex; flex-direction:column; align-items:center; line-height:1.2;">
                <span style="font-size:22px; font-weight:700; font-family:var(--font-mono); color:#111827;">${esc(valueStr ?? '-')}</span>
                ${subStr ? `<span style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">${esc(subStr)}</span>` : ''}
            </div>
            <div style="font-size:13px; font-weight:600; color:${accent}; letter-spacing:0.5px; text-transform:uppercase;">${esc(label)}</div>
        </div>`;

    const gpuUtil = gpu.util_pct ?? null;
    const gpuMemUsed = gpu.mem_used_gb ?? null;
    const gpuMemTotal = gpu.mem_total_gb ?? null;
    const gpuMemPct = gpu.mem_pct ?? null;
    const gpuTemp = gpu.temp_c ?? null;
    const gpuPower = gpu.power_w ?? null;
    const cpuCores = sys.cpu_cores ?? null;
    const cpuTotal = sys.cpu_total_cores ?? null;
    const cpuPct = sys.cpu_pct ?? null;
    const memUsedGb = sys.mem_used_gb ?? null;
    const memTotalGb = sys.mem_total_gb ?? null;
    const memPct = sys.mem_pct ?? null;

    //API 데이터
    const ray = data.ray || {};
    const rayError = ray.error ?? true;
    const automl = data.automl || {};
    const automlError = automl.error ?? true;
    const automlJobs = automl.jobs || [];
    const kserve = data.kserve || {};
    const kserveError = kserve.error ?? true;
    const kserveEndpoints = kserve.endpoints || [];

    // 테스트용 mock data
    // const rayError = false;
    // const ray = { error: false, ready: true, running_jobs: [
    //     { job_id: 'raysubmit_abc123', name: 'lgbm-search', started_at: '2026-05-11 09:10' },
    //     { job_id: 'raysubmit_def456', name: 'xgb-tune-v2', started_at: '2026-05-11 10:30' },
    //     { job_id: 'raysubmit_ghi789', name: 'rf-optuna',   started_at: '2026-05-11 11:05' },
    // ]};
    // const automlError = false;
    // const automlJobs = [
    //     { name: 'xgb-tune-v1',    status: 'SUCCEEDED', submitted_by: 'researcher1@example.com', submitted_at: '2025-05-10 11:20' },
    //     { name: 'lgbm-search',    status: 'RUNNING',   submitted_by: 'admin@example.com',        submitted_at: '2025-05-11 09:10' },
    //     { name: 'rf-baseline',    status: 'FAILED',    submitted_by: 'researcher1@example.com', submitted_at: '2025-05-11 08:00' },
    //     { name: 'catboost-v2',    status: 'QUEUED',    submitted_by: 'researcher2@example.com', submitted_at: '2025-05-11 11:30' },
    //     { name: 'nn-tabular',     status: 'STOPPED',   submitted_by: 'admin@example.com',        submitted_at: '2025-05-09 15:00' },
    // ];
    // const kserveError = false;
    // const kserveEndpoints = [
    //     { name: 'iris-classifier',  namespace: 'kubeflow-user-a', ready: true  },
    //     { name: 'fraud-detector',   namespace: 'kubeflow-user-b', ready: true  },
    //     { name: 'churn-predictor',  namespace: 'kubeflow-user-a', ready: false },
    //     { name: 'sentiment-model',  namespace: 'kubeflow-user-b', ready: true  },
    //     { name: 'demand-forecast',  namespace: 'kubeflow-user-c', ready: false },
    // ];

    const timeAgo = (dateStr) => {
        const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (diff < 60) return `${diff}초 전`;
        if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
        return `${Math.floor(diff / 86400)}일 전`;
    };

    const statusBadge = (status) => {
        const colors = {
            SUCCEEDED: { bg: '#d4edda', color: '#155724' },
            RUNNING:   { bg: '#e8f4ff', color: '#1a56a8' },
            FAILED:    { bg: '#f8d7da', color: '#721c24' },
            STOPPED:   { bg: '#fff3cd', color: '#856404' },
            QUEUED:    { bg: '#f5e6ff', color: '#6f42c1' },
            PENDING:   { bg: '#e9ecef', color: '#495057' },
        };
        const c = colors[status] || { bg: '#e9ecef', color: '#495057' };
        return `<span style="padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; background:${c.bg}; color:${c.color};">${esc(status)}</span>`;
    };

    const automlRows = automlJobs.map(j => `
        <tr>
            <td>
                <div style="font-size:14px; font-weight:500;">${esc(j.name)}</div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${esc(j.submitted_by)}</div>
            </td>
            <td>${statusBadge(j.status)}</td>
            <td>
                <div style="font-size:13px; font-weight:500;">${timeAgo(j.submitted_at)}</div>
                <div style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono); margin-top:2px;">${esc(j.submitted_at)}</div>
            </td>
        </tr>`).join('');

    const kserveRows = kserveEndpoints.map(e => `
        <tr>
            <td style="font-size:14px; font-weight:500;">${esc(e.name)}</td>
            <td style="font-size:13px; color:var(--text-muted); font-family:var(--font-mono);">${esc(e.namespace)}</td>
            <td><span style="padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; background:${e.ready ? '#d4edda' : '#f8d7da'}; color:${e.ready ? '#155724' : '#721c24'};">${e.ready ? 'Ready' : 'Not Ready'}</span></td>
        </tr>`).join('');

    return `
    <div class="pm-page-header">
        <h1>MLOps 모니터링</h1>
        <p>GPU/CPU, Ray, AutoML, KServe 상태를 모니터링 합니다.</p>
    </div>

    ${prometheusWarning}

    <div class="pm-monitor-2col">
        <div class="pm-monitor-card">
            <div class="pm-section-title" style="font-size:16px; margin-bottom:20px;">GPU</div>
            <div class="pm-donut-row" style="margin-bottom:20px;">
                ${donutChart('chart-gpu-util', 'GPU 사용률', gpuUtil !== null ? gpuUtil + '%' : null, ' ', gpuUtil, '#f59e0b')}
                ${donutChart('chart-gpu-mem', 'GPU 메모리', gpuMemUsed !== null ? gpuMemUsed.toFixed(1) + ' GB' : null, gpuMemTotal !== null ? gpuMemTotal + ' GB' : '', gpuMemPct, '#ef4444')}
            </div>
            <div style="border-top:1px solid #e5e7eb; padding-top:16px;">
                <div class="pm-section-title" style="font-size:16px; margin-bottom:20px;">시스템</div>
                <div class="pm-donut-row">
                    ${donutChart('chart-cpu', 'CPU', cpuCores !== null ? cpuCores.toFixed(2) + ' core' : null, cpuTotal !== null ? cpuTotal + ' core' : '', cpuPct, '#3b82f6')}
                    ${donutChart('chart-mem', '메모리', memUsedGb !== null ? memUsedGb.toFixed(1) + ' GB' : null, memTotalGb !== null ? memTotalGb + ' GB' : '', memPct, '#8b5cf6')}
                </div>
            </div>
        </div>
        <div class="pm-monitor-card">
            <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">GPU 사용 추이</div>
            <canvas id="chart-gpu-trend" height="120"></canvas>
            <div style="border-top:1px solid #e5e7eb; margin-top:16px; padding-top:16px; display:grid; grid-template-columns:7fr 3fr; gap:10px;">
                ${(() => {
                    const pct = gpuTemp !== null ? Math.min(100, Math.round(gpuTemp)) : 0;
                    const fillColor = pct >= 85 ? '#dc3545' : pct >= 75 ? '#f59e0b' : '#22c55e';
                    const label = gpuTemp === null ? '-' : pct >= 85 ? '위험' : pct >= 75 ? '주의' : '정상';
                    const labelColor = pct >= 85 ? '#dc3545' : pct >= 75 ? '#f59e0b' : '#155724';
                    return `
                    <div style="background:#f3f4f6; border-radius:8px; padding:14px 16px; display:flex; flex-direction:column; align-items:center; gap:8px;">
                        <div style="font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px;">온도</div>
                        <div style="font-size:22px; font-weight:700; font-family:var(--font-mono); color:${labelColor}; margin-bottom:6px;">${gpuTemp !== null ? gpuTemp + '°C' : '-'} <span style="font-size:12px;">${label}</span></div>
                        <div style="position:relative; width:100%; height:14px; background:#e5e7eb; border-radius:7px; overflow:hidden;">
                            <div style="position:absolute; left:0; top:0; bottom:0; width:${pct}%; background:${fillColor}; border-radius:7px; transition:width 0.4s;"></div>
                            <div style="position:absolute; left:75%; top:0; bottom:0; width:1px; background:rgba(0,0,0,0.2);"></div>
                            <div style="position:absolute; left:85%; top:0; bottom:0; width:1px; background:rgba(0,0,0,0.2);"></div>
                        </div>
                        <div style="font-size:10px; color:var(--text-muted);">기준 75° / 85°</div>
                    </div>`;
                })()}
                <div style="background:#f3f4f6; border-radius:8px; padding:14px 16px; text-align:center;">
                    <div style="font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">전력</div>
                    <div style="font-size:26px; font-weight:700; font-family:var(--font-mono); color:#111827;">${gpuPower !== null ? gpuPower + ' W' : '-'}</div>
                </div>
            </div>
        </div>
    </div>
    <div class="pm-monitor-2col-bottom">
        <div class="pm-monitor-col">
        <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:20px 24px;">
            <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">Ray 클러스터</div>
            <div style="display:flex; align-items:center; gap:24px; margin-bottom:16px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:12px; height:12px; border-radius:50%; background:${rayError ? '#d1d5db' : ray.ready ? '#22c55e' : '#ef4444'};"></div>
                    <span style="font-size:15px; font-weight:600; color:${rayError ? '#9ca3af' : ray.ready ? '#15803d' : '#b91c1c'};">${rayError ? '-' : ray.ready ? 'Ready' : 'Not Ready'}</span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:center; background:#f3f4f6; border-radius:8px; padding:8px 20px;">
                    <span style="font-size:24px; font-weight:700; color:#111827; font-family:var(--font-mono);">${rayError ? '-' : ray.running_jobs.length}</span>
                    <span style="font-size:11px; color:var(--text-muted);">실행 중 Job</span>
                </div>
            </div>
            <div style="max-height:260px; overflow-y:auto; border-radius:6px;">
            <table class="pm-table">
                <thead style="position:sticky; top:0; background:#fff; z-index:1;"><tr><th>Job ID</th><th>이름</th><th>시작 시간 / 경과</th></tr></thead>
                <tbody>${
                    rayError
                        ? `<tr><td colspan="3" style="text-align:center; padding:20px 0; font-size:13px; color:#9ca3af;">정보를 불러올 수 없습니다</td></tr>`
                        : ray.running_jobs.length === 0
                            ? `<tr><td colspan="3" style="text-align:center; padding:20px 0; font-size:13px; color:#9ca3af;">실행 중인 job이 없습니다</td></tr>`
                            : ray.running_jobs.map(j => `
                            <tr>
                                <td style="font-family:var(--font-mono); font-size:13px; color:var(--text-muted);">${esc(j.job_id)}</td>
                                <td style="font-size:14px; font-weight:500;">${esc(j.name)}</td>
                                <td>
                                    <div style="font-size:13px; font-weight:500;">${timeAgo(j.started_at)}</div>
                                    <div style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono); margin-top:2px;">${esc(j.started_at)}</div>
                                </td>
                            </tr>`).join('')
                }</tbody>
            </table>
            </div>
        </div>

        <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:20px 24px;">
            <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">KServe Endpoint</div>
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:16px;">
                ${[
                    { label: '전체',      value: kserveError ? '-' : kserveEndpoints.length, color: '#6b7280', bg: '#f3f4f6' },
                    { label: 'Ready',    value: kserveError ? '-' : kserveEndpoints.filter(e => e.ready).length, color: '#155724', bg: '#d4edda' },
                    { label: 'Not Ready', value: kserveError ? '-' : kserveEndpoints.filter(e => !e.ready).length, color: '#721c24', bg: '#f8d7da' },
                ].map(s => `
                    <div style="background:${s.bg}; border-radius:8px; padding:12px 16px; text-align:center;">
                        <div style="font-size:24px; font-weight:700; color:${s.color}; font-family:var(--font-mono);">${s.value}</div>
                        <div style="font-size:11px; color:${s.color}; margin-top:2px;">${s.label}</div>
                    </div>`).join('')}
            </div>
            <div style="max-height:260px; overflow-y:auto; border-radius:6px;">
            <table class="pm-table">
                <thead style="position:sticky; top:0; background:#fff; z-index:1;"><tr><th>이름</th><th>Namespace</th><th>상태</th></tr></thead>
                <tbody>${
                    kserveError
                        ? `<tr><td colspan="3" style="text-align:center; padding:20px 0; font-size:13px; color:#9ca3af;">정보를 불러올 수 없습니다</td></tr>`
                        : kserveEndpoints.length === 0
                            ? `<tr><td colspan="3" style="text-align:center; padding:20px 0; font-size:13px; color:#9ca3af;">등록된 endpoint가 없습니다</td></tr>`
                            : kserveRows
                }</tbody>
            </table>
            </div>
        </div>
        </div>
        <div class="pm-monitor-col">
        <div class="pm-monitor-card">
            <div class="pm-section-title" style="font-size:16px; margin-bottom:16px;">AutoML 최근 Job</div>
            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-bottom:16px;">
                ${[
                    { label: '전체',  value: automlError ? '-' : automlJobs.length, color: '#6b7280', bg: '#f3f4f6' },
                    { label: '실행중', value: automlError ? '-' : automlJobs.filter(j => j.status === 'RUNNING').length, color: '#1a56a8', bg: '#e8f4ff' },
                    { label: '성공',  value: automlError ? '-' : automlJobs.filter(j => j.status === 'SUCCEEDED').length, color: '#155724', bg: '#d4edda' },
                    { label: '실패',  value: automlError ? '-' : automlJobs.filter(j => j.status === 'FAILED').length, color: '#721c24', bg: '#f8d7da' },
                ].map(s => `
                    <div style="background:${s.bg}; border-radius:8px; padding:12px 16px; text-align:center;">
                        <div style="font-size:24px; font-weight:700; color:${s.color}; font-family:var(--font-mono);">${s.value}</div>
                        <div style="font-size:11px; color:${s.color}; margin-top:2px;">${s.label}</div>
                    </div>`).join('')}
            </div>
            <div style="max-height:260px; overflow-y:auto; border-radius:6px;">
            <table class="pm-table">
                <thead style="position:sticky; top:0; background:#fff; z-index:1;"><tr><th>이름 / 제출자</th><th>상태</th><th>제출 시간 / 경과</th></tr></thead>
                <tbody>${
                    automlError
                        ? `<tr><td colspan="3" style="text-align:center; padding:20px 0; font-size:13px; color:#9ca3af;">정보를 불러올 수 없습니다</td></tr>`
                        : automlJobs.length === 0
                            ? `<tr><td colspan="3" style="text-align:center; padding:20px 0; font-size:13px; color:#9ca3af;">제출된 job이 없습니다</td></tr>`
                            : automlRows
                }</tbody>
            </table>
            </div>
        </div>

        </div>
        </div>
    </div>
    `;
}

function setupMonitoringPage() {
    ['chart-gpu-util', 'chart-gpu-mem', 'chart-cpu', 'chart-mem'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const pct = parseFloat(el.dataset.pct) || 0;
        const accent = el.dataset.accent;
        const color = pct >= 90 ? '#dc3545' : pct >= 75 ? '#f59e0b' : accent;
        new Chart(el, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [pct, 100 - pct],
                    backgroundColor: [color, '#f3f4f6'],
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: false,
                rotation: -90,
                circumference: 280,
                cutout: '50%',
                layout: { padding: 0 },
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                animation: { duration: 600 },
            },
        });
    });

    const trendEl = document.getElementById('chart-gpu-trend');
    if (trendEl) {
        const now = Date.now();
        const labels = Array.from({ length: 13 }, (_, i) =>
            new Date(now - (12 - i) * 5 * 60000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        );
        // TODO: 실제 API 연동 시 아래 mock 데이터를 교체
        const utilData = [4, 12, 35, 72, 68, 55, 80, 91, 76, 60, 45, 30, 0];
        new Chart(trendEl, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'GPU 사용률 (%)',
                    data: utilData,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245,158,11,0.1)',
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#f59e0b',
                    borderWidth: 2,
                    fill: true,
                }],
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 11 }, color: '#9ca3af' } },
                    y: {
                        min: 0, max: 100,
                        grid: { color: '#f3f4f6' },
                        ticks: { font: { size: 11 }, color: '#9ca3af', callback: v => v + '%' },
                    },
                },
            },
        });
    }
}
